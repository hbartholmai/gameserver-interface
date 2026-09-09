import { GoogleGenAI } from '@google/genai';
import { templateDefinitionSchema, type TemplateDefinition } from '@gsp/shared';
import type { Report } from './jobs.js';

export interface DraftRequest {
  /** Name des Spiels, wie ihn ein Mensch nennt. */
  game: string;
  /** Docker-Image, das der Server benutzen soll. */
  image: string;
  /** Freitext des Nutzers — Wünsche, Besonderheiten, bekannte Fallstricke. */
  notes: string;
  /** Bereits vergebene Kennungen, damit der Entwurf keine doppelt. */
  takenIds: string[];
}

export interface DraftResult {
  definition: TemplateDefinition;
  /** Was die Recherche ergeben hat, im Klartext — die Belege zum Nachprüfen. */
  research: string;
}

export interface DraftStatus {
  available: boolean;
  reason: string;
  model: string;
}

/**
 * Erzeugt einen Vorlagenentwurf mit Google Gemini.
 *
 * Gemini, weil sein kostenloses Kontingent beides mitbringt, was der Entwurf
 * braucht: die Google-Suche als Werkzeug und eine gegen ein JSON-Schema
 * erzwungene Ausgabe. Ein Panel-Betreiber, der ein paar Mal im Jahr eine Vorlage
 * anlegt, soll dafür keinen kostenpflichtigen Zugang brauchen.
 *
 * **Zwei Aufrufe statt einem**, obwohl Gemini Suche und Schema kombinieren kann:
 * Der erste liefert die Recherche als lesbaren Text, der im Editor über dem
 * Entwurf steht. Ein einzelner Aufruf gäbe nur Quell-URLs zurück — dann müsste
 * man jede öffnen, statt „SERVER_PASS setzt das Passwort, laut …“ direkt zu
 * lesen. Die Prüfbarkeit ist der Zweck der Übung.
 *
 * Der Sinn der Suche ist der Punkt aus `docs/entwicklungsprotokoll.md`:
 * „Env-Variablennamen und Portbelegungen der Community-Images gehören belegt.
 * Erfundene Namen fallen erst auf der Zielmaschine auf.“
 *
 * Der Entwurf wird **nie** automatisch gespeichert — er geht in den Editor,
 * mit der Recherche daneben, und durchläuft beim Speichern dieselbe
 * Schlüssigkeitsprüfung wie eine handgeschriebene Vorlage.
 */
export class DraftService {
  /** Ergebnisse fertiger Jobs, bis sie einmal abgeholt wurden. */
  private readonly ergebnisse = new Map<string, DraftResult>();

  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string,
  ) {}

  status(): DraftStatus {
    return {
      available: Boolean(this.apiKey),
      reason: this.apiKey
        ? 'bereit'
        : 'Kein API-Schlüssel hinterlegt — GSP_GEMINI_API_KEY setzen und das Panel neu starten.',
      model: this.model,
    };
  }

  remember(jobId: string, ergebnis: DraftResult): void {
    this.ergebnisse.set(jobId, ergebnis);
  }

  /** Holt ein Ergebnis ab und gibt den Speicher frei. */
  take(jobId: string): DraftResult | null {
    const ergebnis = this.ergebnisse.get(jobId);
    if (ergebnis) this.ergebnisse.delete(jobId);
    return ergebnis ?? null;
  }

  async draft(request: DraftRequest, report: Report): Promise<DraftResult> {
    if (!this.apiKey) throw new Error('Kein API-Schlüssel hinterlegt');
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    report(10, 'Dokumentation wird gesucht');
    const research = await this.recherche(ai, request);

    report(70, 'Vorlage wird geformt');
    const entwurf = await this.formen(ai, request, research);

    report(95, 'Entwurf wird geprüft');
    const definition = templateDefinitionSchema.parse(ohneNull(entwurf));
    return { definition, research };
  }

  /** Schritt 1: Google-Suche, freier Text. */
  private async recherche(ai: GoogleGenAI, request: DraftRequest): Promise<string> {
    const antwort = await this.rufe(() =>
      ai.models.generateContent({
        model: this.model,
        contents: rechercheAuftrag(request),
        config: {
          // Die Suche läuft serverseitig in einem Durchgang — anders als bei
          // Anbietern, deren Werkzeuglauf zwischendurch pausiert.
          tools: [{ googleSearch: {} }],
        },
      }),
    );

    const text = antwort.text?.trim();
    if (!text) throw new Error('Die Recherche lieferte keinen Text.');
    return text;
  }

  /** Schritt 2: ohne Werkzeuge, Ausgabe gegen das Entwurfsschema erzwungen. */
  private async formen(
    ai: GoogleGenAI,
    request: DraftRequest,
    research: string,
  ): Promise<unknown> {
    const antwort = await this.rufe(() =>
      ai.models.generateContent({
        model: this.model,
        contents: [
          `Spiel: ${request.game}`,
          `Docker-Image: ${request.image}`,
          `Bereits vergebene Kennungen (nicht benutzen): ${request.takenIds.join(', ') || 'keine'}`,
          request.notes ? `Hinweise des Betreibers: ${request.notes}` : '',
          '',
          '--- Recherche ---',
          research,
        ]
          .filter(Boolean)
          .join('\n'),
        config: {
          systemInstruction: FORM_ANWEISUNG,
          responseMimeType: 'application/json',
          // `responseJsonSchema` nimmt echtes JSON Schema; `responseSchema`
          // erwartet Geminis eigenen Type-Dialekt.
          responseJsonSchema: ENTWURF_SCHEMA,
        },
      }),
    );

    const text = antwort.text?.trim();
    if (!text) throw new Error('Der Entwurf blieb leer.');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Der Entwurf war kein gültiges JSON.');
    }
  }

  /**
   * Übersetzt die Fehler der API in Sätze, die im Panel etwas erklären.
   *
   * Bei einem kostenlosen Kontingent ist das keine Kür: „Interner Fehler“ neben
   * einem erschöpften Tageslimit lässt den Betreiber im Dunkeln, während die
   * Lösung schlicht Abwarten wäre.
   */
  private async rufe<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);

      if (/429|RESOURCE_EXHAUSTED|quota/i.test(text)) {
        throw new Error(
          'Das kostenlose Kontingent ist erschöpft — 10 Anfragen pro Minute, 1.500 pro Tag, ' +
            '5.000 Suchen im Monat. Später erneut versuchen.',
        );
      }
      if (/404|NOT_FOUND|is not found|not supported/i.test(text)) {
        throw new Error(
          `Das Modell „${this.model}“ ist unter diesem Schlüssel nicht verfügbar. ` +
            'GSP_GEMINI_MODELL prüfen — die Kennungen ändern sich.',
        );
      }
      if (/40[13]|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(text)) {
        throw new Error('Der Gemini-Schlüssel wurde abgelehnt. GSP_GEMINI_API_KEY prüfen.');
      }
      if (/schema/i.test(text)) {
        // Google lehnt sehr große oder tief verschachtelte Schemas ab.
        throw new Error(`Gemini hat das Ausgabeschema abgelehnt: ${text}`);
      }
      throw new Error(`Gemini meldet: ${text}`);
    }
  }
}

function rechercheAuftrag(request: DraftRequest): string {
  return [
    `Ich richte einen dedizierten Server für „${request.game}“ auf Basis des Docker-Images \`${request.image}\` ein.`,
    '',
    'Suche die Dokumentation dieses Images und trage zusammen, was ich brauchen werde:',
    '- Die Umgebungsvariablen, die das Image auswertet, mit genauer Schreibweise und Bedeutung.',
    '- Welche Ports der Server belegt, mit Protokoll (tcp/udp).',
    '- Welche Verzeichnisse im Container die Welt- und Konfigurationsdaten enthalten.',
    '- Ob der Server RCON oder eine Steam-Abfrage (A2S) anbietet, und über welchen Port.',
    '- Ob und wo Mods abgelegt werden.',
    '- Beispielhafte Logzeilen: Beitritt eines Spielers, Abgang, und die Zeile, an der man erkennt, dass der Server fertig hochgefahren ist.',
    '',
    request.notes ? `Zusätzliche Hinweise des Betreibers: ${request.notes}` : '',
    '',
    'Nenne zu jeder Angabe, woher sie stammt. Wenn du etwas nicht belegen kannst, schreibe das ausdrücklich hin, statt zu raten — eine erfundene Variable fällt erst auf der Zielmaschine auf.',
  ]
    .filter(Boolean)
    .join('\n');
}

const FORM_ANWEISUNG = [
  'Du füllst die Vorlagenbeschreibung eines Gameserver-Panels aus.',
  '',
  'Regeln:',
  '- Benutze ausschließlich Angaben aus der Recherche. Erfinde keine Umgebungsvariablen und keine Ports.',
  '- `env` bildet Formularfelder auf Umgebungsvariablen ab. Jedes `field` muss in `fields` vorkommen, jeder `port` in `ports`.',
  '- Passwörter: `secret: true` und `omitWhenEmpty: true`, damit eine leere Eingabe die Variable weglässt statt sie leer zu setzen.',
  '- Boolesche Felder brauchen `boolean` mit den Zeichenketten, die das Image erwartet (oft `TRUE`/`FALSE` oder `true`/`false`).',
  '- Log-Muster sind JavaScript-Ausdrücke als Zeichenkette. Bei `join` und `leave` muss **Gruppe 1** der Spielername sein. Halte sie einfach; verschachtelte Wiederholungen wie `(a+)+` werden abgelehnt.',
  '- `backup.paths` müssen innerhalb der angegebenen `volumes` liegen. `preCommands` nur, wenn es RCON gibt.',
  '- `fakeLog` sind Beispielzeilen im echten Format des Spiels, mit den Platzhaltern {time}, {name} und {n}. Sie müssen zu deinen eigenen Mustern passen.',
  '- Beschriftungen, Hilfetexte und Hinweise auf Deutsch. Feldkennungen und Variablennamen technisch, wie das Image sie erwartet.',
  '- Was du nicht belegen konntest, lässt du weg (`null`) statt zu raten.',
].join('\n');

/**
 * Das Ausgabeschema als JSON Schema, von Hand geschrieben.
 *
 * Nicht aus `templateDefinitionSchema` erzeugt, und das hat zwei Gründe: der
 * SDK-Helfer `zodOutputFormat` setzt Zod 4 voraus, das Projekt nutzt Zod 3 —
 * und die Definition arbeitet mit `.default()`, was für strukturierte Ausgaben
 * ungünstig ist, weil das Modell Optionales gern weglässt. Hier ist alles
 * verlangt; „nicht vorhanden“ wird als `null` ausgedrückt und danach entfernt.
 *
 * Strukturierte Ausgaben verlangen `additionalProperties: false` und ein
 * vollständiges `required` an jedem Objekt.
 */
function objekt(
  properties: Record<string, unknown>,
  beschreibung?: string,
): Record<string, unknown> {
  return {
    type: 'object',
    ...(beschreibung ? { description: beschreibung } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const MUSTER = objekt(
  {
    source: { type: 'string', description: 'Regulärer Ausdruck ohne Schrägstriche.' },
    flags: { type: 'string', description: 'Etwa „i“ für Groß-/Kleinschreibung, sonst leer.' },
  },
  'Ein regulärer Ausdruck als Daten.',
);

const ENTWURF_SCHEMA: Record<string, unknown> = objekt({
  id: { type: 'string', description: 'Kennung: Kleinbuchstaben, Ziffern, Bindestriche, 2–32 Zeichen.' },
  label: { type: 'string' },
  summary: { type: 'string', description: 'Ein Satz für die Auswahlkarte im Anlege-Wizard.' },
  image: { type: 'string' },
  defaultTag: { type: 'string' },
  defaultMemoryMb: { type: 'integer' },
  defaultCpus: { type: 'number' },
  notes: {
    type: 'array',
    items: { type: 'string' },
    description: 'Hinweise, die im Wizard und über der Konsole stehen.',
  },
  capabilities: objekt({
    console: { type: 'string', enum: ['rcon', 'readonly'] },
    players: { type: 'string', enum: ['rcon', 'a2s', 'log'] },
    mods: { type: 'string', enum: ['plugins', 'bepinex', 'none'] },
    moderation: { type: 'boolean', description: 'Serverseitiges Kick und Bann möglich?' },
  }),
  ports: {
    type: 'array',
    items: objekt({
      name: { type: 'string', description: 'Interner Name, etwa „game“ oder „query“.' },
      label: { type: 'string' },
      container: { type: 'integer' },
      protocol: { type: 'string', enum: ['tcp', 'udp'] },
      defaultHost: { type: 'integer' },
      internalOnly: { type: 'boolean', description: 'Nicht auf dem Host veröffentlichen (z. B. RCON).' },
    }),
  },
  volumes: {
    type: 'array',
    items: objekt({
      name: { type: 'string' },
      containerPath: { type: 'string' },
      role: { type: 'string', enum: ['data', 'config', 'mods'] },
    }),
  },
  fields: {
    type: 'array',
    items: objekt({
      id: { type: 'string' },
      label: { type: 'string' },
      type: { type: 'string', enum: ['text', 'password', 'number', 'select', 'boolean'] },
      default: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
      options: {
        type: 'array',
        items: objekt({ value: { type: 'string' }, label: { type: 'string' } }),
        description: 'Nur bei type=select, sonst leer.',
      },
      required: { type: 'boolean' },
      editable: { type: 'boolean', description: 'Nach dem Anlegen im Config-Reiter änderbar?' },
      restartRequired: { type: 'boolean' },
      secret: { type: 'boolean' },
      help: { type: 'string', description: 'Erklärt Grenzen des Spiels; leer, wenn nichts zu sagen ist.' },
    }),
  },
  env: {
    type: 'array',
    items: objekt({
      name: { type: 'string', description: 'Name der Umgebungsvariablen im Container.' },
      source: {
        anyOf: [
          objekt({ kind: { type: 'string', enum: ['const'] }, value: { type: 'string' } }),
          objekt({ kind: { type: 'string', enum: ['field'] }, field: { type: 'string' } }),
          objekt({ kind: { type: 'string', enum: ['port'] }, port: { type: 'string' } }),
          objekt({ kind: { type: 'string', enum: ['rconPassword'] } }),
          objekt({ kind: { type: 'string', enum: ['timezone'] } }),
        ],
      },
      fallback: { type: ['string', 'null'], description: 'Wert, wenn die Quelle nichts liefert.' },
      boolean: {
        anyOf: [
          objekt({ whenTrue: { type: 'string' }, whenFalse: { type: 'string' } }),
          { type: 'null' },
        ],
        description: 'Übersetzung eines booleschen Felds; null bei allen anderen Typen.',
      },
      trim: { type: 'boolean' },
      omitWhenEmpty: { type: 'boolean', description: 'Variable weglassen statt leer setzen.' },
    }),
  },
  logPatterns: objekt({
    join: MUSTER,
    leave: { anyOf: [MUSTER, { type: 'null' }] },
    ready: MUSTER,
    clean: {
      anyOf: [objekt({ pattern: MUSTER, replacement: { type: 'string' } }), { type: 'null' }],
      description: 'Entfernt Zeitstempel und Präfixe vom Zeilenanfang.',
    },
  }),
  backup: objekt({
    paths: { type: 'array', items: { type: 'string' } },
    preCommands: { type: 'array', items: { type: 'string' } },
    postCommands: { type: 'array', items: { type: 'string' } },
  }),
  adapter: objekt({
    queryPortName: { type: ['string', 'null'], description: 'Pflicht, wenn players=a2s.' },
    maxPlayersField: { type: ['string', 'null'], description: 'Feld mit der Slotzahl.' },
  }),
  fakeLog: objekt(
    {
      timeFormat: { type: 'string', enum: ['hms', 'dmy', 'iso'] },
      join: { type: 'string' },
      leave: { type: 'string' },
      ready: { type: 'string' },
      chatter: { type: 'string' },
    },
    'Beispielzeilen für den Betrieb ohne Docker; müssen zu den Mustern oben passen.',
  ),
  modsPath: { type: ['string', 'null'] },
  modExtensions: { type: 'array', items: { type: 'string' } },
});

/**
 * Das Entwurfsschema verlangt überall einen Wert und drückt „nicht vorhanden“
 * als `null` aus — sonst lässt das Modell optionale Felder gern ganz weg. Das
 * Definitionsschema kennt dafür `optional`, also verschwinden die Nullwerte
 * hier wieder.
 */
function ohneNull(wert: unknown): unknown {
  if (Array.isArray(wert)) return wert.map(ohneNull);
  if (wert && typeof wert === 'object') {
    const raus: Record<string, unknown> = {};
    for (const [schluessel, inhalt] of Object.entries(wert as Record<string, unknown>)) {
      if (inhalt === null) continue;
      raus[schluessel] = ohneNull(inhalt);
    }
    return raus;
  }
  return wert;
}

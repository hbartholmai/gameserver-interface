import Anthropic from '@anthropic-ai/sdk';
import { templateDefinitionSchema, type TemplateDefinition } from '@gsp/shared';
import type { Report } from './jobs.js';

const MODELL = 'claude-opus-5';

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
 * Erzeugt einen Vorlagenentwurf mit Claude.
 *
 * **Zwei Aufrufe statt einem**, aus zwei Gründen. Erstens vertragen sich
 * strukturierte Ausgaben nicht mit Zitaten, und die Websuche liefert zitierte
 * Ergebnisse. Zweitens sind Belegen und Formen ohnehin zwei Aufgaben: Schritt 1
 * sucht die Dokumentation des Images und schreibt auf, was dort steht;
 * Schritt 2 gießt das ohne Werkzeuge in das Vorlagenschema.
 *
 * Der Sinn der Suche ist genau der Punkt aus `docs/entwicklungsprotokoll.md`:
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

  constructor(private readonly apiKey: string | undefined) {}

  status(): DraftStatus {
    return {
      available: Boolean(this.apiKey),
      reason: this.apiKey
        ? 'bereit'
        : 'Kein API-Schlüssel hinterlegt — GSP_ANTHROPIC_API_KEY setzen und das Panel neu starten.',
      model: MODELL,
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
    const client = new Anthropic({ apiKey: this.apiKey });

    report(10, 'Dokumentation wird gesucht');
    const research = await this.recherche(client, request);

    report(70, 'Vorlage wird geformt');
    const entwurf = await this.formen(client, request, research);

    report(95, 'Entwurf wird geprüft');
    const definition = templateDefinitionSchema.parse(ohneNull(entwurf));
    return { definition, research };
  }

  /** Schritt 1: Websuche, freier Text. */
  private async recherche(client: Anthropic, request: DraftRequest): Promise<string> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: rechercheAuftrag(request) },
    ];

    // Serverseitige Werkzeuge pausieren nach einer festen Zahl von Runden
    // (`pause_turn`); der Lauf wird durch erneutes Senden fortgesetzt.
    for (let runde = 0; runde < 6; runde += 1) {
      const antwort = await client.beta.messages.create({
        model: MODELL,
        max_tokens: 8000,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
        messages,
      });

      if (antwort.stop_reason === 'refusal') {
        throw new Error(
          'Die Anfrage wurde abgelehnt. Formuliere sie anders oder trage die Vorlage von Hand ein.',
        );
      }

      if (antwort.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: antwort.content });
        continue;
      }

      const text = antwort.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      if (!text) throw new Error('Die Recherche lieferte keinen Text.');
      return text;
    }

    throw new Error('Die Recherche kam nicht zum Ende. Bitte erneut versuchen.');
  }

  /** Schritt 2: ohne Werkzeuge, Ausgabe gegen das Entwurfsschema erzwungen. */
  private async formen(
    client: Anthropic,
    request: DraftRequest,
    research: string,
  ): Promise<unknown> {
    const antwort = await client.messages.create({
      model: MODELL,
      max_tokens: 16000,
      system: FORM_ANWEISUNG,
      messages: [
        {
          role: 'user',
          content: [
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
        },
      ],
      output_config: { format: { type: 'json_schema', schema: ENTWURF_SCHEMA } },
    });

    if (antwort.stop_reason === 'refusal') throw new Error('Die Anfrage wurde abgelehnt.');
    if (antwort.stop_reason === 'max_tokens') {
      throw new Error('Der Entwurf wurde abgeschnitten. Bitte mit weniger Wünschen erneut versuchen.');
    }

    const text = antwort.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Der Entwurf war kein gültiges JSON.');
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

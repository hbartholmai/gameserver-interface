import { GoogleGenAI } from '@google/genai';
import { templateDefinitionSchema, type TemplateDefinition } from '@gsp/shared';
import { imageDokuHolen } from './image-doku.js';
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
 * **Die Recherche macht kein Modell**, sondern `image-doku.ts`: sie holt die
 * Beschreibung des Images bei Docker Hub und, wo nötig, das README des
 * verlinkten Repositories. Googles Suchwerkzeug ist im kostenlosen Kontingent
 * nicht enthalten (`RESOURCE_EXHAUSTED` schon beim ersten Aufruf) — und die
 * Primärquelle ist der bessere Beleg als eine Sammlung von Suchtreffern.
 *
 * Damit bleibt für das Modell nur eine Aufgabe: die Dokumentation in das
 * Vorlagenschema gießen. Das ist der Punkt aus `docs/entwicklungsprotokoll.md`:
 * „Env-Variablennamen und Portbelegungen der Community-Images gehören belegt.
 * Erfundene Namen fallen erst auf der Zielmaschine auf.“ Belegt sind sie jetzt
 * nachweislich, weil der Text aus der Quelle stammt und nicht aus dem Modell.
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

    report(10, 'Dokumentation wird geholt');
    const doku = await imageDokuHolen(request.image);
    // Die Belege, die im Editor über dem Entwurf stehen: die Quellen zuerst,
    // damit erkennbar ist, worauf sich der Entwurf stützt.
    const research = [`Quellen: ${doku.quellen.join(', ')}`, '', doku.text].join('\n');

    report(40, 'Vorlage wird geformt');
    const entwurf = await this.formen(ai, request, doku.text);

    report(95, 'Entwurf wird geprüft');
    const definition = templateDefinitionSchema.parse(ohneNull(entwurf));
    return { definition, research };
  }

  /** Formt die geholte Dokumentation in das Vorlagenschema. */
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
      return await mitWiederholung(fn);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);

      if (istUeberlastet(text)) {
        throw new Error(
          `Das Modell „${this.model}“ ist überlastet und war es auch nach mehreren Versuchen. ` +
            'Später erneut versuchen, oder über GSP_GEMINI_MODELL ein anderes wählen — ' +
            'die jeweils neueste Generation ist am stärksten gefragt.',
        );
      }
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(text)) {
        throw new Error(
          'Das kostenlose Kontingent ist erschöpft — 10 Anfragen pro Minute, 1.500 pro Tag. ' +
            'Später erneut versuchen.',
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

/** Überlastung des Modells, im Unterschied zu einem erschöpften Kontingent. */
function istUeberlastet(text: string): boolean {
  return /503|UNAVAILABLE|high demand|overloaded/i.test(text);
}

/**
 * Wiederholt einen Aufruf, wenn das Modell gerade überlastet ist.
 *
 * Auf gefragten Modellen ist das kein Randfall: Im Test antwortete die jeweils
 * neueste Generation durchgehend mit „high demand“, während die darunter lief.
 * Ohne Wiederholung wäre ein halb fertiger Entwurf verloren, obwohl ein paar
 * Sekunden Warten gereicht hätten.
 */
async function mitWiederholung<T>(fn: () => Promise<T>, versuche = 3): Promise<T> {
  let letzter: unknown;
  for (let i = 0; i < versuche; i += 1) {
    try {
      return await fn();
    } catch (err) {
      letzter = err;
      const text = err instanceof Error ? err.message : String(err);
      // Nur bei Überlastung erneut versuchen. Ein falscher Schlüssel oder ein
      // abgelehntes Schema werden beim zweiten Mal genauso falsch sein.
      if (!istUeberlastet(text) || i === versuche - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw letzter;
}

const FORM_ANWEISUNG = [
  'Du füllst die Vorlagenbeschreibung eines Gameserver-Panels aus.',
  '',
  'Regeln:',
  '- Benutze ausschließlich Angaben aus der Recherche. Erfinde keine Umgebungsvariablen und keine Ports.',
  '- `env` bildet Formularfelder auf Umgebungsvariablen ab. Jedes `field` muss in `fields` vorkommen, jeder `port` in `ports`.',
  '- Passwörter: `secret: true` und `omitWhenEmpty: true`, damit eine leere Eingabe die Variable weglässt statt sie leer zu setzen.',
  '- Boolesche Felder brauchen `boolean` mit den Zeichenketten, die das Image erwartet (oft `TRUE`/`FALSE` oder `true`/`false`).',
  '- Log-Muster sind JavaScript-Ausdrücke als Zeichenkette. Bei `join` und `leave` muss **Gruppe 1** der Spielername sein.',
  '- Die Muster laufen gegen die **rohe** Logzeile, mitsamt Zeitstempel und Präfix der Engine. Ein Anker `^` am Anfang passt deshalb fast nie: `^(\w+) joined` greift bei `[12:34:56] [Server thread/INFO]: Kai joined` nicht. Ohne Anker schreiben, oder das Präfix im Muster mit abbilden.',
  '- Prüfe deine Muster gegen deine eigenen `fakeLog`-Zeilen, bevor du antwortest: das Beitrittsmuster muss aus der Beitrittszeile den Namen in Gruppe 1 liefern, das Startmuster auf der Startzeile greifen. Passt es nicht zusammen, wird die Vorlage abgelehnt.',
  '- Halte die Muster einfach; verschachtelte Wiederholungen wie `(a+)+` werden abgelehnt.',
  '- `backup.paths` müssen innerhalb der angegebenen `volumes` liegen. `preCommands` nur, wenn es RCON gibt.',
  '- `world` benennt **allein die Spielwelt**, nicht das ganze Datenverzeichnis: `parent` ist der Ordner, in dem sie liegt, `name` ihr Stamm (aus einem Formularfeld oder fest), `parts` die Teile mit gemeinsamem Stamm. Der erste Teil ist die Welt selbst und muss `required` sein. Beispiele: Minecraft `/data` + Feld `levelName` + Teile ``, `_nether`, `_the_end` (Verzeichnisse); Valheim `/config/worlds_local` + Feld `worldName` + Teile `.fwl`, `.db` (Dateien).',
  '- `world.parent` muss in einem Volume liegen **und** von `backup.paths` abgedeckt sein — sonst wäre die Sicherung vor dem Austausch wertlos und die Vorlage wird abgelehnt.',
  '- `world.accept` nur setzen, wenn die Welt eine einzelne Datei ist, die man so weitergeben kann (Terraria `.wld`, Factorio `.zip`). Lässt sich der Weltpfad nicht belegen oder liegt die Welt untrennbar mit Serverkonfiguration und Spielerprofilen in einem Ordner, dann `world: null` — ein Welt-Reiter über einer Serverkonfiguration verspräche etwas Falsches.',
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
  world: {
    anyOf: [
      objekt({
        parent: { type: 'string', description: 'Ordner im Container, in dem die Welt liegt.' },
        name: objekt(
          {
            kind: { type: 'string', enum: ['field', 'const'] },
            field: { type: ['string', 'null'], description: 'Bei kind=field: Kennung des Formularfelds.' },
            value: { type: ['string', 'null'], description: 'Bei kind=const: der feste Name.' },
          },
          'Woher der Stamm der Welt kommt.',
        ),
        parts: {
          type: 'array',
          description: 'Der erste Teil ist die Welt selbst und muss required sein.',
          items: objekt({
            suffix: { type: 'string', description: 'An den Stamm gehängt: „_nether“, „.fwl“; leer für den Hauptteil.' },
            type: { type: 'string', enum: ['dir', 'file'] },
            required: { type: 'boolean', description: 'Muss beim Einspielen im Archiv stehen.' },
          }),
        },
        markers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dateien, an denen eine Welt in einem fremden Archiv erkennbar ist, etwa level.dat.',
        },
        accept: {
          type: 'array',
          items: { type: 'string' },
          description: 'Endungen für eine rohe Einzeldatei statt eines ZIP, etwa .wld.',
        },
      }),
      { type: 'null' },
    ],
    description: 'Weltdaten für Herunterladen und Austausch. null, wenn nicht belegbar oder untrennbar von der Konfiguration.',
  },
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

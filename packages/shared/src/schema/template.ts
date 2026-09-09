import { z } from 'zod';
import { gameIdSchema, type LogLevel } from './common.js';
// Nur als Typ — zur Laufzeit gibt es dadurch keinen Zyklus mit dem
// Definitionsschema, das umgekehrt Werte von hier importiert.
import type { TemplateDefinition } from './template-definition.js';

/**
 * Ein Formularfeld einer Vorlage. Aus diesen Specs generiert das Frontend
 * sowohl den Anlege-Wizard als auch den Config-Reiter; das Backend leitet
 * daraus die Container-Umgebung ab.
 */
export const fieldSpecSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'password', 'number', 'select', 'boolean']),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().optional(),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  /** Feld erscheint nach dem Anlegen im Config-Reiter. */
  editable: z.boolean().default(true),
  /** Änderung wird erst nach einem Neustart der Instanz wirksam. */
  restartRequired: z.boolean().default(true),
  /** Wert wird in API-Antworten maskiert. */
  secret: z.boolean().default(false),
});
export type FieldSpec = z.infer<typeof fieldSpecSchema>;

export const portSpecSchema = z.object({
  name: z.string(),
  label: z.string(),
  container: z.number().int(),
  protocol: z.enum(['tcp', 'udp']),
  defaultHost: z.number().int(),
  /** Wird nicht auf den Host veröffentlicht (z. B. RCON). */
  internalOnly: z.boolean().default(false),
});
export type PortSpec = z.infer<typeof portSpecSchema>;

export const volumeSpecSchema = z.object({
  name: z.string(),
  containerPath: z.string(),
  role: z.enum(['data', 'config', 'mods']),
});
export type VolumeSpec = z.infer<typeof volumeSpecSchema>;

/**
 * Was eine Vorlage tatsächlich kann. Der Design-Prototyp nimmt an, dass jede
 * Instanz eine Befehlseingabe und Mods hat — real gilt das nur für Minecraft.
 * Die UI blendet Bedienelemente anhand dieser Flags aus oder deaktiviert sie.
 */
export const capabilitiesSchema = z.object({
  /** `rcon`: echte Befehlseingabe. `readonly`: nur Log-Stream. */
  console: z.enum(['rcon', 'readonly']),
  /** Woher die Spielerliste kommt. */
  players: z.enum(['rcon', 'a2s', 'log']),
  /** Ob und wie Mods verwaltet werden. */
  mods: z.enum(['plugins', 'bepinex', 'none']),
  /** Ob Kick/Bann serverseitig möglich ist. */
  moderation: z.boolean(),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

/** JSON-serialisierbarer Teil einer Vorlage — das liefert `GET /api/templates`. */
export const templateDescriptorSchema = z.object({
  id: gameIdSchema,
  label: z.string(),
  /** Kurzbeschreibung für die Auswahlkarte im Wizard. */
  summary: z.string(),
  image: z.string(),
  defaultTag: z.string(),
  ports: z.array(portSpecSchema),
  volumes: z.array(volumeSpecSchema),
  fields: z.array(fieldSpecSchema),
  capabilities: capabilitiesSchema,
  defaultMemoryMb: z.number().int(),
  defaultCpus: z.number(),
  /** Hinweis, der im Wizard und über der Konsole angezeigt wird. */
  notes: z.array(z.string()),
});
export type TemplateDescriptor = z.infer<typeof templateDescriptorSchema>;

export type FieldValues = Record<string, string | number | boolean>;

/** Vollständige Vorlage inklusive der nicht serialisierbaren Backend-Logik. */
export interface GameTemplate extends TemplateDescriptor {
  /**
   * Die Daten, aus denen diese Vorlage kompiliert wurde. Der Server braucht
   * sie für die Adapter-Hinweise, die Fake-Runtime und zum Zurückschreiben in
   * die Datenbank.
   */
  definition: TemplateDefinition;
  /** Bildet die Formularwerte auf Container-Umgebungsvariablen ab. */
  env(values: FieldValues, ctx: TemplateContext): Record<string, string>;
  /**
   * Startargumente des Containers. Leeres Ergebnis heißt: das Kommando des
   * Images bleibt unangetastet.
   */
  args(values: FieldValues, ctx: TemplateContext): string[];
  /** Optionale Konfigurationsdateien, die vor dem Start ins Volume geschrieben werden. */
  configFiles?(values: FieldValues, ctx: TemplateContext): ConfigFile[];
  logPatterns: LogPatterns;
  backup: BackupSpec;
  /**
   * Container-Pfad des Mod-Verzeichnisses. Fehlt, wenn die Vorlage keine Mods
   * unterstützt (`capabilities.mods === 'none'`).
   */
  modsPath?: string;
  /** Dateiendungen, die als Mod gelten. */
  modExtensions?: string[];
}

export interface TemplateContext {
  /** Auf dem Host veröffentlichte Ports, nach `PortSpec.name`. */
  hostPorts: Record<string, number>;
  /** Generiertes RCON-Passwort, sofern die Vorlage RCON nutzt. */
  rconPassword?: string;
  /** Zeitzone des Hosts. */
  timezone: string;
}

export interface ConfigFile {
  /** Pfad relativ zum Container-Volume-Wurzelpfad. */
  path: string;
  content: string;
}

export interface LogPatterns {
  /** Erkennt einen beitretenden Spieler; Gruppe 1 ist der Name. */
  join: RegExp;
  /** Erkennt einen abgemeldeten Spieler; Gruppe 1 ist der Name, falls vorhanden. */
  leave?: RegExp;
  /** Zeigt an, dass der Server fertig hochgefahren ist. */
  ready: RegExp;
  /** Stuft eine rohe Logzeile ein. */
  level(line: string): LogLevel;
  /** Entfernt Zeitstempel und Präfixe der Spiel-Engine aus der Zeile. */
  clean?(line: string): string;
}

export interface BackupSpec {
  /** Zu sichernde Pfade im Container. */
  paths: string[];
  /** Vor dem Sichern abzusetzende Konsolenbefehle (nur bei `console: 'rcon'`). */
  preCommands?: string[];
  /** Danach abzusetzende Befehle — laufen auch, wenn das Sichern fehlschlägt. */
  postCommands?: string[];
}

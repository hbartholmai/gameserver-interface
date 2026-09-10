import { z } from 'zod';
import { eventSchema, gameIdSchema, instanceStatusSchema, logLineSchema } from './common.js';
import { capabilitiesSchema } from './template.js';

export const playerSchema = z.object({
  name: z.string(),
  /** Spielzeit in Sekunden, `null` wenn die Vorlage das nicht liefert. */
  playtimeSec: z.number().nullable(),
  /** Ping in Millisekunden, `null` wenn unbekannt (Design zeigt dann `—`). */
  pingMs: z.number().nullable(),
});
export type Player = z.infer<typeof playerSchema>;

export const banSchema = z.object({
  name: z.string(),
  reason: z.string(),
  createdAt: z.string(),
});
export type Ban = z.infer<typeof banSchema>;

export const modSchema = z.object({
  /** Dateiname im Mod-Verzeichnis, dient als Kennung. */
  file: z.string(),
  name: z.string(),
  version: z.string(),
  enabled: z.boolean(),
  updateAvailable: z.boolean(),
  sizeBytes: z.number(),
});
export type Mod = z.infer<typeof modSchema>;

export const backupSchema = z.object({
  id: z.string(),
  file: z.string(),
  createdAt: z.string(),
  sizeBytes: z.number(),
  kind: z.enum(['auto', 'manuell']),
});
export type Backup = z.infer<typeof backupSchema>;

/** Ein Teil der Welt, wie er auf der Platte vorgefunden wurde. */
export const worldPartInfoSchema = z.object({
  name: z.string(),
  type: z.enum(['dir', 'file']),
  sizeBytes: z.number(),
  modifiedAt: z.string().nullable(),
  /**
   * Liegt auf der Platte. Fehlende optionale Teile werden ausdrücklich gezeigt
   * und nicht verschwiegen — sonst wundert sich der Betreiber über die Größe.
   */
  present: z.boolean(),
});
export type WorldPartInfo = z.infer<typeof worldPartInfoSchema>;

/** Auskunft für den Welt-Reiter. */
export const worldInfoSchema = z.object({
  name: z.string(),
  /** Feld, aus dem der Name stammt; `null` bei einem festen Namen. */
  nameField: z.string().nullable(),
  parts: z.array(worldPartInfoSchema),
  sizeBytes: z.number(),
  modifiedAt: z.string().nullable(),
  /** Der Download liefert eine rohe Datei statt eines ZIP. */
  raw: z.boolean(),
  /** Name, den der Download tragen wird — die Oberfläche nennt ihn vorab. */
  downloadName: z.string(),
  /** Endungen für den Dateidialog. */
  accept: z.array(z.string()),
  maxUploadBytes: z.number(),
});
export type WorldInfo = z.infer<typeof worldInfoSchema>;

/** Live-Messwerte einer Instanz. Kommen im 2-Sekunden-Takt über die WebSocket. */
export const metricsSchema = z.object({
  cpuPct: z.number(),
  memBytes: z.number(),
  memLimitBytes: z.number(),
  diskUsedBytes: z.number(),
  diskTotalBytes: z.number(),
  worldSizeBytes: z.number(),
  netRxBytesPerSec: z.number(),
  netTxBytesPerSec: z.number(),
  uptimeSec: z.number(),
  /** Tickrate als vorformatierter Text (`58,9 Hz`, `19,7 TPS`) oder `null`. */
  tps: z.string().nullable(),
  pingMs: z.number().nullable(),
  /** Verläufe als Ringpuffer mit `HISTORY_LENGTH` Werten für die Sparklines. */
  cpuHist: z.array(z.number()),
  ramHist: z.array(z.number()),
  playerHist: z.array(z.number()),
  /** Höchster Spielerstand seit Anlegen der Instanz. */
  peakPlayers: z.number(),
  /** Durchschnittliche Spielerzahl der letzten 24 Stunden. */
  avgPlayers24h: z.number(),
});
export type Metrics = z.infer<typeof metricsSchema>;

export const instanceSchema = z.object({
  id: z.string(),
  game: gameIdSchema,
  name: z.string(),
  /** Anzeige im Detailkopf, z. B. `Paper 1.21.4`. */
  version: z.string(),
  /** Verbindungsadresse `host:port`. */
  address: z.string(),
  provider: z.string(),
  status: instanceStatusSchema,
  running: z.boolean(),
  /** Ein Update-Job läuft gerade (Design: Buttonlabel `UPDATE LÄUFT…`). */
  updating: z.boolean(),
  /** Letzte Fehlermeldung, wenn `status === 'Fehler'`. */
  error: z.string().nullable(),
  maxPlayers: z.number(),
  /** Zugeteilte Kerne und Speichergrenze — Beschriftung der Übersichtskacheln. */
  cpus: z.number(),
  memoryMb: z.number(),
  capabilities: capabilitiesSchema,
  metrics: metricsSchema,
  players: z.array(playerSchema),
  bans: z.array(banSchema),
  /** Schlüssel-Wert-Paare für den Block `// WELT & KONFIGURATION`. */
  facts: z.array(z.tuple([z.string(), z.string()])),
  /** Werte der Vorlagenfelder, Geheimnisse maskiert. */
  settings: z.record(z.union([z.string(), z.number(), z.boolean()])),
  events: z.array(eventSchema),
  lastBackupAt: z.string().nullable(),
  lastBackupSizeBytes: z.number().nullable(),
  backupSchedule: z.string(),
  backupCount: z.number(),
  updateNote: z.string(),
  updateAvailable: z.boolean(),
  /**
   * Wie lange der letzte erfolgreiche Start gedauert hat, in Sekunden — von
   * „Startet“ bis zur Startmeldung im Log. `null` vor dem ersten Start. Die
   * Oberfläche zeigt das während des Hochfahrens als Anhaltspunkt; ein
   * Prozentsatz ist für diese Phase nicht ermittelbar.
   */
  lastBootSec: z.number().nullable(),
  /**
   * Die Vorlage wurde bearbeitet, seit dieser Container gebaut wurde. Die
   * Instanz läuft unverändert weiter; erst ein Neuaufbau übernimmt den neuen
   * Stand.
   */
  templateStale: z.boolean(),
  createdAt: z.string(),
});
export type Instance = z.infer<typeof instanceSchema>;

export const logsResponseSchema = z.object({ lines: z.array(logLineSchema) });
export type LogsResponse = z.infer<typeof logsResponseSchema>;

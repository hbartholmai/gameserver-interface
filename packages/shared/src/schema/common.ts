import { z } from 'zod';

/**
 * Instanzstatus. Die ersten drei stammen aus dem Design-Prototyp, `Stoppt` und
 * `Fehler` ergänzen die im Handoff als fehlend markierten Fehlerzustände.
 */
export const instanceStatusSchema = z.enum(['Online', 'Offline', 'Startet', 'Stoppt', 'Fehler']);
export type InstanceStatus = z.infer<typeof instanceStatusSchema>;

export const logLevelSchema = z.enum(['INFO', 'WARN', 'ERROR', 'CMD']);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const gameIdSchema = z.enum(['minecraft', 'valheim', 'enshrouded']);
export type GameId = z.infer<typeof gameIdSchema>;

/** Statusfarben aus den Design-Tokens (v2). */
export const STATUS_COLOR: Record<InstanceStatus, string> = {
  Online: '#3ee08f',
  Offline: '#8b98a8',
  Startet: '#f0b429',
  Stoppt: '#f0b429',
  Fehler: '#ff6b6b',
};

/** Ping-Farbskala aus den Design-Tokens: ≤55 ms grün, 56–90 ms gelb, >90 ms rot. */
export function pingColor(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '#8b98a8';
  if (ms <= 55) return '#3ee08f';
  if (ms <= 90) return '#f0b429';
  return '#ff6b6b';
}

/** Länge der Verlaufs-Ringpuffer — entspricht den 40 Messpunkten der Sparklines. */
export const HISTORY_LENGTH = 40;

/** Maximale Anzahl im Speicher gehaltener Logzeilen je Instanz. */
export const LOG_BUFFER_LENGTH = 140;

/** Maximale Anzahl Ereignisse je Instanz (Design: max. 9 sichtbar). */
export const EVENT_BUFFER_LENGTH = 50;

export const logLineSchema = z.object({
  /** HH:MM:SS */
  time: z.string(),
  level: logLevelSchema,
  text: z.string(),
});
export type LogLine = z.infer<typeof logLineSchema>;

export const eventSchema = z.object({
  /** HH:MM */
  time: z.string(),
  text: z.string(),
});
export type InstanceEvent = z.infer<typeof eventSchema>;

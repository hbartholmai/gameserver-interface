import { z } from 'zod';
import { eventSchema, instanceStatusSchema, logLineSchema } from './common.js';
import { metricsSchema, playerSchema } from './instance.js';
import { hostStatusSchema, jobSchema } from './api.js';

/**
 * Topics, die ein Client abonnieren kann. `logs` ist instanzgebunden und wird
 * als `logs:<instanceId>` adressiert.
 */
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), topic: z.string().max(128) }),
  z.object({ type: z.literal('unsubscribe'), topic: z.string().max(128) }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  /** Live-Messwerte aller Instanzen im Takt von `refreshMs`. */
  z.object({
    type: z.literal('metrics'),
    at: z.string(),
    host: hostStatusSchema,
    instances: z.array(
      z.object({
        id: z.string(),
        status: instanceStatusSchema,
        running: z.boolean(),
        updating: z.boolean(),
        error: z.string().nullable(),
        metrics: metricsSchema,
        players: z.array(playerSchema),
      }),
    ),
  }),
  /** Neue Logzeilen einer Instanz. */
  z.object({
    type: z.literal('log'),
    instanceId: z.string(),
    lines: z.array(logLineSchema),
  }),
  /** Neuer Eintrag in der Ereignisliste. */
  z.object({
    type: z.literal('event'),
    instanceId: z.string(),
    event: eventSchema,
  }),
  /** Fortschritt eines langlaufenden Jobs. */
  z.object({ type: z.literal('job'), job: jobSchema }),
  /**
   * Die Instanzliste hat sich strukturell geändert (angelegt, gelöscht,
   * Einstellungen gespeichert) — der Client lädt sie neu.
   */
  z.object({ type: z.literal('instances-changed') }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export const TOPIC = {
  metrics: 'metrics',
  events: 'events',
  jobs: 'jobs',
  logs: (instanceId: string) => `logs:${instanceId}`,
} as const;

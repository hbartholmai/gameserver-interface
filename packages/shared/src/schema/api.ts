import { z } from 'zod';
import { gameIdSchema } from './common.js';

export const loginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const setupRequestSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, 'Nur Buchstaben, Ziffern . _ -'),
  password: z.string().min(12, 'Mindestens 12 Zeichen').max(256),
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;

export const sessionInfoSchema = z.object({
  username: z.string(),
  csrfToken: z.string(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const portBindingSchema = z.object({
  name: z.string(),
  host: z.number().int().min(1).max(65535),
});

export const createInstanceRequestSchema = z.object({
  game: gameIdSchema,
  name: z.string().min(1).max(48),
  tag: z.string().max(64).optional(),
  ports: z.array(portBindingSchema),
  memoryMb: z.number().int().min(512).max(262144),
  cpus: z.number().min(0.5).max(64),
  /** Werte der Vorlagenfelder; gegen `FieldSpec` validiert. */
  settings: z.record(z.union([z.string(), z.number(), z.boolean()])),
  /** Cron-Ausdruck für automatische Backups, leer = deaktiviert. */
  backupCron: z.string().max(64).default('0 4 * * *'),
  backupKeepDays: z.number().int().min(1).max(365).default(7),
});
export type CreateInstanceRequest = z.infer<typeof createInstanceRequestSchema>;

export const updateSettingsRequestSchema = z.object({
  settings: z.record(z.union([z.string(), z.number(), z.boolean()])),
  /** Instanz nach dem Speichern neu starten (Design: `SPEICHERN & NEU STARTEN`). */
  restart: z.boolean().default(true),
});

export const commandRequestSchema = z.object({
  command: z.string().min(1).max(512),
});

export const banRequestSchema = z.object({
  reason: z.string().max(200).default('manuell gesperrt · dauerhaft'),
});

export const jobSchema = z.object({
  id: z.string(),
  instanceId: z.string().nullable(),
  kind: z.enum(['create', 'update', 'backup', 'restore', 'delete', 'draft']),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  /** 0–100, `null` wenn kein Fortschritt bekannt ist. */
  progress: z.number().nullable(),
  message: z.string(),
  /**
   * Rohe Byte-Zahlen des Image-Pulls, `null` außerhalb dieser Phase oder solange
   * die Gesamtgröße unbekannt ist. Die Formatierung entsteht im Frontend.
   */
  bytesDone: z.number().nullable().default(null),
  bytesTotal: z.number().nullable().default(null),
  error: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

/** Zustand des Container-Backends — speist das globale Fehlerbanner. */
export const hostStatusSchema = z.object({
  runtime: z.enum(['docker', 'fake']),
  reachable: z.boolean(),
  error: z.string().nullable(),
  version: z.string().nullable(),
  /** Mittelwert der CPU-Auslastung aller Instanzen, für die Kopfzeile. */
  hostCpuPct: z.number(),
  instancesTotal: z.number(),
  instancesOnline: z.number(),
  playersTotal: z.number(),
  nodeLabel: z.string(),
});
export type HostStatus = z.infer<typeof hostStatusSchema>;

export const errorResponseSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});

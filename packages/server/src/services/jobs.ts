import { randomUUID } from 'node:crypto';
import { TOPIC, type Job } from '@gsp/shared';
import type { Db } from '../db/index.js';
import type { Hub } from './hub.js';

/**
 * Meldet den Fortschritt eines Jobs. `bytes` nur während des Image-Pulls —
 * dort sind echte Zahlen bekannt, in den übrigen Phasen nicht.
 */
export type Report = (
  progress: number | null,
  message: string,
  bytes?: { done: number | null; total: number | null },
) => void;

/**
 * Langlaufende Aktionen (Image-Pull, Update, Backup, Wiederherstellung) laufen
 * als Job mit Fortschritt. Damit bekommt die UI die Übergangszustände aus dem
 * Design — „UPDATE LÄUFT…“, Pull-Fortschritt beim Anlegen — mit echten Daten
 * statt fester Wartezeiten.
 */
export class JobService {
  constructor(
    private readonly db: Db,
    private readonly hub: Hub,
  ) {}

  /**
   * Startet einen Job im Hintergrund und gibt ihn sofort zurück. Fehler werden
   * im Job vermerkt, nicht geworfen — der Aufruf ist bereits beantwortet.
   */
  start(
    kind: Job['kind'],
    instanceId: string | null,
    run: (report: Report) => Promise<void>,
  ): Job {
    const job: Job = {
      id: randomUUID(),
      instanceId,
      kind,
      status: 'running',
      progress: null,
      message: 'gestartet',
      bytesDone: null,
      bytesTotal: null,
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.persist(job);
    this.publish(job);

    const report: Report = (progress, message, bytes) => {
      job.progress = progress;
      job.message = message;
      // Die Byte-Zahlen gelten nur für die Pull-Phase und werden danach wieder
      // geleert, damit die Oberfläche sie nicht neben „Container wird erstellt“
      // stehen lässt.
      job.bytesDone = bytes?.done ?? null;
      job.bytesTotal = bytes?.total ?? null;
      this.persist(job);
      this.publish(job);
    };

    void run(report)
      .then(() => {
        job.status = 'done';
        job.progress = 100;
        job.message = 'abgeschlossen';
      })
      .catch((err: unknown) => {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        job.message = 'fehlgeschlagen';
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
        this.persist(job);
        this.publish(job);
      });

    return job;
  }

  get(id: string): Job | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToJob(row) : null;
  }

  listRecent(limit = 20): Job[] {
    const rows = this.db
      .prepare('SELECT * FROM jobs ORDER BY started_at DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }

  /** Beim Start: Jobs, die einen Neustart des Panels nicht überlebt haben. */
  failStaleJobs(): void {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'failed', error = ?, finished_at = ?
         WHERE status IN ('pending', 'running')`,
      )
      .run('Durch Neustart des Panels abgebrochen', new Date().toISOString());
  }

  private persist(job: Job): void {
    this.db
      .prepare(
        `INSERT INTO jobs (id, instance_id, kind, status, progress, message, error, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status, progress = excluded.progress, message = excluded.message,
           error = excluded.error, finished_at = excluded.finished_at`,
      )
      .run(
        job.id,
        job.instanceId,
        job.kind,
        job.status,
        job.progress,
        job.message,
        job.error,
        job.startedAt,
        job.finishedAt,
      );
  }

  private publish(job: Job): void {
    this.hub.publish(TOPIC.jobs, { type: 'job', job: { ...job } });
  }
}

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id),
    instanceId: row.instance_id === null ? null : String(row.instance_id),
    kind: row.kind as Job['kind'],
    status: row.status as Job['status'],
    progress: row.progress === null ? null : Number(row.progress),
    message: String(row.message ?? ''),
    // Byte-Zahlen sind reine Live-Angaben der laufenden Pull-Phase und werden
    // nicht gespeichert — ein aus der Datenbank gelesener Job hat sie nicht.
    bytesDone: null,
    bytesTotal: null,
    error: row.error === null ? null : String(row.error),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at === null ? null : String(row.finished_at),
  };
}

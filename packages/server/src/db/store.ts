import type { GameId } from '@gsp/shared';
import type { Backup, Ban } from '@gsp/shared';
import type { Db } from './index.js';

export interface InstanceRecord {
  id: string;
  game: GameId;
  name: string;
  tag: string;
  containerName: string;
  containerId: string | null;
  /** Auf dem Host veröffentlichte Ports, nach `PortSpec.name`. */
  ports: Record<string, number>;
  memoryMb: number;
  cpus: number;
  settings: Record<string, string | number | boolean>;
  /** Erzeugte Geheimnisse (RCON-Passwort); verlassen die API nie. */
  secrets: Record<string, string>;
  backupCron: string;
  backupKeepDays: number;
  peakPlayers: number;
  createdAt: string;
}

interface InstanceRow {
  id: string;
  game: string;
  name: string;
  tag: string;
  container_name: string;
  container_id: string | null;
  ports: string;
  memory_mb: number;
  cpus: number;
  settings: string;
  secrets: string;
  backup_cron: string;
  backup_keep_days: number;
  peak_players: number;
  created_at: string;
}

function toRecord(row: InstanceRow): InstanceRecord {
  return {
    id: row.id,
    game: row.game as GameId,
    name: row.name,
    tag: row.tag,
    containerName: row.container_name,
    containerId: row.container_id,
    ports: JSON.parse(row.ports) as Record<string, number>,
    memoryMb: row.memory_mb,
    cpus: row.cpus,
    settings: JSON.parse(row.settings) as Record<string, string | number | boolean>,
    secrets: JSON.parse(row.secrets) as Record<string, string>,
    backupCron: row.backup_cron,
    backupKeepDays: row.backup_keep_days,
    peakPlayers: row.peak_players,
    createdAt: row.created_at,
  };
}

export class Store {
  constructor(private readonly db: Db) {}

  listInstances(): InstanceRecord[] {
    const rows = this.db.prepare('SELECT * FROM instances ORDER BY created_at ASC').all() as InstanceRow[];
    return rows.map(toRecord);
  }

  getInstance(id: string): InstanceRecord | null {
    const row = this.db.prepare('SELECT * FROM instances WHERE id = ?').get(id) as InstanceRow | undefined;
    return row ? toRecord(row) : null;
  }

  insertInstance(record: InstanceRecord): void {
    this.db
      .prepare(
        `INSERT INTO instances
          (id, game, name, tag, container_name, container_id, ports, memory_mb, cpus,
           settings, secrets, backup_cron, backup_keep_days, peak_players, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.game,
        record.name,
        record.tag,
        record.containerName,
        record.containerId,
        JSON.stringify(record.ports),
        record.memoryMb,
        record.cpus,
        JSON.stringify(record.settings),
        JSON.stringify(record.secrets),
        record.backupCron,
        record.backupKeepDays,
        record.peakPlayers,
        record.createdAt,
      );
  }

  updateInstance(id: string, patch: Partial<InstanceRecord>): void {
    const current = this.getInstance(id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE instances SET name = ?, tag = ?, container_id = ?, ports = ?, memory_mb = ?,
           cpus = ?, settings = ?, secrets = ?, backup_cron = ?, backup_keep_days = ?, peak_players = ?
         WHERE id = ?`,
      )
      .run(
        next.name,
        next.tag,
        next.containerId,
        JSON.stringify(next.ports),
        next.memoryMb,
        next.cpus,
        JSON.stringify(next.settings),
        JSON.stringify(next.secrets),
        next.backupCron,
        next.backupKeepDays,
        next.peakPlayers,
        id,
      );
  }

  deleteInstance(id: string): void {
    this.db.prepare('DELETE FROM instances WHERE id = ?').run(id);
  }

  /** Alle bereits belegten Host-Ports — Grundlage der Kollisionsprüfung. */
  usedPorts(exceptInstanceId?: string): number[] {
    const rows = this.db.prepare('SELECT id, ports FROM instances').all() as {
      id: string;
      ports: string;
    }[];
    const used: number[] = [];
    for (const row of rows) {
      if (row.id === exceptInstanceId) continue;
      used.push(...Object.values(JSON.parse(row.ports) as Record<string, number>));
    }
    return used;
  }

  // --- Ereignisse -----------------------------------------------------------

  addEvent(instanceId: string, text: string, at = new Date()): void {
    this.db
      .prepare('INSERT INTO events (instance_id, text, created_at) VALUES (?, ?, ?)')
      .run(instanceId, text, at.toISOString());
    // Alte Einträge kappen, damit die Tabelle nicht unbegrenzt wächst.
    this.db
      .prepare(
        `DELETE FROM events WHERE instance_id = ? AND id NOT IN
           (SELECT id FROM events WHERE instance_id = ? ORDER BY id DESC LIMIT 50)`,
      )
      .run(instanceId, instanceId);
  }

  listEvents(instanceId: string, limit = 9): { time: string; text: string }[] {
    const rows = this.db
      .prepare('SELECT text, created_at FROM events WHERE instance_id = ? ORDER BY id DESC LIMIT ?')
      .all(instanceId, limit) as { text: string; created_at: string }[];
    return rows.map((row) => {
      const d = new Date(row.created_at);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return { time: `${hh}:${mm}`, text: row.text };
    });
  }

  // --- Sperren --------------------------------------------------------------

  listBans(instanceId: string): Ban[] {
    const rows = this.db
      .prepare('SELECT name, reason, created_at FROM bans WHERE instance_id = ? ORDER BY id DESC')
      .all(instanceId) as { name: string; reason: string; created_at: string }[];
    return rows.map((r) => ({ name: r.name, reason: r.reason, createdAt: r.created_at }));
  }

  addBan(instanceId: string, name: string, reason: string): void {
    this.db
      .prepare(
        `INSERT INTO bans (instance_id, name, reason, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(instance_id, name) DO UPDATE SET reason = excluded.reason`,
      )
      .run(instanceId, name, reason, new Date().toISOString());
  }

  removeBan(instanceId: string, name: string): void {
    this.db.prepare('DELETE FROM bans WHERE instance_id = ? AND name = ?').run(instanceId, name);
  }

  // --- Backups --------------------------------------------------------------

  listBackups(instanceId: string): Backup[] {
    const rows = this.db
      .prepare(
        'SELECT id, file, size_bytes, kind, created_at FROM backups WHERE instance_id = ? ORDER BY created_at DESC',
      )
      .all(instanceId) as {
      id: string;
      file: string;
      size_bytes: number;
      kind: string;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      file: r.file,
      sizeBytes: r.size_bytes,
      kind: r.kind === 'manuell' ? 'manuell' : 'auto',
      createdAt: r.created_at,
    }));
  }

  addBackup(instanceId: string, backup: Backup): void {
    this.db
      .prepare(
        'INSERT INTO backups (id, instance_id, file, size_bytes, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(backup.id, instanceId, backup.file, backup.sizeBytes, backup.kind, backup.createdAt);
  }

  getBackup(instanceId: string, backupId: string): Backup | null {
    const row = this.db
      .prepare('SELECT id, file, size_bytes, kind, created_at FROM backups WHERE instance_id = ? AND id = ?')
      .get(instanceId, backupId) as
      | { id: string; file: string; size_bytes: number; kind: string; created_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      file: row.file,
      sizeBytes: row.size_bytes,
      kind: row.kind === 'manuell' ? 'manuell' : 'auto',
      createdAt: row.created_at,
    };
  }

  removeBackup(instanceId: string, backupId: string): void {
    this.db.prepare('DELETE FROM backups WHERE instance_id = ? AND id = ?').run(instanceId, backupId);
  }

  // --- Spielersitzungen (für die Spielzeit) ---------------------------------

  openPlayerSession(instanceId: string, name: string, at = new Date()): void {
    const existing = this.db
      .prepare('SELECT id FROM player_sessions WHERE instance_id = ? AND name = ? AND left_at IS NULL')
      .get(instanceId, name);
    if (existing) return;
    this.db
      .prepare('INSERT INTO player_sessions (instance_id, name, joined_at) VALUES (?, ?, ?)')
      .run(instanceId, name, at.toISOString());
  }

  closePlayerSession(instanceId: string, name: string, at = new Date()): void {
    this.db
      .prepare('UPDATE player_sessions SET left_at = ? WHERE instance_id = ? AND name = ? AND left_at IS NULL')
      .run(at.toISOString(), instanceId, name);
  }

  closeAllPlayerSessions(instanceId: string, at = new Date()): void {
    this.db
      .prepare('UPDATE player_sessions SET left_at = ? WHERE instance_id = ? AND left_at IS NULL')
      .run(at.toISOString(), instanceId);
  }

  /** Beitrittszeitpunkte der aktuell verbundenen Spieler. */
  openSessions(instanceId: string): Map<string, number> {
    const rows = this.db
      .prepare('SELECT name, joined_at FROM player_sessions WHERE instance_id = ? AND left_at IS NULL')
      .all(instanceId) as { name: string; joined_at: string }[];
    return new Map(rows.map((r) => [r.name, new Date(r.joined_at).getTime()]));
  }

  // --- Messwerte ------------------------------------------------------------

  addMetricSample(instanceId: string, cpuPct: number, memBytes: number, players: number): void {
    this.db
      .prepare('INSERT INTO metric_samples (instance_id, at, cpu_pct, mem_bytes, players) VALUES (?, ?, ?, ?, ?)')
      .run(instanceId, new Date().toISOString(), cpuPct, Math.round(memBytes), players);
  }

  /** Durchschnittliche Spielerzahl der letzten 24 Stunden. */
  avgPlayers24h(instanceId: string): number {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const row = this.db
      .prepare('SELECT AVG(players) AS avg FROM metric_samples WHERE instance_id = ? AND at >= ?')
      .get(instanceId, since) as { avg: number | null };
    return row.avg ?? 0;
  }

  pruneMetrics(olderThanHours = 48): void {
    const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
    this.db.prepare('DELETE FROM metric_samples WHERE at < ?').run(cutoff);
  }
}

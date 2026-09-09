import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = Database.Database;

/**
 * Migrationen laufen in Reihenfolge und werden über `PRAGMA user_version`
 * verfolgt. Für den Umfang dieses Panels ist handgeschriebenes SQL
 * überschaubarer als ein ORM mit eigenem Generierungsschritt.
 */
const MIGRATIONS: string[] = [
  // 1 — Grundschema
  `
  CREATE TABLE users (
    id         INTEGER PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE instances (
    id               TEXT PRIMARY KEY,
    game             TEXT NOT NULL,
    name             TEXT NOT NULL,
    tag              TEXT NOT NULL,
    container_name   TEXT NOT NULL UNIQUE,
    container_id     TEXT,
    ports            TEXT NOT NULL,
    memory_mb        INTEGER NOT NULL,
    cpus             REAL NOT NULL,
    settings         TEXT NOT NULL,
    secrets          TEXT NOT NULL,
    backup_cron      TEXT NOT NULL,
    backup_keep_days INTEGER NOT NULL,
    peak_players     INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL
  );

  CREATE TABLE bans (
    id          INTEGER PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    reason      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE(instance_id, name)
  );

  CREATE TABLE backups (
    id          TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    file        TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX idx_backups_instance ON backups(instance_id, created_at DESC);

  CREATE TABLE events (
    id          INTEGER PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX idx_events_instance ON events(instance_id, id DESC);

  CREATE TABLE jobs (
    id          TEXT PRIMARY KEY,
    instance_id TEXT,
    kind        TEXT NOT NULL,
    status      TEXT NOT NULL,
    progress    REAL,
    message     TEXT NOT NULL DEFAULT '',
    error       TEXT,
    started_at  TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE INDEX idx_jobs_started ON jobs(started_at DESC);

  CREATE TABLE metric_samples (
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    at          TEXT NOT NULL,
    cpu_pct     REAL NOT NULL,
    mem_bytes   INTEGER NOT NULL,
    players     INTEGER NOT NULL
  );
  CREATE INDEX idx_metrics_instance_at ON metric_samples(instance_id, at DESC);

  CREATE TABLE player_sessions (
    id          INTEGER PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    joined_at   TEXT NOT NULL,
    left_at     TEXT
  );
  CREATE INDEX idx_player_sessions ON player_sessions(instance_id, left_at);
  `,

  // 2 — Dauer des letzten erfolgreichen Starts. Für die Phase zwischen
  // laufendem Container und Startmeldung des Servers gibt es keinen
  // Prozentsatz; der Erfahrungswert der Instanz ist der einzige ehrliche
  // Anhaltspunkt, den die Oberfläche dort zeigen kann.
  `
  ALTER TABLE instances ADD COLUMN last_boot_sec INTEGER;
  `,

  // 3 — Vorlagen als Daten. Bis hierher waren sie TypeScript-Objekte im
  // Quelltext; jetzt liegen sie als JSON hier und werden beim Start zu
  // lauffähigen Vorlagen kompiliert. `builtin` merkt sich, welche mitgeliefert
  // wurden — nur fehlende davon werden beim Start ergänzt, vorhandene nie
  // überschrieben, sonst verlöre ein Panel-Update jede Anpassung.
  //
  // `template_rev` hält fest, mit welchem Stand der Vorlage ein Container
  // erzeugt wurde. Weicht er ab, zeigt die Oberfläche „Vorlage geändert“.
  `
  CREATE TABLE templates (
    id         TEXT PRIMARY KEY,
    definition TEXT NOT NULL,
    builtin    INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  ALTER TABLE instances ADD COLUMN template_rev TEXT;
  `,
];

export function openDb(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const current = Number((db.pragma('user_version', { simple: true }) as number) ?? 0);
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const sql = MIGRATIONS[version];
    if (!sql) continue;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.pragma(`user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

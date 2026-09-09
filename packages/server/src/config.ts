import { hostname } from 'node:os';
import { resolve } from 'node:path';

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export interface Config {
  port: number;
  host: string;
  /** Wurzel für Datenbank, Backups und Instanz-Volumes. */
  dataDir: string;
  backupDir: string;
  volumeDir: string;
  /**
   * Pfad der Instanz-Volumes **aus Sicht des Docker-Hosts**.
   *
   * Läuft das Panel selbst in einem Container, erzeugt trotzdem der Daemon des
   * Hosts die Instanz-Container — Bind-Mounts werden deshalb vom Host aus
   * aufgelöst. Ist das Datenverzeichnis im Panel unter einem anderen Pfad
   * eingehängt als auf dem Host, muss dieser Wert den Host-Pfad nennen, sonst
   * zeigen die Mounts der Instanzen ins Leere.
   */
  hostVolumeDir: string;
  /**
   * Schlüssel für den KI-Vorlagenentwurf. Bewusst aus der Umgebung und nicht
   * aus der Datenbank — dort läge er in jedem Backup.
   */
  anthropicApiKey: string | undefined;
  dbPath: string;
  /** `docker` steuert echte Container, `fake` simuliert sie im Speicher. */
  runtime: 'docker' | 'fake';
  dockerSocket: string;
  /** Takt, in dem Metriken an die Clients gesendet werden. */
  refreshMs: number;
  /** Adresse, unter der Spieler die Server erreichen — Anzeige im Detailkopf. */
  publicHost: string;
  /** Beschriftung in der Kopfzeile, im Design `node 01 · epiconline`. */
  nodeLabel: string;
  timezone: string;
  /** Cookie nur über HTTPS senden. Hinter TLS-Proxy einschalten. */
  secureCookies: boolean;
  sessionTtlHours: number;
  /** Verzeichnis mit dem gebauten Frontend; leer = nicht ausliefern. */
  webRoot: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolve(env.GSP_DATA_DIR ?? './data');
  const runtime = env.GSP_RUNTIME === 'fake' ? 'fake' : 'docker';
  const volumeDir = resolve(env.GSP_VOLUME_DIR ?? `${dataDir}/instances`);
  return {
    port: num(env.GSP_PORT, 8770),
    host: env.GSP_HOST ?? '0.0.0.0',
    dataDir,
    backupDir: resolve(env.GSP_BACKUP_DIR ?? `${dataDir}/backups`),
    volumeDir,
    anthropicApiKey: env.GSP_ANTHROPIC_API_KEY || undefined,
    hostVolumeDir: env.GSP_HOST_DATA_DIR
      ? resolve(env.GSP_HOST_DATA_DIR, 'instances')
      : volumeDir,
    dbPath: resolve(env.GSP_DB_PATH ?? `${dataDir}/panel.db`),
    runtime,
    dockerSocket: env.GSP_DOCKER_SOCKET ?? '/var/run/docker.sock',
    refreshMs: Math.max(500, num(env.GSP_REFRESH_MS, 2000)),
    publicHost: env.GSP_PUBLIC_HOST ?? hostname(),
    nodeLabel: env.GSP_NODE_LABEL ?? 'node 01',
    timezone: env.TZ ?? 'Europe/Berlin',
    secureCookies: bool(env.GSP_SECURE_COOKIES, false),
    sessionTtlHours: num(env.GSP_SESSION_TTL_HOURS, 24 * 14),
    webRoot: env.GSP_WEB_ROOT ? resolve(env.GSP_WEB_ROOT) : null,
  };
}

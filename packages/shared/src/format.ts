/**
 * Formatierung nach deutschem Muster — der Design-Prototyp zeigt durchgehend
 * Dezimalkomma (`5,4 GB`, `58,9 Hz`) und Schmalleerzeichen als Tausendertrenner.
 * Das Backend liefert Zahlen, die Darstellung entsteht hier.
 */

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const KB = 1024;

function de(value: number, digits: number): string {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** `5,4 GB`, `840 MB`. Ab 1 GB mit einer Nachkommastelle. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes >= GB) return `${de(bytes / GB, 1)} GB`;
  if (bytes >= MB) return `${de(bytes / MB, 0)} MB`;
  return `${de(bytes / KB, 0)} kB`;
}

/** Datenrate wie in der Übersichtskachel: `82 kB/s`, `1,2 MB/s`. */
export function formatRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 kB/s';
  if (bytesPerSec >= MB) return `${de(bytesPerSec / MB, 1)} MB/s`;
  return `${de(bytesPerSec / KB, 0)} kB/s`;
}

/** `41 %` — im Design ohne Nachkommastelle und mit schmalem Leerzeichen. */
export function formatPercent(pct: number): string {
  if (!Number.isFinite(pct)) return '— %';
  return `${Math.round(pct)} %`;
}

/** `71 h 30 m`, unter einer Stunde `12 m`. */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 m';
  const total = Math.floor(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`;
}

/** Spielzeit in der Spielerliste: `2 h 14 min`, `48 min`. */
export function formatPlaytime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const total = Math.floor(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** `38 ms` oder `—`, wenn die Vorlage keinen Ping liefert. */
export function formatPing(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  return `${Math.round(ms)} ms`;
}

/** `heute 04:00`, `gestern 03:00`, sonst `06.09. 18:22` — wie im Design. */
export function formatTimestamp(iso: string | null, now = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const days = dayDiff(d, now);
  if (days === 0) return `heute ${time}`;
  if (days === 1) return `gestern ${time}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${time}`;
}

/** Ganze Kalendertage zwischen zwei Zeitpunkten, unabhängig von der Uhrzeit. */
function dayDiff(then: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `12:41` für Ereignisse. */
export function clockHm(date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `12:41:44` für Logzeilen. */
export function clockHms(date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Dateistempel für Backups: `2026-09-09-0400`. */
export function backupStamp(date = new Date()): string {
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
}

/** Zahl mit Dezimalkomma, z. B. für `Ø 3,4 über 24 h`. */
export function formatDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return de(value, digits);
}

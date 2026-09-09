import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';

interface CacheEntry {
  bytes: number;
  at: number;
}

const sizeCache = new Map<string, CacheEntry>();
const inFlight = new Set<string>();

/**
 * Größe eines Verzeichnisses. Der Durchlauf ist teuer, deshalb wird das
 * Ergebnis zwischengespeichert und im Hintergrund erneuert — der Aufrufer
 * bekommt sofort den letzten bekannten Wert.
 */
export function directorySize(path: string, maxAgeMs = 60_000): number {
  const cached = sizeCache.get(path);
  const stale = !cached || Date.now() - cached.at > maxAgeMs;

  if (stale && !inFlight.has(path)) {
    inFlight.add(path);
    void walk(path)
      .then((bytes) => sizeCache.set(path, { bytes, at: Date.now() }))
      .catch(() => sizeCache.set(path, { bytes: cached?.bytes ?? 0, at: Date.now() }))
      .finally(() => inFlight.delete(path));
  }
  return cached?.bytes ?? 0;
}

async function walk(path: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      total += await walk(child);
    } else if (entry.isFile()) {
      try {
        total += (await stat(child)).size;
      } catch {
        // Datei ist verschwunden, während gezählt wurde — überspringen.
      }
    }
  }
  return total;
}

const fsCache = new Map<string, { total: number; free: number; at: number }>();

/** Belegung des Dateisystems, auf dem ein Pfad liegt. */
export async function filesystemUsage(path: string): Promise<{ total: number; used: number }> {
  const cached = fsCache.get(path);
  if (cached && Date.now() - cached.at < 30_000) {
    return { total: cached.total, used: cached.total - cached.free };
  }
  try {
    const info = await statfs(path);
    const total = Number(info.blocks) * Number(info.bsize);
    const free = Number(info.bavail) * Number(info.bsize);
    fsCache.set(path, { total, free, at: Date.now() });
    return { total, used: total - free };
  } catch {
    return { total: 0, used: 0 };
  }
}

import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { getTemplate, type Mod } from '@gsp/shared';
import type { InstanceRecord } from '../db/store.js';
import { isInside, toHostPath } from './paths.js';

/** Deaktivierte Mods werden umbenannt — so lädt das Spiel sie nicht mehr. */
const DISABLED_SUFFIX = '.disabled';

/**
 * Mods sind Dateien im Mod-Verzeichnis des Instanz-Volumes. Weil die Volumes
 * als Bind-Mounts angelegt sind, arbeitet der Dienst direkt auf dem Host —
 * es muss nichts durch den Container gestreamt werden.
 */
export class ModService {
  constructor(private readonly volumeDir: string) {}

  private dirFor(instance: InstanceRecord): string | null {
    const template = getTemplate(instance.game);
    if (!template.modsPath) return null;
    return toHostPath(this.volumeDir, instance, template.modsPath);
  }

  async list(instance: InstanceRecord): Promise<Mod[]> {
    const dir = this.dirFor(instance);
    if (!dir) return [];
    const extensions = getTemplate(instance.game).modExtensions ?? [];

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Verzeichnis existiert noch nicht — die Instanz wurde nie gestartet.
      return [];
    }

    const mods: Mod[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const enabled = !entry.name.endsWith(DISABLED_SUFFIX);
      const realName = enabled ? entry.name : entry.name.slice(0, -DISABLED_SUFFIX.length);
      if (extensions.length > 0 && !extensions.includes(extname(realName).toLowerCase())) continue;

      const info = await stat(join(dir, entry.name)).catch(() => null);
      mods.push({
        file: entry.name,
        ...parseModName(realName),
        enabled,
        // Ein Abgleich mit Modrinth oder Hangar ist nicht implementiert —
        // ohne Quelle wird kein Update behauptet.
        updateAvailable: false,
        sizeBytes: info?.size ?? 0,
      });
    }
    return mods.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  async setEnabled(instance: InstanceRecord, file: string, enabled: boolean): Promise<void> {
    const dir = this.dirFor(instance);
    if (!dir) throw new Error('Diese Vorlage unterstützt keine Mods');

    const current = this.safeJoin(dir, file);
    const isDisabled = file.endsWith(DISABLED_SUFFIX);
    if (enabled === !isDisabled) return;

    const next = enabled
      ? this.safeJoin(dir, file.slice(0, -DISABLED_SUFFIX.length))
      : this.safeJoin(dir, `${file}${DISABLED_SUFFIX}`);
    await rename(current, next);
  }

  async add(instance: InstanceRecord, filename: string, data: Buffer): Promise<void> {
    const dir = this.dirFor(instance);
    if (!dir) throw new Error('Diese Vorlage unterstützt keine Mods');

    const template = getTemplate(instance.game);
    const extensions = template.modExtensions ?? [];
    const clean = basename(filename);
    if (extensions.length > 0 && !extensions.includes(extname(clean).toLowerCase())) {
      throw new Error(`Nur ${extensions.join(', ')} sind für diese Vorlage zulässig`);
    }

    await mkdir(dir, { recursive: true });
    const target = this.safeJoin(dir, clean);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(target, data);
  }

  async remove(instance: InstanceRecord, file: string): Promise<void> {
    const dir = this.dirFor(instance);
    if (!dir) throw new Error('Diese Vorlage unterstützt keine Mods');
    await rm(this.safeJoin(dir, file), { force: true });
  }

  /**
   * Setzt einen Dateinamen zusammen und stellt sicher, dass er das
   * Mod-Verzeichnis nicht verlässt.
   */
  private safeJoin(dir: string, file: string): string {
    const clean = basename(file);
    const path = join(dir, clean);
    if (!isInside(dir, path)) throw new Error('Ungültiger Dateiname');
    return path;
  }
}

/**
 * Zerlegt einen Dateinamen wie `EssentialsX-2.20.1.jar` in Name und Version.
 * Ohne erkennbare Version bleibt der volle Name stehen.
 */
export function parseModName(file: string): { name: string; version: string } {
  const withoutExt = file.replace(/\.[^.]+$/, '');
  const match = /^(.*?)[-_ ]v?(\d+(?:\.\d+)*(?:[-+][\w.]+)?)$/.exec(withoutExt);
  if (!match?.[1] || !match[2]) return { name: withoutExt, version: '—' };
  return { name: match[1].replace(/[-_]+$/, ''), version: match[2] };
}

import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createZstdCompress, createZstdDecompress } from 'node:zlib';
import { create as tarCreate, extract as tarExtract } from 'tar';
import { backupStamp, getTemplate, type Backup } from '@gsp/shared';
import type { InstanceRecord, Store } from '../db/store.js';
import { instanceRoot, isInside, slug, toHostPath } from './paths.js';

export interface BackupOptions {
  kind: 'auto' | 'manuell';
  /** Vor dem Sichern abzusetzende Konsolenbefehle. */
  runCommand?: (command: string) => Promise<void>;
}

/**
 * Sichert die Weltdaten als `.tar.zst`. Die zstd-Kompression stammt aus
 * `node:zlib` (Node ≥ 22.15) — es wird kein externes Binary benötigt, und die
 * Dateinamen entsprechen dem Muster aus dem Design.
 */
export class BackupService {
  constructor(
    private readonly store: Store,
    private readonly volumeDir: string,
    private readonly backupDir: string,
  ) {}

  private dirFor(instanceId: string): string {
    return join(this.backupDir, instanceId);
  }

  fileFor(instanceId: string, file: string): string | null {
    const dir = this.dirFor(instanceId);
    const path = join(dir, file);
    // `file` stammt aus der Datenbank, wird aber trotzdem geprüft.
    return isInside(dir, path) ? path : null;
  }

  async create(
    instance: InstanceRecord,
    options: BackupOptions,
    report?: (progress: number | null, message: string) => void,
  ): Promise<Backup> {
    const template = getTemplate(instance.game);
    const root = instanceRoot(this.volumeDir, instance.id);

    // Container-Pfade der Vorlage auf Host-Pfade abbilden.
    const targets: string[] = [];
    for (const containerPath of template.backup.paths) {
      const host = toHostPath(this.volumeDir, instance, containerPath);
      if (host) targets.push(host);
    }
    if (targets.length === 0) {
      throw new Error('Die Vorlage benennt keine sicherbaren Pfade');
    }

    const dir = this.dirFor(instance.id);
    await mkdir(dir, { recursive: true });
    const file = `${slug(instance.name)}-${backupStamp()}-${options.kind}.tar.zst`;
    const path = join(dir, file);

    const pre = template.backup.preCommands ?? [];
    const post = template.backup.postCommands ?? [];

    if (options.runCommand && pre.length > 0) {
      report?.(10, 'Schreibvorgänge werden angehalten');
      for (const command of pre) {
        await options.runCommand(command).catch(() => undefined);
      }
    }

    try {
      report?.(30, 'Archiv wird geschrieben');
      // Relative Einträge im Archiv, damit sich das Backup unabhängig vom
      // Instanzverzeichnis wiederherstellen lässt.
      const entries = targets
        .map((target) => relative(root, target))
        .filter((entry) => entry.length > 0 && !entry.startsWith('..'));

      await pipeline(
        tarCreate({ cwd: root, portable: true }, entries),
        createZstdCompress(),
        createWriteStream(path),
      );
    } finally {
      if (options.runCommand && post.length > 0) {
        // Auch nach einem Fehler muss das Speichern wieder freigegeben werden.
        for (const command of post) {
          await options.runCommand(command).catch(() => undefined);
        }
      }
    }

    report?.(90, 'Archiv wird erfasst');
    const size = (await stat(path)).size;
    const backup: Backup = {
      id: randomUUID(),
      file,
      sizeBytes: size,
      kind: options.kind,
      createdAt: new Date().toISOString(),
    };
    this.store.addBackup(instance.id, backup);
    await this.applyRetention(instance);
    return backup;
  }

  /**
   * Stellt ein Archiv wieder her. Der Aufrufer muss die Instanz vorher stoppen —
   * das Entpacken über laufende Weltdateien führt sonst zu Datenverlust.
   */
  async restore(
    instance: InstanceRecord,
    backupId: string,
    report?: (progress: number | null, message: string) => void,
  ): Promise<void> {
    const backup = this.store.getBackup(instance.id, backupId);
    if (!backup) throw new Error('Backup nicht gefunden');
    const path = this.fileFor(instance.id, backup.file);
    if (!path) throw new Error('Ungültiger Backup-Pfad');

    const root = instanceRoot(this.volumeDir, instance.id);
    await mkdir(root, { recursive: true });

    report?.(20, 'Bisherige Weltdaten werden ersetzt');
    const template = getTemplate(instance.game);
    for (const containerPath of template.backup.paths) {
      const host = toHostPath(this.volumeDir, instance, containerPath);
      if (host && isInside(root, host)) {
        await rm(host, { recursive: true, force: true });
        await mkdir(dirname(host), { recursive: true });
      }
    }

    report?.(50, 'Archiv wird entpackt');
    await pipeline(createReadStream(path), createZstdDecompress(), tarExtract({ cwd: root }));
    report?.(90, 'Wiederherstellung abgeschlossen');
  }

  async remove(instance: InstanceRecord, backupId: string): Promise<void> {
    const backup = this.store.getBackup(instance.id, backupId);
    if (!backup) return;
    const path = this.fileFor(instance.id, backup.file);
    if (path) await rm(path, { force: true });
    this.store.removeBackup(instance.id, backupId);
  }

  /** Entfernt automatische Snapshots, die älter als die Aufbewahrungsfrist sind. */
  async applyRetention(instance: InstanceRecord): Promise<void> {
    if (instance.backupKeepDays <= 0) return;
    const cutoff = Date.now() - instance.backupKeepDays * 86_400_000;
    for (const backup of this.store.listBackups(instance.id)) {
      // Manuelle Sicherungen bleiben — sie sind bewusst angelegt worden.
      if (backup.kind === 'manuell') continue;
      if (new Date(backup.createdAt).getTime() >= cutoff) continue;
      await this.remove(instance, backup.id);
    }
  }
}

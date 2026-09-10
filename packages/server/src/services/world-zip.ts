import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { isInside } from './paths.js';
import { isDangerous, MappingError, type Mapping } from './world-mapping.js';

/**
 * Lesen und Schreiben von ZIP-Archiven für den Weltaustausch.
 *
 * ZIP und nicht das `.tar.zst` der Sicherungen: Ein Backup verlässt das Panel
 * nie und wird von `restore()` wieder eingelesen. Eine Welt dagegen landet im
 * Downloads-Ordner eines Menschen, der sie vielleicht in seinen
 * Einzelspieler-Ordner legen oder weitergeben will. `.tar.zst` können Explorer
 * und Finder nicht öffnen, ZIP beide seit Jahren — und der Weg zurück führt
 * praktisch immer über ZIP, weil das die einzige Form ist, die jedes
 * Betriebssystem ohne Zusatzprogramm erzeugt.
 */

/** Bereits komprimiert — noch einmal zu packen kostet CPU und bringt nichts. */
const ALREADY_COMPRESSED = new Set([
  '.zip', '.gz', '.zst', '.xz', '.bz2', '.7z', '.rar',
  '.mca', '.mcr', '.png', '.jpg', '.jpeg', '.ogg', '.webp',
]);

/** Obergrenzen gegen Archive, die sich beim Entpacken vervielfachen. */
const MAX_ENTRIES = 200_000;

export interface ZipEntry {
  hostPath: string;
  /** Name im Archiv. */
  name: string;
}

/** Alle Dateien unterhalb eines Teils, als Archiveinträge. */
export async function collectEntries(hostPath: string, name: string): Promise<ZipEntry[]> {
  const info = await stat(hostPath).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [{ hostPath, name }];

  const out: ZipEntry[] = [];
  const stack = [hostPath];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const child = join(dir, e.name);
      if (e.isDirectory()) stack.push(child);
      else if (e.isFile()) {
        out.push({ hostPath: child, name: `${name}/${relative(hostPath, child).split(/[\\/]/).join('/')}` });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Baut ein ZIP als lesbaren Strom — ohne Zwischendatei, damit eine 20-GB-Welt
 * nicht erst vollständig auf die Platte muss, bevor der Browser etwas sieht.
 */
export function packZip(entries: ZipEntry[], zip64: boolean): Readable {
  const zipfile = new yazl.ZipFile();
  for (const e of entries) {
    const dot = e.name.lastIndexOf('.');
    const ext = dot === -1 ? '' : e.name.slice(dot).toLowerCase();
    zipfile.addFile(e.hostPath, e.name, { compress: !ALREADY_COMPRESSED.has(ext) });
  }
  // `@types/yazl` schreibt beide Felder von `EndOptions` als Pflicht, obwohl
  // yazl selbst ein Teilobjekt nimmt — daher die Zusicherung.
  zipfile.end({ forceZip64Format: zip64 } as yazl.EndOptions);
  // `@types/yazl` gibt nur `NodeJS.ReadableStream` an; zur Laufzeit ist es ein
  // Node-`Readable`, und den brauchen wir, um beim Abbruch `destroy()` zu rufen.
  return zipfile.outputStream as Readable;
}

/** Ab hier braucht das zentrale Verzeichnis ZIP64. */
export function needsZip64(totalBytes: number, count: number): boolean {
  return totalBytes >= 0xffff_ffff || count >= 0xffff;
}

function open(archive: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    // `validateEntrySizes` deckt manipulierte Header auf und kostet nichts.
    yauzl.open(archive, { lazyEntries: true, validateEntrySizes: true }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new MappingError('Das Archiv ließ sich nicht öffnen'));
      else resolve(zipfile);
    });
  });
}

/**
 * Liest die Namen aller Einträge und prüft sie, bevor irgendetwas geschrieben
 * wird.
 *
 * Symlinks werden abgelehnt: mit ihnen ließe sich nach dem Entpacken aus dem
 * Zielverzeichnis herausschreiben, und eine Welt braucht keine.
 */
export async function readEntries(archive: string, maxBytes: number): Promise<string[]> {
  const zipfile = await open(archive);
  const names: string[] = [];
  let unpacked = 0;

  await new Promise<void>((resolve, reject) => {
    zipfile.on('entry', (entry: yauzl.Entry) => {
      try {
        if (names.length >= MAX_ENTRIES) {
          throw new MappingError(`Das Archiv hat mehr als ${MAX_ENTRIES} Einträge`);
        }
        if (isDangerous(entry.fileName) && !entry.fileName.endsWith('/')) {
          throw new MappingError(`Das Archiv enthält einen unzulässigen Eintrag: „${entry.fileName}“`);
        }
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (mode === 0xa000) {
          throw new MappingError(`Das Archiv enthält eine Verknüpfung: „${entry.fileName}“`);
        }
        unpacked += entry.uncompressedSize;
        if (unpacked > maxBytes * 10) {
          throw new MappingError('Das Archiv entpackt sich auf ein Vielfaches seiner Größe');
        }
        names.push(entry.fileName);
        zipfile.readEntry();
      } catch (err) {
        zipfile.close();
        reject(err);
      }
    });
    zipfile.on('end', resolve);
    zipfile.on('error', reject);
    zipfile.readEntry();
  });

  return names;
}

/**
 * Entpackt genau die zugeordneten Einträge nach `nach`. Was nicht in der
 * Zuordnung steht, wird übergangen — Beiwerk des Betriebssystems etwa.
 */
export async function extract(archive: string, mappings: Mapping[], into: string): Promise<void> {
  const byTarget = new Map(mappings.map((z) => [z.source, z.target]));
  const zipfile = await open(archive);

  await new Promise<void>((resolve, reject) => {
    zipfile.on('entry', (entry: yauzl.Entry) => {
      const target = byTarget.get(entry.fileName);
      if (target === undefined) {
        zipfile.readEntry();
        return;
      }
      const path = join(into, target);
      // Letztes Netz: nach aller Zuordnung darf nichts außerhalb landen.
      if (!isInside(into, path)) {
        zipfile.close();
        reject(new MappingError(`„${entry.fileName}“ würde außerhalb der Welt landen`));
        return;
      }

      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          zipfile.close();
          reject(err ?? new MappingError(`„${entry.fileName}“ ließ sich nicht lesen`));
          return;
        }
        void mkdir(dirname(path), { recursive: true })
          .then(() => pipeline(Readable.from(stream), createWriteStream(path)))
          .then(() => zipfile.readEntry())
          .catch((err: unknown) => {
            zipfile.close();
            reject(err);
          });
      });
    });
    zipfile.on('end', resolve);
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

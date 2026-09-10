import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { isInside } from './paths.js';
import { istGefaehrlich, ZuordnungsError, type Zuordnung } from './welt-zuordnung.js';

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
const NICHT_KOMPRIMIEREN = new Set([
  '.zip', '.gz', '.zst', '.xz', '.bz2', '.7z', '.rar',
  '.mca', '.mcr', '.png', '.jpg', '.jpeg', '.ogg', '.webp',
]);

/** Obergrenzen gegen Archive, die sich beim Entpacken vervielfachen. */
const MAX_EINTRAEGE = 200_000;

export interface ZipEintrag {
  hostPath: string;
  /** Name im Archiv. */
  name: string;
}

/** Alle Dateien unterhalb eines Teils, als Archiveinträge. */
export async function sammleEintraege(hostPath: string, name: string): Promise<ZipEintrag[]> {
  const info = await stat(hostPath).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [{ hostPath, name }];

  const raus: ZipEintrag[] = [];
  const stapel = [hostPath];
  while (stapel.length > 0) {
    const dir = stapel.pop()!;
    const eintraege = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of eintraege) {
      const kind = join(dir, e.name);
      if (e.isDirectory()) stapel.push(kind);
      else if (e.isFile()) {
        raus.push({ hostPath: kind, name: `${name}/${relative(hostPath, kind).split(/[\\/]/).join('/')}` });
      }
    }
  }
  return raus.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Baut ein ZIP als lesbaren Strom — ohne Zwischendatei, damit eine 20-GB-Welt
 * nicht erst vollständig auf die Platte muss, bevor der Browser etwas sieht.
 */
export function packeZip(eintraege: ZipEintrag[], zip64: boolean): NodeJS.ReadableStream {
  const zipfile = new yazl.ZipFile();
  for (const e of eintraege) {
    const punkt = e.name.lastIndexOf('.');
    const endung = punkt === -1 ? '' : e.name.slice(punkt).toLowerCase();
    zipfile.addFile(e.hostPath, e.name, { compress: !NICHT_KOMPRIMIEREN.has(endung) });
  }
  // `@types/yazl` schreibt beide Felder von `EndOptions` als Pflicht, obwohl
  // yazl selbst ein Teilobjekt nimmt — daher die Zusicherung.
  zipfile.end({ forceZip64Format: zip64 } as yazl.EndOptions);
  return zipfile.outputStream;
}

/** Ab hier braucht das zentrale Verzeichnis ZIP64. */
export function brauchtZip64(gesamtBytes: number, anzahl: number): boolean {
  return gesamtBytes >= 0xffff_ffff || anzahl >= 0xffff;
}

function oeffne(archiv: string): Promise<yauzl.ZipFile> {
  return new Promise((erfuellen, ablehnen) => {
    // `validateEntrySizes` deckt manipulierte Header auf und kostet nichts.
    yauzl.open(archiv, { lazyEntries: true, validateEntrySizes: true }, (err, zipfile) => {
      if (err || !zipfile) ablehnen(err ?? new ZuordnungsError('Das Archiv ließ sich nicht öffnen'));
      else erfuellen(zipfile);
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
export async function liesEintraege(archiv: string, maxBytes: number): Promise<string[]> {
  const zipfile = await oeffne(archiv);
  const namen: string[] = [];
  let entpackt = 0;

  await new Promise<void>((erfuellen, ablehnen) => {
    zipfile.on('entry', (entry: yauzl.Entry) => {
      try {
        if (namen.length >= MAX_EINTRAEGE) {
          throw new ZuordnungsError(`Das Archiv hat mehr als ${MAX_EINTRAEGE} Einträge`);
        }
        if (istGefaehrlich(entry.fileName) && !entry.fileName.endsWith('/')) {
          throw new ZuordnungsError(`Das Archiv enthält einen unzulässigen Eintrag: „${entry.fileName}“`);
        }
        const modus = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (modus === 0xa000) {
          throw new ZuordnungsError(`Das Archiv enthält eine Verknüpfung: „${entry.fileName}“`);
        }
        entpackt += entry.uncompressedSize;
        if (entpackt > maxBytes * 10) {
          throw new ZuordnungsError('Das Archiv entpackt sich auf ein Vielfaches seiner Größe');
        }
        namen.push(entry.fileName);
        zipfile.readEntry();
      } catch (err) {
        zipfile.close();
        ablehnen(err);
      }
    });
    zipfile.on('end', erfuellen);
    zipfile.on('error', ablehnen);
    zipfile.readEntry();
  });

  return namen;
}

/**
 * Entpackt genau die zugeordneten Einträge nach `nach`. Was nicht in der
 * Zuordnung steht, wird übergangen — Beiwerk des Betriebssystems etwa.
 */
export async function entpacke(archiv: string, zuordnungen: Zuordnung[], nach: string): Promise<void> {
  const nachZiel = new Map(zuordnungen.map((z) => [z.quelle, z.ziel]));
  const zipfile = await oeffne(archiv);

  await new Promise<void>((erfuellen, ablehnen) => {
    zipfile.on('entry', (entry: yauzl.Entry) => {
      const ziel = nachZiel.get(entry.fileName);
      if (ziel === undefined) {
        zipfile.readEntry();
        return;
      }
      const pfad = join(nach, ziel);
      // Letztes Netz: nach aller Zuordnung darf nichts außerhalb landen.
      if (!isInside(nach, pfad)) {
        zipfile.close();
        ablehnen(new ZuordnungsError(`„${entry.fileName}“ würde außerhalb der Welt landen`));
        return;
      }

      zipfile.openReadStream(entry, (err, strom) => {
        if (err || !strom) {
          zipfile.close();
          ablehnen(err ?? new ZuordnungsError(`„${entry.fileName}“ ließ sich nicht lesen`));
          return;
        }
        void mkdir(dirname(pfad), { recursive: true })
          .then(() => pipeline(Readable.from(strom), createWriteStream(pfad)))
          .then(() => zipfile.readEntry())
          .catch((fehler: unknown) => {
            zipfile.close();
            ablehnen(fehler);
          });
      });
    });
    zipfile.on('end', erfuellen);
    zipfile.on('error', ablehnen);
    zipfile.readEntry();
  });
}

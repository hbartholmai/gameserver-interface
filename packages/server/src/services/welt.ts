import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import {
  backupStamp,
  getTemplate,
  worldTarget,
  type WorldTarget,
  type WorldTargetPart,
} from '@gsp/shared';
import type { InstanceRecord } from '../db/store.js';
import type { Config } from '../config.js';
import { isInside, slug, toHostPath } from './paths.js';
import { ordneArchivZu, type Zuordnung } from './welt-zuordnung.js';

/**
 * Die Spielwelt einer Instanz herunterladen und austauschen.
 *
 * Die Volumes sind Bind-Mounts, also arbeitet der Dienst — wie `ModService` —
 * direkt auf Host-Pfaden und streamt nichts durch den Container.
 *
 * Abgegrenzt gegen `BackupService`: der sichert panelintern nach `.tar.zst` und
 * spielt an derselben Stelle zurück. Hier geht es um den Weg nach draußen und
 * wieder herein, also um ein Format, das ein Mensch öffnen kann, und um
 * Archive, die aus fremder Hand kommen und deshalb misstrauisch gelesen werden.
 */

/** Ein Teil der Welt, wie er auf der Platte vorgefunden wurde. */
export interface WeltTeilInfo {
  name: string;
  type: 'dir' | 'file';
  sizeBytes: number;
  modifiedAt: string | null;
  /** Fehlt auf der Platte — ein optionaler Teil, den es (noch) nicht gibt. */
  present: boolean;
}

export interface WeltInfo {
  name: string;
  /** Feld, aus dem der Name stammt — für den Hinweis „steht im Config-Reiter“. */
  nameField: string | null;
  teile: WeltTeilInfo[];
  sizeBytes: number;
  modifiedAt: string | null;
  /** Der Download liefert eine rohe Datei statt eines ZIP. */
  roh: boolean;
  /** Name, den der Download tragen wird — die Oberfläche nennt ihn vorab. */
  downloadName: string;
  /** Was der Dateidialog annehmen soll. */
  accept: string[];
  maxUploadBytes: number;
}

/** Ein Teil samt aufgelöstem Host-Pfad. */
export interface WeltTeilPfad extends WorldTargetPart {
  hostPath: string;
}

export class WeltError extends Error {}

export class WeltService {
  constructor(private readonly config: Config) {}

  /** Die Weltangabe der Vorlage, gegen die Einstellungen aufgelöst. */
  ziel(instance: InstanceRecord): WorldTarget | null {
    return worldTarget(getTemplate(instance.game), instance.settings);
  }

  /**
   * Host-Pfade aller Teile. `toHostPath()` gibt `null` zurück, wenn ein Pfad in
   * keinem Volume liegt — dann stimmt die Vorlage nicht, und es wird nichts
   * angefasst.
   */
  private pfade(instance: InstanceRecord, ziel: WorldTarget): WeltTeilPfad[] {
    const pfade: WeltTeilPfad[] = [];
    for (const teil of ziel.parts) {
      const hostPath = toHostPath(this.config.volumeDir, instance, teil.containerPath);
      if (!hostPath) {
        throw new WeltError(`„${teil.containerPath}“ liegt in keinem Volume der Vorlage`);
      }
      pfade.push({ ...teil, hostPath });
    }
    return pfade;
  }

  /** Host-Pfad des Elternverzeichnisses, in dem die Welt liegt. */
  private elternPfad(instance: InstanceRecord, ziel: WorldTarget): string {
    const pfad = toHostPath(this.config.volumeDir, instance, ziel.parent);
    if (!pfad) throw new WeltError(`„${ziel.parent}“ liegt in keinem Volume der Vorlage`);
    return pfad;
  }

  /** Auskunft für den Welt-Reiter. `null`, wenn die Vorlage keine Welt benennt. */
  async info(instance: InstanceRecord): Promise<WeltInfo | null> {
    const ziel = this.ziel(instance);
    if (!ziel) return null;

    const teile: WeltTeilInfo[] = [];
    let gesamt = 0;
    let neuestes: number | null = null;

    for (const teil of this.pfade(instance, ziel)) {
      const info = await stat(teil.hostPath).catch(() => null);
      if (!info) {
        teile.push({ name: teil.fileName, type: teil.type, sizeBytes: 0, modifiedAt: null, present: false });
        continue;
      }
      const groesse = info.isDirectory() ? await verzeichnisGroesse(teil.hostPath) : info.size;
      gesamt += groesse;
      const zeit = info.mtimeMs;
      if (neuestes === null || zeit > neuestes) neuestes = zeit;
      teile.push({
        name: teil.fileName,
        type: teil.type,
        sizeBytes: groesse,
        modifiedAt: new Date(zeit).toISOString(),
        present: true,
      });
    }

    const vorhanden = teile.filter((t) => t.present);
    const roh = this.istRoh(ziel, vorhanden.map((t) => t.name));
    const quelle = getTemplate(instance.game).world?.name;

    return {
      name: ziel.base,
      nameField: quelle?.kind === 'field' ? quelle.field : null,
      teile,
      sizeBytes: gesamt,
      modifiedAt: neuestes === null ? null : new Date(neuestes).toISOString(),
      roh,
      downloadName: this.downloadName(instance, ziel, roh),
      accept: [...new Set([...ziel.accept, '.zip'])],
      maxUploadBytes: this.config.worldUploadMaxBytes,
    };
  }

  /**
   * Eine rohe Datei statt eines ZIP — wenn die Welt aus einer einzelnen Datei
   * besteht und keine weiteren Teile daneben liegen.
   *
   * Ein Factorio-Spielstand *ist* ein ZIP; ihn in ein zweites zu legen ergäbe
   * eine Matrjoschka. Und der Rundlauf trägt nur so: Was herauskommt, nimmt der
   * Upload roh wieder an.
   */
  istRoh(ziel: WorldTarget, vorhandeneNamen: string[]): boolean {
    if (ziel.haupt.type !== 'file') return false;
    return vorhandeneNamen.length === 1 && vorhandeneNamen[0] === ziel.haupt.fileName;
  }

  /** Dateiname des Downloads. */
  downloadName(instance: InstanceRecord, ziel: WorldTarget, roh: boolean): string {
    if (!roh) return `${slug(instance.name)}-${slug(ziel.base)}-${backupStamp()}.zip`;
    // Terrarias Datei heißt auf der Platte `welt` — ohne Endung nützt sie
    // niemandem, deshalb hängt `accept[0]` sie an.
    const endung = extname(ziel.haupt.fileName);
    return endung === '' && ziel.accept[0] ? `${ziel.haupt.fileName}${ziel.accept[0]}` : ziel.haupt.fileName;
  }

  /** Die Teile, die tatsächlich auf der Platte liegen. */
  async vorhandeneTeile(instance: InstanceRecord, ziel: WorldTarget): Promise<WeltTeilPfad[]> {
    const da: WeltTeilPfad[] = [];
    for (const teil of this.pfade(instance, ziel)) {
      if (await stat(teil.hostPath).then(() => true).catch(() => false)) da.push(teil);
    }
    return da;
  }

  /**
   * Nimmt eine hochgeladene Datei entgegen und legt sie im Temp-Verzeichnis ab.
   *
   * Bewusst nicht `request.saveRequestFiles()`: das räumt über einen
   * `onResponse`-Hook auf, sobald die Antwort raus ist — der Job läuft danach
   * noch minutenlang und fände nichts mehr vor.
   */
  async entgegennehmen(
    ziel: WorldTarget,
    dateiname: string,
    strom: NodeJS.ReadableStream,
  ): Promise<{ pfad: string; dateiname: string; endung: string }> {
    const sauber = basename(dateiname);
    const endung = extname(sauber).toLowerCase();
    const erlaubt = [...new Set([...ziel.accept, '.zip'])];
    if (!erlaubt.includes(endung)) {
      throw new WeltError(`Für dieses Spiel sind nur ${erlaubt.join(', ')} zulässig`);
    }

    await mkdir(this.config.tempDir, { recursive: true });
    const pfad = join(this.config.tempDir, `welt-${randomUUID()}${endung}`);
    try {
      await pipeline(strom, createWriteStream(pfad));
    } catch (err) {
      await rm(pfad, { force: true });
      throw err;
    }
    return { pfad, dateiname: sauber, endung };
  }

  /**
   * Wird die hochgeladene Datei entpackt oder unverändert als Welt genommen?
   *
   * Die eine Regel, die den Factorio-Sonderfall auflöst: Führt die Vorlage die
   * Endung in `accept`, ist die Datei die Welt selbst. Sonst ist sie ein Archiv.
   */
  istRoheWeltdatei(ziel: WorldTarget, endung: string): boolean {
    return ziel.accept.includes(endung);
  }

  /**
   * Ersetzt die Weltdaten. Der Aufrufer muss sichergestellt haben, dass die
   * Instanz gestoppt ist.
   *
   * **Erst entpacken, dann löschen.** `BackupService.restore()` macht es
   * andersherum und lässt bei einem kaputten Archiv eine leere Instanz zurück;
   * dort ist das verschmerzbar, weil das Archiv aus dem Panel selbst stammt.
   * Bei einer Datei aus fremder Hand ist es das nicht.
   */
  async importieren(
    instance: InstanceRecord,
    quelle: { pfad: string; endung: string },
    entpacke: (archiv: string, zuordnungen: Zuordnung[], nach: string) => Promise<void>,
    liesEintraege: (archiv: string) => Promise<string[]>,
    report: (progress: number, message: string) => void,
  ): Promise<{ teile: string[] }> {
    const ziel = this.ziel(instance);
    if (!ziel) throw new WeltError('Diese Vorlage benennt keine Weltdaten');

    const eltern = this.elternPfad(instance, ziel);
    const wurzel = join(this.config.volumeDir, instance.id);
    // Das Zwischenverzeichnis liegt als Geschwister im selben Volume, damit das
    // spätere Verschieben ein `rename` bleibt und nicht auf `EXDEV` läuft.
    const zwischen = join(eltern, `.gsp-welt-${randomUUID()}`);

    await aufraeumenAlteZwischenstaende(eltern);
    await mkdir(zwischen, { recursive: true });

    try {
      report(40, 'Neue Weltdaten werden gelesen');
      let neueTeile: string[];

      if (this.istRoheWeltdatei(ziel, quelle.endung)) {
        // Rohe Einzeldatei: sie *ist* die Welt und wird nur umbenannt.
        if (ziel.haupt.type !== 'file') {
          throw new WeltError('Für dieses Spiel wird ein ZIP erwartet, keine einzelne Datei');
        }
        const nach = join(zwischen, ziel.haupt.fileName);
        await pipeline(createReadStream(quelle.pfad), createWriteStream(nach));
        neueTeile = [ziel.haupt.fileName];
      } else {
        const eintraege = await liesEintraege(quelle.pfad);
        const zuordnungen = ordneArchivZu(eintraege, ziel);
        report(55, 'Neue Weltdaten werden entpackt');
        await entpacke(quelle.pfad, zuordnungen, zwischen);
        neueTeile = [...new Set(zuordnungen.map((z) => z.ziel.split('/')[0]!))];
      }

      // Erst jetzt ist das Neue vollständig da — die alte Welt kann weichen.
      report(85, 'Bisherige Weltdaten werden ersetzt');
      for (const teil of this.pfade(instance, ziel)) {
        if (!isInside(wurzel, teil.hostPath)) {
          throw new WeltError(`„${teil.hostPath}“ liegt außerhalb der Instanz`);
        }
        await rm(teil.hostPath, { recursive: true, force: true });
      }

      for (const name of neueTeile) {
        const von = join(zwischen, name);
        const nach = join(eltern, name);
        if (!isInside(wurzel, nach)) throw new WeltError(`„${nach}“ liegt außerhalb der Instanz`);
        await mkdir(dirname(nach), { recursive: true });
        await rename(von, nach);
      }

      return { teile: neueTeile };
    } finally {
      await rm(zwischen, { recursive: true, force: true });
    }
  }
}

/**
 * Reste abgestürzter Läufe. Sie liegen im Weltverzeichnis und würden sonst beim
 * nächsten Download mitgepackt.
 */
async function aufraeumenAlteZwischenstaende(eltern: string): Promise<void> {
  const eintraege = await readdir(eltern, { withFileTypes: true }).catch(() => []);
  for (const e of eintraege) {
    if (e.isDirectory() && e.name.startsWith('.gsp-welt-')) {
      await rm(join(eltern, e.name), { recursive: true, force: true });
    }
  }
}

/** Summe der Dateigrößen unterhalb eines Verzeichnisses. */
async function verzeichnisGroesse(pfad: string): Promise<number> {
  let summe = 0;
  const eintraege = await readdir(pfad, { withFileTypes: true }).catch(() => []);
  for (const e of eintraege) {
    const kind = join(pfad, e.name);
    if (e.isDirectory()) summe += await verzeichnisGroesse(kind);
    else summe += await stat(kind).then((s) => s.size).catch(() => 0);
  }
  return summe;
}

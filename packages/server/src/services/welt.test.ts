import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadBuiltinTemplates } from '@gsp/shared';
import type { Config } from '../config.js';
import type { InstanceRecord } from '../db/store.js';
import { WeltService } from './welt.js';
import { entpacke, liesEintraege, packeZip, sammleEintraege } from './welt-zip.js';
import { ZuordnungsError } from './welt-zuordnung.js';

/**
 * Der Weltdienst mit echten Dateien. Die Zuordnungslogik selbst steht in
 * `welt-zuordnung.test.ts` als Tabelle; hier geht es um das, was sich nur am
 * Dateisystem zeigt — der Rundlauf und die Zusage, dass ein kaputtes Archiv die
 * bisherige Welt stehen lässt.
 */

let verzeichnis: string;
let config: Config;

function instanz(game: string, settings: Record<string, string>): InstanceRecord {
  return {
    id: 'i1',
    game,
    name: 'Nordheim',
    tag: 'latest',
    containerName: 'gsp-nordheim-i1',
    containerId: null,
    ports: {},
    memoryMb: 2048,
    cpus: 2,
    settings,
    secrets: {},
    backupCron: '',
    backupKeepDays: 7,
    peakPlayers: 0,
    lastBootSec: null,
    templateRev: null,
    createdAt: new Date().toISOString(),
  } as InstanceRecord;
}

/** Legt eine Datei samt Elternverzeichnissen an. */
function datei(pfad: string, inhalt: string): void {
  mkdirSync(join(pfad, '..'), { recursive: true });
  writeFileSync(pfad, inhalt);
}

/** Baut ein ZIP aus einer Namen→Inhalt-Tabelle. */
async function baueZip(pfad: string, dateien: Record<string, string>): Promise<string> {
  const quelle = mkdtempSync(join(verzeichnis, 'zipquelle-'));
  const eintraege = Object.entries(dateien).map(([name, inhalt]) => {
    const host = join(quelle, name.replaceAll('/', '__'));
    writeFileSync(host, inhalt);
    return { hostPath: host, name };
  });
  await pipeline(Readable.from(packeZip(eintraege, false) as unknown as AsyncIterable<Buffer>), createWriteStream(pfad));
  return pfad;
}

beforeAll(() => {
  loadBuiltinTemplates();
});

beforeEach(() => {
  verzeichnis = mkdtempSync(join(tmpdir(), 'gsp-welt-'));
  config = {
    volumeDir: join(verzeichnis, 'instances'),
    tempDir: join(verzeichnis, 'tmp'),
    worldUploadMaxBytes: 64 * 1024 * 1024,
  } as Config;
  mkdirSync(config.volumeDir, { recursive: true });
  mkdirSync(config.tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(verzeichnis, { recursive: true, force: true });
});

/**
 * Host-Pfad innerhalb eines Volumes dieser Testinstanz. Der Volumename ist je
 * Vorlage verschieden — Minecraft nennt es `data`, Terraria `worlds`.
 */
function welt(volume: string, ...parts: string[]): string {
  return join(config.volumeDir, 'i1', volume, ...parts);
}

describe('Auskunft', () => {
  it('meldet fehlende Teile, statt sie zu verschweigen', async () => {
    datei(welt('data', 'welt', 'level.dat'), 'x'.repeat(100));
    const info = await new WeltService(config).info(instanz('minecraft', { levelName: 'welt' }));

    expect(info?.name).toBe('welt');
    expect(info?.nameField).toBe('levelName');
    expect(info?.parts.map((t) => [t.name, t.present])).toEqual([
      ['welt', true],
      ['welt_nether', false],
      ['welt_the_end', false],
    ]);
    expect(info?.sizeBytes).toBe(100);
    // Ein Verzeichnis wird nie roh ausgeliefert.
    expect(info?.raw).toBe(false);
    expect(info?.downloadName).toMatch(/^nordheim-welt-.*\.zip$/);
  });

  it('gibt null zurück, wenn die Vorlage keine Weltdaten benennt', async () => {
    expect(await new WeltService(config).info(instanz('cs2', {}))).toBeNull();
  });
});

describe('rohe Datei statt Archiv', () => {
  it('liefert Terrarias Weltdatei roh und hängt die fehlende Endung an', async () => {
    datei(welt('worlds', 'welt'), 'weltdaten');
    const dienst = new WeltService(config);
    const info = await dienst.info(instanz('terraria', { worldName: 'welt' }));

    expect(info?.raw).toBe(true);
    // Auf der Platte heißt sie `welt` — dem Benutzer nützt erst `welt.wld`.
    expect(info?.downloadName).toBe('welt.wld');
  });

  it('schaltet auf ZIP um, sobald die TShock-Datei danebenliegt', async () => {
    datei(welt('worlds', 'welt'), 'weltdaten');
    datei(welt('worlds', 'welt.twld'), 'regionen');
    const info = await new WeltService(config).info(instanz('terraria', { worldName: 'welt' }));

    expect(info?.raw).toBe(false);
    expect(info?.downloadName).toMatch(/\.zip$/);
  });

  /*
   * Der Factorio-Sonderfall: Der Spielstand ist selbst ein ZIP. Er darf beim
   * Hochladen nie entpackt werden, sonst käme statt der Welt ihr Inhalt an.
   */
  it('nimmt ein hochgeladenes .zip bei Factorio als die Welt selbst', () => {
    const dienst = new WeltService(config);
    const ziel = dienst.ziel(instanz('factorio', { saveName: 'welt' }))!;
    expect(dienst.istRoheWeltdatei(ziel, '.zip')).toBe(true);

    const mcZiel = dienst.ziel(instanz('minecraft', { levelName: 'welt' }))!;
    expect(dienst.istRoheWeltdatei(mcZiel, '.zip')).toBe(false);
  });
});

describe('Entgegennahme', () => {
  it('lehnt eine Datei mit unpassender Endung ab', async () => {
    const dienst = new WeltService(config);
    const ziel = dienst.ziel(instanz('minecraft', { levelName: 'welt' }))!;
    await expect(dienst.entgegennehmen(ziel, 'welt.exe', Readable.from(['x']))).rejects.toThrow(/zulässig/);
  });

  it('nimmt einen Pfad im Dateinamen nicht als Pfad', async () => {
    const dienst = new WeltService(config);
    const ziel = dienst.ziel(instanz('minecraft', { levelName: 'welt' }))!;
    const { pfad, dateiname } = await dienst.entgegennehmen(ziel, '../../boese.zip', Readable.from(['x']));
    expect(dateiname).toBe('boese.zip');
    expect(pfad.startsWith(config.tempDir)).toBe(true);
  });
});

describe('Austausch', () => {
  const dienst = () => new WeltService(config);

  it('ersetzt eine Welt und benennt den Ordner des Archivs um', async () => {
    datei(welt('data', 'welt', 'level.dat'), 'alt');
    datei(welt('data', 'welt', 'region', 'r.0.0.mca'), 'altealt');

    const archiv = await baueZip(join(verzeichnis, 'neu.zip'), {
      'Hügelland/level.dat': 'neu',
      'Hügelland/region/r.1.1.mca': 'neuneu',
    });

    await dienst().importieren(
      instanz('minecraft', { levelName: 'welt' }),
      { pfad: archiv, endung: '.zip' },
      entpacke,
      (a) => liesEintraege(a, config.worldUploadMaxBytes),
      () => {},
    );

    expect(readFileSync(welt('data', 'welt', 'level.dat'), 'utf8')).toBe('neu');
    expect(readFileSync(welt('data', 'welt', 'region', 'r.1.1.mca'), 'utf8')).toBe('neuneu');
    // Reste der alten Welt dürfen nicht liegenbleiben.
    expect(() => readFileSync(welt('data', 'welt', 'region', 'r.0.0.mca'))).toThrow();
  });

  /*
   * Die Zusage, die diesen Dienst von `BackupService.restore()` unterscheidet:
   * der löscht zuerst und entpackt dann. Bei einer Datei aus fremder Hand wäre
   * das der Verlust der bisherigen Welt.
   */
  it('lässt die bisherige Welt unangetastet, wenn das Archiv unbrauchbar ist', async () => {
    datei(welt('data', 'welt', 'level.dat'), 'alt');
    const archiv = await baueZip(join(verzeichnis, 'fremd.zip'), { 'liesmich.txt': 'nichts' });

    await expect(
      dienst().importieren(
        instanz('minecraft', { levelName: 'welt' }),
        { pfad: archiv, endung: '.zip' },
        entpacke,
        (a) => liesEintraege(a, config.worldUploadMaxBytes),
        () => {},
      ),
    ).rejects.toThrow(ZuordnungsError);

    expect(readFileSync(welt('data', 'welt', 'level.dat'), 'utf8')).toBe('alt');
  });

  it('spielt eine rohe Weltdatei unter dem Namen der Instanz ein', async () => {
    datei(welt('worlds', 'welt'), 'alt');
    const raw = join(verzeichnis, 'Meine Welt.wld');
    writeFileSync(raw, 'neu');

    await dienst().importieren(
      instanz('terraria', { worldName: 'welt' }),
      { pfad: raw, endung: '.wld' },
      entpacke,
      (a) => liesEintraege(a, config.worldUploadMaxBytes),
      () => {},
    );

    expect(readFileSync(welt('worlds', 'welt'), 'utf8')).toBe('neu');
  });

  it('räumt Reste eines abgestürzten Laufs weg, statt sie mitzupacken', async () => {
    datei(welt('data', 'welt', 'level.dat'), 'alt');
    datei(welt('data', '.gsp-welt-abgestuerzt', 'muell.dat'), 'rest');

    const archiv = await baueZip(join(verzeichnis, 'neu.zip'), { 'welt/level.dat': 'neu' });
    await dienst().importieren(
      instanz('minecraft', { levelName: 'welt' }),
      { pfad: archiv, endung: '.zip' },
      entpacke,
      (a) => liesEintraege(a, config.worldUploadMaxBytes),
      () => {},
    );

    expect(() => readFileSync(welt('data', '.gsp-welt-abgestuerzt', 'muell.dat'))).toThrow();
  });
});

describe('Rundlauf', () => {
  it('packt eine Welt und spielt sie unverändert wieder ein', async () => {
    datei(welt('data', 'welt', 'level.dat'), 'inhalt-a');
    datei(welt('data', 'welt', 'region', 'r.0.0.mca'), 'inhalt-b');
    datei(welt('data', 'welt_nether', 'level.dat'), 'inhalt-c');

    const eintraege = [
      ...(await sammleEintraege(welt('data', 'welt'), 'welt')),
      ...(await sammleEintraege(welt('data', 'welt_nether'), 'welt_nether')),
    ];
    const archiv = join(verzeichnis, 'rund.zip');
    await pipeline(
      Readable.from(packeZip(eintraege, false) as unknown as AsyncIterable<Buffer>),
      createWriteStream(archiv),
    );

    // Die Welt danach zerstören, damit nur das Archiv sie zurückbringen kann.
    rmSync(welt('data', 'welt'), { recursive: true });
    rmSync(welt('data', 'welt_nether'), { recursive: true });

    await new WeltService(config).importieren(
      instanz('minecraft', { levelName: 'welt' }),
      { pfad: archiv, endung: '.zip' },
      entpacke,
      (a) => liesEintraege(a, config.worldUploadMaxBytes),
      () => {},
    );

    expect(readFileSync(welt('data', 'welt', 'level.dat'), 'utf8')).toBe('inhalt-a');
    expect(readFileSync(welt('data', 'welt', 'region', 'r.0.0.mca'), 'utf8')).toBe('inhalt-b');
    expect(readFileSync(welt('data', 'welt_nether', 'level.dat'), 'utf8')).toBe('inhalt-c');
  });
});

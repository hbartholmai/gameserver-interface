import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_DEFINITIONS,
  findTemplate,
  listTemplates,
  valheimDefinition,
  type TemplateDefinition,
} from '@gsp/shared';
import { openDb, type Db } from '../db/index.js';
import { Store } from '../db/store.js';
import { TemplateService } from './templates.js';
import { ValidationError } from './instances.js';

describe('Vorlagendienst', () => {
  let verzeichnis: string;
  let db: Db;
  let store: Store;
  let dienst: TemplateService;

  beforeEach(() => {
    verzeichnis = mkdtempSync(join(tmpdir(), 'gsp-vorlagen-'));
    db = openDb(join(verzeichnis, 'test.db'));
    store = new Store(db);
    dienst = new TemplateService(store);
  });

  afterEach(() => {
    db.close();
    rmSync(verzeichnis, { recursive: true, force: true });
  });

  it('legt die mitgelieferten Vorlagen beim ersten Start an', () => {
    const { seeded } = dienst.seedAndLoad();
    expect(seeded).toEqual(BUILTIN_DEFINITIONS.map((d) => d.id));
    // Die Registry bildet den Startbestand vollständig und in derselben
    // Reihenfolge ab — sie bestimmt, wie der Wizard die Karten anordnet.
    expect(listTemplates().map((t) => t.id)).toEqual(BUILTIN_DEFINITIONS.map((d) => d.id));
  });

  /**
   * Der Startbestand durchlaeuft beim Seeding nur das Zod-Schema, nicht die
   * Schluessigkeitspruefung — die haengt an `create`/`update`. Damit koennte
   * eine mitgelieferte Vorlage Widersprueche enthalten, die einer von Hand
   * angelegten verwehrt werden: Backup-Pfade ausserhalb der Volumes,
   * Vorbefehle ohne RCON, Beispielzeilen, die nicht zu den eigenen Mustern
   * passen. Dieser Test schliesst die Luecke.
   */
  it('haelt jede mitgelieferte Vorlage an dieselbe Schluessigkeitspruefung', () => {
    for (const definition of BUILTIN_DEFINITIONS) {
      // `create` prueft; die Kennung ist beim ersten Aufruf noch frei.
      expect(() => dienst.create({ ...definition, id: `probe-${definition.id}` }), definition.id).not.toThrow();
    }
  });

  /**
   * Der teuerste denkbare Fehler dieses Entwurfs: Ein Panel-Update setzt die
   * Anpassung des Betreibers zurück, lautlos, und es fällt erst beim nächsten
   * Containerbau auf.
   */
  it('überschreibt eine bearbeitete Vorlage beim nächsten Start nicht', () => {
    dienst.seedAndLoad();

    const geaendert: TemplateDefinition = {
      ...valheimDefinition,
      label: 'Valheim (angepasst)',
      defaultMemoryMb: 12288,
    };
    dienst.update('valheim', geaendert);

    // Zweiter Start des Panels.
    const { seeded } = dienst.seedAndLoad();

    expect(seeded).toEqual([]);
    expect(findTemplate('valheim')?.label).toBe('Valheim (angepasst)');
    expect(findTemplate('valheim')?.defaultMemoryMb).toBe(12288);
  });

  it('verweigert das Löschen, solange Instanzen darauf beruhen', () => {
    dienst.seedAndLoad();
    store.insertInstance({
      id: 'i1', game: 'valheim', name: 'Midgard', tag: 'latest',
      containerName: 'gsp-midgard-i1', containerId: null,
      ports: { game: 2456, query: 2457 }, memoryMb: 8192, cpus: 4,
      settings: {}, secrets: {}, backupCron: '', backupKeepDays: 7,
      peakPlayers: 0, lastBootSec: null, templateRev: null,
      createdAt: new Date().toISOString(),
    });

    expect(() => dienst.remove('valheim')).toThrow(ValidationError);
    expect(findTemplate('valheim')).not.toBeNull();

    // Ohne Instanz geht es.
    store.deleteInstance('i1');
    dienst.remove('valheim');
    expect(findTemplate('valheim')).toBeNull();
  });

  it('nimmt eine eigene Vorlage an und stellt sie in die Registry', () => {
    dienst.seedAndLoad();
    dienst.create(eigeneVorlage());
    expect(findTemplate('testspiel')?.label).toBe('Testspiel');
    expect(findTemplate('testspiel')?.env({ welt: 'Alpha' }, { hostPorts: { game: 7777 }, timezone: 'UTC' })).toEqual({
      WORLD: 'Alpha',
      PORT: '7777',
      TZ: 'UTC',
    });
  });

  it('lehnt eine zweite Vorlage mit derselben Kennung ab', () => {
    dienst.seedAndLoad();
    dienst.create(eigeneVorlage());
    expect(() => dienst.create(eigeneVorlage())).toThrow(/bereits/);
  });

  describe('Schlüssigkeitsprüfung', () => {
    beforeEach(() => dienst.seedAndLoad());

    it('meldet Env-Verweise auf unbekannte Felder und Ports', () => {
      const kaputt = eigeneVorlage();
      kaputt.env = [
        { name: 'A', source: { kind: 'field', field: 'gibtsNicht' }, trim: false, omitWhenEmpty: false },
        { name: 'B', source: { kind: 'port', port: 'auchNicht' }, trim: false, omitWhenEmpty: false },
      ];
      const fehler = fange(() => dienst.create(kaputt));
      expect(fehler.fields.map((f) => f.message)).toEqual([
        'Unbekanntes Feld „gibtsNicht“',
        'Unbekannter Port „auchNicht“',
      ]);
    });

    it('lässt Backup-Pfade außerhalb der Volumes nicht zu', () => {
      const kaputt = eigeneVorlage();
      kaputt.backup.paths = ['/woanders/welt'];
      expect(fange(() => dienst.create(kaputt)).fields[0]?.message).toMatch(/keinem der deklarierten Volumes/);
    });

    it('verlangt einen Abfrageport, wenn die Spielerzahl per Steam-Query kommt', () => {
      const kaputt = eigeneVorlage();
      kaputt.capabilities.players = 'a2s';
      expect(fange(() => dienst.create(kaputt)).fields.some((f) => f.field === 'adapter.queryPortName')).toBe(true);
    });

    it('lehnt Vorbefehle ohne Konsole ab', () => {
      const kaputt = eigeneVorlage();
      kaputt.backup.preCommands = ['save-all'];
      expect(fange(() => dienst.create(kaputt)).fields.some((f) => f.field === 'backup.preCommands')).toBe(true);
    });

    it('verlangt einen RCON-Port, sobald die Konsole ihn braucht', () => {
      const kaputt = eigeneVorlage();
      kaputt.capabilities.console = 'rcon';
      expect(fange(() => dienst.create(kaputt)).fields.some((f) => f.field === 'adapter.rconPortName')).toBe(true);
    });

    it('lehnt Kick und Bann ohne Konsole ab', () => {
      const kaputt = eigeneVorlage();
      kaputt.capabilities.moderation = true;
      expect(fange(() => dienst.create(kaputt)).fields.some((f) => f.field === 'capabilities.moderation')).toBe(true);
    });

    it('lehnt ein Listenformat ab, wenn die Spielerliste nicht über RCON kommt', () => {
      const kaputt = eigeneVorlage();
      kaputt.adapter.rconListFormat = 'csv';
      expect(fange(() => dienst.create(kaputt)).fields.some((f) => f.field === 'adapter.rconListFormat')).toBe(true);
    });

    /**
     * Log-Muster laufen gegen jede Zeile des Servers, und Node kennt keine
     * Zeitgrenze für reguläre Ausdrücke. Ein Muster mit verschachtelten
     * Wiederholungen kann das Panel deshalb dauerhaft beschäftigen.
     */
    it('lehnt Log-Muster mit verschachtelten Wiederholungen ab', () => {
      const kaputt = eigeneVorlage();
      kaputt.logPatterns.join = { source: '(a+)+$', flags: '' };
      expect(fange(() => dienst.create(kaputt)).fields.some((f) => f.field === 'logPatterns.join')).toBe(true);
    });

    it('lehnt syntaktisch kaputte Muster ab', () => {
      const kaputt = eigeneVorlage();
      kaputt.logPatterns.ready = { source: '([unvollstaendig', flags: '' };
      expect(fange(() => dienst.create(kaputt)).fields.some((f) => f.field === 'logPatterns.ready')).toBe(true);
    });
  });
});

function fange(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ValidationError) return err;
    throw err;
  }
  throw new Error('Es wurde kein Fehler geworfen');
}

/** Eine minimale, gültige Vorlage — jeder Test verbiegt davon genau eine Sache. */
function eigeneVorlage(): TemplateDefinition {
  return {
    id: 'testspiel',
    label: 'Testspiel',
    summary: 'Nur für Tests.',
    image: 'beispiel/testspiel',
    defaultTag: 'latest',
    defaultMemoryMb: 2048,
    defaultCpus: 2,
    notes: [],
    capabilities: { console: 'readonly', players: 'log', mods: 'none', moderation: false },
    ports: [
      { name: 'game', label: 'Spielport', container: 7777, protocol: 'udp', defaultHost: 7777, internalOnly: false },
    ],
    volumes: [{ name: 'data', containerPath: '/data', role: 'data' }],
    fields: [
      {
        id: 'welt', label: 'Welt', type: 'text', default: 'Alpha',
        required: true, editable: true, restartRequired: true, secret: false,
      },
    ],
    env: [
      { name: 'WORLD', source: { kind: 'field', field: 'welt' }, trim: false, omitWhenEmpty: false },
      { name: 'PORT', source: { kind: 'port', port: 'game' }, trim: false, omitWhenEmpty: false },
      { name: 'TZ', source: { kind: 'timezone' }, trim: false, omitWhenEmpty: false },
    ],
    logPatterns: {
      join: { source: 'Spieler (\\S+) betritt', flags: '' },
      ready: { source: 'Server bereit', flags: '' },
    },
    fakeLog: {
      timeFormat: 'iso',
      join: '[{time}] Spieler {name} betritt den Acker',
      leave: '[{time}] Spieler {name} verlaesst den Acker',
      ready: '[{time}] Server bereit',
      chatter: '[{time}] Feld gepfluegt ({n} ms)',
    },
    backup: { paths: ['/data'], preCommands: [], postCommands: [] },
    validations: [],
    adapter: {},
    modExtensions: [],
  };
}

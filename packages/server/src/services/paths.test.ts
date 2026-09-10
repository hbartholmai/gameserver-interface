import { describe, expect, it } from 'vitest';
import { loadBuiltinTemplates } from '@gsp/shared';
import { isInside, slug, toHostPath, volumePath } from './paths.js';
import type { InstanceRecord } from '../db/store.js';

// Die Vorlagen liegen jetzt in einer Registry statt in Modulkonstanten.
loadBuiltinTemplates();

const valheim: InstanceRecord = {
  id: 'abc123', game: 'valheim', name: 'Midgard', tag: 'latest',
  containerName: 'gsp-midgard-abc123', containerId: null,
  ports: { game: 2456, query: 2457 }, memoryMb: 8192, cpus: 4,
  settings: {}, secrets: {}, backupCron: '', backupKeepDays: 7,
  peakPlayers: 0, lastBootSec: null, templateRev: null, createdAt: new Date().toISOString(),
};

describe('Pfadauflösung', () => {
  it('bildet Container-Pfade auf das passende Volume ab', () => {
    const path = toHostPath('/srv/gsp', valheim, '/config/worlds_local');
    expect(path).toBe('/srv/gsp/abc123/config/worlds_local');
  });

  it('wählt bei mehreren Volumes das mit dem längsten passenden Präfix', () => {
    // `/opt/valheim` und `/config` existieren beide — der Pfad gehört zu `/opt/valheim`.
    expect(toHostPath('/srv/gsp', valheim, '/opt/valheim/server')).toBe('/srv/gsp/abc123/data/server');
  });

  it('gibt null zurück, wenn kein Volume passt', () => {
    expect(toHostPath('/srv/gsp', valheim, '/etc/passwd')).toBeNull();
    expect(toHostPath('/srv/gsp', valheim, '/configuration')).toBeNull();
  });

  it('lässt keinen Ausbruch aus dem Volume zu', () => {
    expect(toHostPath('/srv/gsp', valheim, '/config/../../../etc/shadow')).toBeNull();
  });
});

describe('isInside', () => {
  it('akzeptiert das Wurzelverzeichnis selbst und Unterpfade', () => {
    expect(isInside('/srv/gsp', '/srv/gsp')).toBe(true);
    expect(isInside('/srv/gsp', '/srv/gsp/abc/welt.db')).toBe(true);
  });

  it('lehnt Geschwisterverzeichnisse mit gleichem Präfix ab', () => {
    expect(isInside('/srv/gsp', '/srv/gsp-anders')).toBe(false);
    expect(isInside('/srv/gsp', '/srv/gsp/../andere')).toBe(false);
  });
});

describe('slug', () => {
  it('wandelt Umlaute und Sonderzeichen in dateisystemtaugliche Namen', () => {
    expect(slug('Größe Welt!')).toBe('groesse-welt');
    expect(slug('Survival Nordheim')).toBe('survival-nordheim');
  });

  it('fällt auf einen festen Namen zurück, wenn nichts übrig bleibt', () => {
    expect(slug('///')).toBe('instanz');
  });

  it('erzeugt keinen Pfadanteil aus Eingaben mit Schrägstrichen', () => {
    expect(slug('../../etc/passwd')).not.toContain('/');
  });
});

describe('volumePath', () => {
  it('legt Volumes unterhalb der Instanzwurzel ab', () => {
    expect(volumePath('/srv/gsp', 'abc123', 'data')).toBe('/srv/gsp/abc123/data');
  });
});

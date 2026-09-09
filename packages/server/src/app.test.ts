import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from './app.js';
import { loadConfig } from './config.js';
import { FakeRuntime } from './runtime/fake.js';

/**
 * Durchlauf durch die gesamte API gegen die Fake-Laufzeit: anlegen, steuern,
 * sichern, wiederherstellen, löschen — ohne laufenden Docker-Daemon.
 */
describe('API-Durchlauf', () => {
  let app: App;
  let dataDir: string;
  let cookie = '';
  let csrf = '';
  let instanceId = '';

  const kopf = (mitCsrf = true) => ({
    cookie,
    ...(mitCsrf ? { 'x-csrf-token': csrf } : {}),
  });

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'gsp-test-'));
    app = await buildApp(
      loadConfig({
        GSP_DATA_DIR: dataDir,
        GSP_RUNTIME: 'fake',
        GSP_PUBLIC_HOST: 'testhost',
        GSP_LOG_LEVEL: 'silent',
        TZ: 'Europe/Berlin',
      }),
      // Ohne Startverzögerung und ohne simulierten Pull, damit Tests nicht warten müssen.
      new FakeRuntime(0, 0),
    );
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('meldet, dass noch kein Konto existiert', async () => {
    const antwort = await app.server.inject({ method: 'GET', url: '/api/auth/state' });
    expect(antwort.json()).toEqual({ needsSetup: true });
  });

  it('sperrt die API ohne Anmeldung', async () => {
    const antwort = await app.server.inject({ method: 'GET', url: '/api/instances' });
    expect(antwort.statusCode).toBe(401);
  });

  it('lehnt zu kurze Passwörter bei der Ersteinrichtung ab', async () => {
    const antwort = await app.server.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', password: 'kurz' },
    });
    expect(antwort.statusCode).toBe(400);
  });

  it('legt das erste Konto an und setzt ein Sitzungscookie', async () => {
    const antwort = await app.server.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'admin', password: 'ein-langes-passwort' },
    });
    expect(antwort.statusCode).toBe(200);
    csrf = antwort.json<{ csrfToken: string }>().csrfToken;
    const gesetzt = antwort.headers['set-cookie'];
    cookie = String(Array.isArray(gesetzt) ? gesetzt[0] : gesetzt).split(';')[0] ?? '';
    expect(cookie).toContain('gsp_session=');
  });

  it('lässt kein zweites Konto über die Einrichtung zu', async () => {
    const antwort = await app.server.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { username: 'zweiter', password: 'ein-langes-passwort' },
    });
    expect(antwort.statusCode).toBe(409);
  });

  it('weist schreibende Anfragen ohne CSRF-Token ab', async () => {
    const antwort = await app.server.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { cookie },
      payload: { game: 'minecraft', name: 'X' },
    });
    expect(antwort.statusCode).toBe(403);
  });

  it('liefert die drei Vorlagen', async () => {
    const antwort = await app.server.inject({ method: 'GET', url: '/api/templates', headers: kopf(false) });
    const ids = antwort.json<{ templates: { id: string }[] }>().templates.map((t) => t.id);
    expect(ids).toEqual(['minecraft', 'valheim', 'enshrouded']);
  });

  it('legt eine Minecraft-Instanz an und startet sie', async () => {
    const antwort = await app.server.inject({
      method: 'POST',
      url: '/api/instances',
      headers: kopf(),
      payload: {
        game: 'minecraft',
        name: 'Nordheim',
        ports: [{ name: 'game', host: 25565 }],
        memoryMb: 4096,
        cpus: 2,
        settings: { serverName: 'Nordheim', levelName: 'welt', maxPlayers: 20 },
        backupCron: '0 4 * * *',
        backupKeepDays: 7,
      },
    });
    expect(antwort.statusCode).toBe(201);
    instanceId = antwort.json<{ id: string }>().id;

    // Der Anlege-Job läuft im Hintergrund; kurz auf „Online“ warten.
    await warteAuf(async () => {
      const detail = await app.server.inject({
        method: 'GET',
        url: `/api/instances/${instanceId}`,
        headers: kopf(false),
      });
      return detail.json<{ status: string }>().status === 'Online';
    });
  });

  it('weist einen bereits belegten Port ab', async () => {
    const antwort = await app.server.inject({
      method: 'POST',
      url: '/api/instances',
      headers: kopf(),
      payload: {
        game: 'minecraft',
        name: 'Zweiter',
        ports: [{ name: 'game', host: 25565 }],
        memoryMb: 2048,
        cpus: 1,
        settings: { serverName: 'Zweiter', levelName: 'welt2' },
        backupCron: '',
        backupKeepDays: 7,
      },
    });
    expect(antwort.statusCode).toBe(400);
    expect(antwort.json<{ error: string }>().error).toContain('25565');
  });

  it('schlägt freie Ports vor, die noch nicht belegt sind', async () => {
    const antwort = await app.server.inject({
      method: 'GET',
      url: '/api/templates/minecraft/ports',
      headers: kopf(false),
    });
    expect(antwort.json<{ ports: { game: number } }>().ports.game).toBe(25566);
  });

  it('maskiert Geheimnisse in der Instanzansicht', async () => {
    const antwort = await app.server.inject({
      method: 'POST',
      url: '/api/instances',
      headers: kopf(),
      payload: {
        game: 'valheim',
        name: 'Midgard',
        ports: [{ name: 'game', host: 2456 }, { name: 'query', host: 2457 }],
        memoryMb: 2048,
        cpus: 1,
        settings: { serverName: 'Midgard', worldName: 'Midgard', password: 'sicher123' },
        backupCron: '',
        backupKeepDays: 7,
      },
    });
    const id = antwort.json<{ id: string }>().id;
    const detail = await app.server.inject({
      method: 'GET',
      url: `/api/instances/${id}`,
      headers: kopf(false),
    });
    expect(detail.json<{ settings: Record<string, string> }>().settings.password).toBe('********');
    // Das RCON-Passwort taucht nirgends in der Antwort auf.
    expect(detail.body).not.toContain('sicher123');
  });

  it('lehnt Konsolenbefehle bei Vorlagen ohne RCON ab', async () => {
    const liste = await app.server.inject({ method: 'GET', url: '/api/instances', headers: kopf(false) });
    const valheim = liste
      .json<{ instances: { id: string; game: string }[] }>()
      .instances.find((i) => i.game === 'valheim');

    const antwort = await app.server.inject({
      method: 'POST',
      url: `/api/instances/${valheim?.id}/command`,
      headers: kopf(),
      payload: { command: 'save' },
    });
    expect(antwort.statusCode).toBe(400);
    expect(antwort.json<{ error: string }>().error).toContain('RCON');
  });

  it('erstellt ein Backup und stellt es wieder her', async () => {
    // Weltdaten anlegen, damit das Archiv Inhalt hat.
    const weltVerzeichnis = join(dataDir, 'instances', instanceId, 'data', 'welt');
    mkdirSync(weltVerzeichnis, { recursive: true });
    writeFileSync(join(weltVerzeichnis, 'level.dat'), 'weltdaten');

    const erstellt = await app.server.inject({
      method: 'POST',
      url: `/api/instances/${instanceId}/backups`,
      headers: kopf(),
    });
    expect(erstellt.statusCode).toBe(200);

    await warteAuf(async () => {
      const liste = await app.server.inject({
        method: 'GET',
        url: `/api/instances/${instanceId}/backups`,
        headers: kopf(false),
      });
      return liste.json<{ backups: unknown[] }>().backups.length > 0;
    });

    const liste = await app.server.inject({
      method: 'GET',
      url: `/api/instances/${instanceId}/backups`,
      headers: kopf(false),
    });
    const backup = liste.json<{ backups: { id: string; file: string; kind: string }[] }>().backups[0]!;
    expect(backup.kind).toBe('manuell');
    // Dateiname nach dem Muster aus dem Design.
    expect(backup.file).toMatch(/^nordheim-\d{4}-\d{2}-\d{2}-\d{4}-manuell\.tar\.zst$/);

    // Welt löschen und aus dem Backup zurückholen.
    rmSync(weltVerzeichnis, { recursive: true, force: true });
    const wieder = await app.server.inject({
      method: 'POST',
      url: `/api/instances/${instanceId}/backups/${backup.id}/restore`,
      headers: kopf(),
    });
    expect(wieder.statusCode).toBe(200);

    await warteAuf(async () => {
      const { existsSync } = await import('node:fs');
      return existsSync(join(weltVerzeichnis, 'level.dat'));
    });
  });

  it('speichert geänderte Einstellungen und erzeugt den Container neu', async () => {
    const antwort = await app.server.inject({
      method: 'PATCH',
      url: `/api/instances/${instanceId}/settings`,
      headers: kopf(),
      payload: { settings: { maxPlayers: 32, difficulty: 'hard' }, restart: true },
    });
    expect(antwort.statusCode).toBe(200);

    const detail = await app.server.inject({
      method: 'GET',
      url: `/api/instances/${instanceId}`,
      headers: kopf(false),
    });
    expect(detail.json<{ settings: { maxPlayers: number } }>().settings.maxPlayers).toBe(32);
  });

  it('ignoriert Änderungen an nicht editierbaren Feldern', async () => {
    await app.server.inject({
      method: 'PATCH',
      url: `/api/instances/${instanceId}/settings`,
      headers: kopf(),
      payload: { settings: { levelName: 'andere-welt' }, restart: false },
    });
    const detail = await app.server.inject({
      method: 'GET',
      url: `/api/instances/${instanceId}`,
      headers: kopf(false),
    });
    // `levelName` ist als nicht editierbar gekennzeichnet — der Weltname bleibt.
    expect(detail.json<{ settings: { levelName: string } }>().settings.levelName).toBe('welt');
  });

  it('stoppt und löscht eine Instanz', async () => {
    const gestoppt = await app.server.inject({
      method: 'POST',
      url: `/api/instances/${instanceId}/stop`,
      headers: kopf(),
    });
    expect(gestoppt.statusCode).toBe(200);

    const geloescht = await app.server.inject({
      method: 'DELETE',
      url: `/api/instances/${instanceId}?data=true`,
      headers: kopf(),
    });
    expect(geloescht.statusCode).toBe(200);

    const detail = await app.server.inject({
      method: 'GET',
      url: `/api/instances/${instanceId}`,
      headers: kopf(false),
    });
    expect(detail.statusCode).toBe(404);
  });

  // --- Vorlagenverwaltung ---------------------------------------------------

  it('antwortet auf eine unbekannte Vorlage mit 404 statt abzustürzen', async () => {
    // Vor dem Umbau war `GameId` ein Enum und dieser Fall unmöglich; seit
    // Vorlagen anlegbar sind, ist er ein normaler Zustand.
    const antwort = await app.server.inject({
      method: 'GET',
      url: '/api/templates/gibtsnicht/ports',
      headers: kopf(false),
    });
    expect(antwort.statusCode).toBe(404);
  });

  it('legt eine eigene Vorlage an, nutzt sie und lehnt das Löschen dann ab', async () => {
    const angelegt = await app.server.inject({
      method: 'POST',
      url: '/api/templates',
      headers: kopf(),
      payload: eigeneVorlage(),
    });
    expect(angelegt.statusCode, angelegt.body).toBe(201);

    // Sie steht sofort im Wizard.
    const liste = await app.server.inject({ method: 'GET', url: '/api/templates', headers: kopf(false) });
    expect(liste.json<{ templates: { id: string }[] }>().templates.map((t) => t.id)).toContain('kartoffelkrieg');

    // Und eine Instanz daraus lässt sich anlegen.
    const instanz = await app.server.inject({
      method: 'POST',
      url: '/api/instances',
      headers: kopf(),
      payload: {
        game: 'kartoffelkrieg',
        name: 'Acker',
        ports: [{ name: 'game', host: 7777 }],
        memoryMb: 2048,
        cpus: 2,
        settings: { welt: 'Acker' },
        backupCron: '0 4 * * *',
        backupKeepDays: 7,
      },
    });
    expect(instanz.statusCode, instanz.body).toBe(201);
    const neueId = instanz.json<{ id: string }>().id;

    // Erst abwarten, bis der Anlege-Job durch ist. Wird die Instanz vorher
    // gelöscht, schreibt der Job noch, wenn `afterAll` die Datenbank schließt.
    await warteAuf(async () => {
      const detail = await app.server.inject({
        method: 'GET',
        url: `/api/instances/${neueId}`,
        headers: kopf(false),
      });
      return detail.json<{ status: string }>().status === 'Online';
    });

    const gesperrt = await app.server.inject({
      method: 'DELETE',
      url: '/api/templates/kartoffelkrieg',
      headers: kopf(),
    });
    expect(gesperrt.statusCode).toBe(400);
    expect(gesperrt.json<{ error: string }>().error).toMatch(/genutzt/);

    await app.server.inject({
      method: 'DELETE',
      url: `/api/instances/${neueId}?data=true`,
      headers: kopf(),
    });
    const geloescht = await app.server.inject({
      method: 'DELETE',
      url: '/api/templates/kartoffelkrieg',
      headers: kopf(),
    });
    expect(geloescht.statusCode).toBe(200);
  });

  it('lehnt eine unschlüssige Vorlage mit Feldfehlern ab', async () => {
    const kaputt = eigeneVorlage();
    kaputt.env = [{ name: 'X', source: { kind: 'field', field: 'gibtsNicht' }, trim: false, omitWhenEmpty: false }];
    const antwort = await app.server.inject({
      method: 'POST',
      url: '/api/templates',
      headers: kopf(),
      payload: kaputt,
    });
    expect(antwort.statusCode).toBe(400);
    expect(antwort.json<{ fields: { message: string }[] }>().fields[0]?.message).toMatch(/Unbekanntes Feld/);
  });

  it('meldet den KI-Entwurf ohne Schlüssel als nicht verfügbar', async () => {
    const antwort = await app.server.inject({
      method: 'GET',
      url: '/api/templates/ki/status',
      headers: kopf(false),
    });
    expect(antwort.json<{ available: boolean }>().available).toBe(false);

    const versuch = await app.server.inject({
      method: 'POST',
      url: '/api/templates/ki/entwurf',
      headers: kopf(),
      payload: { game: 'Irgendwas', image: 'beispiel/image' },
    });
    expect(versuch.statusCode).toBe(503);
  });

  /**
   * Mit Schlüssel meldet die Statusroute `available` und die Oberfläche zeigt
   * den Knopf. Ein echter Aufruf findet nicht statt — geprüft ist damit die
   * Verdrahtung von Umgebungsvariable bis Route, nicht der Gemini-Aufruf selbst.
   */
  it('schaltet den KI-Entwurf frei, sobald ein Schlüssel hinterlegt ist', async () => {
    const verzeichnis = mkdtempSync(join(tmpdir(), 'gsp-ki-'));
    const mitSchluessel = await buildApp(
      loadConfig({
        GSP_DATA_DIR: verzeichnis,
        GSP_RUNTIME: 'fake',
        GSP_LOG_LEVEL: 'silent',
        GSP_GEMINI_API_KEY: 'test-schluessel',
        GSP_GEMINI_MODELL: 'gemini-test',
        TZ: 'Europe/Berlin',
      }),
      new FakeRuntime(0, 0),
    );

    try {
      const status = mitSchluessel.services.drafts.status();
      expect(status.available).toBe(true);
      expect(status.model).toBe('gemini-test');
    } finally {
      await mitSchluessel.close();
      rmSync(verzeichnis, { recursive: true, force: true });
    }
  });

  it('markiert Instanzen, deren Vorlage sich geändert hat', async () => {
    // Die Minecraft-Instanz ist zu diesem Zeitpunkt gelöscht; die Valheim-Instanz
    // aus dem Maskierungstest besteht noch.
    const liste = await app.server.inject({ method: 'GET', url: '/api/instances', headers: kopf(false) });
    const valheim = liste
      .json<{ instances: { id: string; game: string; templateStale: boolean }[] }>()
      .instances.find((i) => i.game === 'valheim');
    expect(valheim?.templateStale).toBe(false);

    const definition = (
      await app.server.inject({
        method: 'GET',
        url: '/api/templates/valheim/definition',
        headers: kopf(false),
      })
    ).json<{ definition: Record<string, unknown> }>().definition;

    const gespeichert = await app.server.inject({
      method: 'PUT',
      url: '/api/templates/valheim',
      headers: kopf(),
      payload: { ...definition, defaultMemoryMb: 12288 },
    });
    expect(gespeichert.statusCode, gespeichert.body).toBe(200);

    const nachher = await app.server.inject({
      method: 'GET',
      url: `/api/instances/${valheim?.id}`,
      headers: kopf(false),
    });
    // Die Instanz läuft unverändert weiter — erst ein Neuaufbau übernimmt den Stand.
    expect(nachher.json<{ templateStale: boolean }>().templateStale).toBe(true);
    expect(nachher.json<{ status: string }>().status).not.toBe('Fehler');
  });
});

/** Minimale, gültige Vorlage für die Routentests. */
function eigeneVorlage(): Record<string, unknown> {
  return {
    id: 'kartoffelkrieg',
    label: 'Kartoffelkrieg',
    summary: 'Nur für Tests.',
    image: 'beispiel/kartoffelkrieg',
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
        id: 'welt', label: 'Welt', type: 'text', default: 'Acker',
        required: true, editable: true, restartRequired: true, secret: false,
      },
    ],
    env: [{ name: 'WORLD', source: { kind: 'field', field: 'welt' }, trim: false, omitWhenEmpty: false }],
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

/** Wartet, bis eine Bedingung zutrifft — für Aktionen, die als Job laufen. */
async function warteAuf(bedingung: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const ende = Date.now() + timeoutMs;
  while (Date.now() < ende) {
    if (await bedingung()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Bedingung wurde nicht rechtzeitig erfüllt');
}

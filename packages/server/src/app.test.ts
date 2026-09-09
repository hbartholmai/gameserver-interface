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
});

/** Wartet, bis eine Bedingung zutrifft — für Aktionen, die als Job laufen. */
async function warteAuf(bedingung: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const ende = Date.now() + timeoutMs;
  while (Date.now() < ende) {
    if (await bedingung()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Bedingung wurde nicht rechtzeitig erfüllt');
}

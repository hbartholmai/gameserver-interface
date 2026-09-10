import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
// Erweitert Request um `file()` für den Mod-Upload.
import '@fastify/multipart';
import {
  banRequestSchema,
  commandRequestSchema,
  createInstanceRequestSchema,
  clockHms,
  gameIdSchema,
  getTemplate,
  listTemplates,
  toDescriptor,
  updateSettingsRequestSchema,
  formatBytes,
  worldUploadOptionsSchema,
} from '@gsp/shared';
import { getAdapter, UnsupportedError } from '../games/index.js';
import type { Store } from '../db/store.js';
import type { BackupService } from '../services/backups.js';
import type { InstanceService } from '../services/instances.js';
import { ValidationError } from '../services/instances.js';
import type { JobService } from '../services/jobs.js';
import type { LogService } from '../services/logs.js';
import type { ModService } from '../services/mods.js';
import type { TemplateService } from '../services/templates.js';
import type { Ticker } from '../services/ticker.js';
import { WeltError, type WeltService } from '../services/welt.js';
import { brauchtZip64, packeZip, sammleEintraege } from '../services/welt-zip.js';
import type { Config } from '../config.js';
import { slug } from '../services/paths.js';

interface Deps {
  instances: InstanceService;
  store: Store;
  logs: LogService;
  mods: ModService;
  backups: BackupService;
  jobs: JobService;
  ticker: Ticker;
  templates: TemplateService;
  welt: WeltService;
  config: Config;
}

/**
 * RFC 6266: `filename` ist der ASCII-Notnagel für alte Clients, `filename*`
 * (RFC 5987) trägt den echten Namen. Beide zu setzen ist der einzige Weg, der
 * überall funktioniert — ein Weltname mit Umlaut käme sonst verstümmelt an.
 */
function anhang(name: string): string {
  const punkt = name.lastIndexOf('.');
  const stamm = punkt > 0 ? name.slice(0, punkt) : name;
  const endung = punkt > 0 ? name.slice(punkt) : '';
  const ascii = `${slug(stamm)}${endung.replace(/[^ -~]/g, '')}`;
  // `encodeURIComponent` lässt `!'()*` stehen; RFC 5987 will sie kodiert.
  const kodiert = encodeURIComponent(name).replace(
    /['()!*]/g,
    (z) => `%${z.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${kodiert}`;
}

/** Wert eines Multipart-Textfelds. */
function feldWert(fields: unknown, name: string): string | undefined {
  const eintrag = (fields as Record<string, { value?: unknown } | undefined>)[name];
  return typeof eintrag?.value === 'string' ? eintrag.value : undefined;
}

export async function instanceRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { instances, store, logs, mods, backups, jobs, ticker, templates, welt, config } = deps;

  /** Bricht mit 404 ab, wenn die Instanz nicht existiert. */
  const need = (id: string) => {
    const instance = instances.get(id);
    if (!instance) throw new ValidationError('Instanz nicht gefunden');
    return instance;
  };

  app.get('/api/host', async () => ticker.hostStatus());

  app.get('/api/templates', async () => ({
    templates: listTemplates().map(toDescriptor),
  }));

  /** Freie Portvorschläge für den Anlege-Dialog. */
  app.get<{ Params: { game: string } }>('/api/templates/:game/ports', async (request, reply) => {
    const game = gameIdSchema.safeParse(request.params.game);
    if (!game.success) return reply.code(404).send({ error: 'Unbekannte Vorlage' });
    return { ports: instances.suggestPorts(game.data) };
  });

  app.get('/api/instances', async () => {
    const list = await Promise.all(instances.list().map((i) => instances.toDto(i)));
    return { instances: list };
  });

  app.get<{ Params: { id: string } }>('/api/instances/:id', async (request) =>
    instances.toDto(need(request.params.id)),
  );

  app.post('/api/instances', async (request, reply) => {
    const parsed = createInstanceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Ungültige Eingabe',
        detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const { instance, job } = await instances.create(parsed.data);
    return reply.code(201).send({ id: instance.id, job });
  });

  app.delete<{ Params: { id: string }; Querystring: { data?: string } }>(
    '/api/instances/:id',
    async (request) => {
      need(request.params.id);
      // Weltdaten werden nur auf ausdrückliche Anforderung mitgelöscht.
      await instances.remove(request.params.id, request.query.data === 'true');
      return { ok: true };
    },
  );

  app.patch<{ Params: { id: string } }>('/api/instances/:id/settings', async (request, reply) => {
    need(request.params.id);
    const parsed = updateSettingsRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Ungültige Eingabe' });
    await instances.updateSettings(request.params.id, parsed.data.settings, parsed.data.restart);
    return { ok: true };
  });

  for (const action of ['start', 'stop', 'restart'] as const) {
    app.post<{ Params: { id: string } }>(`/api/instances/:id/${action}`, async (request) => {
      need(request.params.id);
      await instances[action](request.params.id);
      return { ok: true };
    });
  }

  app.post<{ Params: { id: string } }>('/api/instances/:id/update', async (request) => {
    need(request.params.id);
    return { job: instances.update(request.params.id) };
  });

  // --- Konsole --------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/api/instances/:id/logs', async (request) => {
    need(request.params.id);
    return { lines: logs.buffer(request.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/instances/:id/command', async (request, reply) => {
    const instance = need(request.params.id);
    const parsed = commandRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Kein Befehl übergeben' });

    const template = getTemplate(instance.game);
    if (template.capabilities.console !== 'rcon') {
      return reply.code(400).send({ error: template.notes[0] ?? 'Konsole ist nur lesend' });
    }

    // Der abgesetzte Befehl erscheint im Log — mit Benutzer, für die Nachvollziehbarkeit.
    const user = request.session?.username ?? 'unbekannt';
    logs.append(instance.id, { time: clockHms(), level: 'CMD', text: `> ${parsed.data.command}` });
    app.log.info({ instance: instance.id, user, command: parsed.data.command }, 'Konsolenbefehl');

    try {
      const response = await getAdapter(instance.game).sendCommand(
        instances.adapterContext(instance),
        parsed.data.command,
      );
      if (response.trim()) {
        logs.append(instance.id, { time: clockHms(), level: 'INFO', text: response.trim() });
      }
      return { response };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logs.append(instance.id, { time: clockHms(), level: 'ERROR', text: message });
      return reply.code(err instanceof UnsupportedError ? 400 : 502).send({ error: message });
    }
  });

  // --- Spieler --------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/api/instances/:id/players', async (request) => {
    const instance = need(request.params.id);
    return {
      players: await getAdapter(instance.game).listPlayers(instances.adapterContext(instance)),
      bans: store.listBans(instance.id),
    };
  });

  app.post<{ Params: { id: string; name: string } }>(
    '/api/instances/:id/players/:name/kick',
    async (request, reply) => {
      const instance = need(request.params.id);
      try {
        await getAdapter(instance.game).kick(instances.adapterContext(instance), request.params.name);
        store.addEvent(instance.id, `${request.params.name} wurde entfernt`);
        return { ok: true };
      } catch (err) {
        return unsupported(reply, err);
      }
    },
  );

  app.post<{ Params: { id: string; name: string } }>(
    '/api/instances/:id/players/:name/ban',
    async (request, reply) => {
      const instance = need(request.params.id);
      const parsed = banRequestSchema.safeParse(request.body ?? {});
      const reason = parsed.success ? parsed.data.reason : 'manuell gesperrt · dauerhaft';
      try {
        await getAdapter(instance.game).ban(
          instances.adapterContext(instance),
          request.params.name,
          reason,
        );
        store.addBan(instance.id, request.params.name, reason);
        store.addEvent(instance.id, `${request.params.name} wurde gesperrt`);
        return { ok: true };
      } catch (err) {
        return unsupported(reply, err);
      }
    },
  );

  app.delete<{ Params: { id: string; name: string } }>(
    '/api/instances/:id/bans/:name',
    async (request, reply) => {
      const instance = need(request.params.id);
      try {
        await getAdapter(instance.game).unban(instances.adapterContext(instance), request.params.name);
      } catch (err) {
        if (!(err instanceof UnsupportedError)) return unsupported(reply, err);
        // Ohne Serverunterstützung wird die Sperre nur im Panel geführt.
      }
      store.removeBan(instance.id, request.params.name);
      store.addEvent(instance.id, `Sperre für ${request.params.name} aufgehoben`);
      return { ok: true };
    },
  );

  // --- Backups --------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/api/instances/:id/backups', async (request) => {
    need(request.params.id);
    return { backups: store.listBackups(request.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/instances/:id/backups', async (request) => {
    need(request.params.id);
    return { job: instances.backup(request.params.id, 'manuell') };
  });

  app.post<{ Params: { id: string; backupId: string } }>(
    '/api/instances/:id/backups/:backupId/restore',
    async (request, reply) => {
      need(request.params.id);
      if (!store.getBackup(request.params.id, request.params.backupId)) {
        return reply.code(404).send({ error: 'Backup nicht gefunden' });
      }
      return { job: instances.restore(request.params.id, request.params.backupId) };
    },
  );

  app.delete<{ Params: { id: string; backupId: string } }>(
    '/api/instances/:id/backups/:backupId',
    async (request) => {
      const instance = need(request.params.id);
      await backups.remove(instance, request.params.backupId);
      return { ok: true };
    },
  );

  // --- Welt -----------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/api/instances/:id/welt', async (request, reply) => {
    const instance = need(request.params.id);
    const info = await welt.info(instance);
    if (!info) return reply.code(404).send({ error: 'Diese Vorlage benennt keine Weltdaten' });
    return { welt: info };
  });

  /**
   * Der Download läuft über eine GET-Route und nicht über den API-Client:
   * `request()` liest jede Antwort als Text und parst sie als JSON, und ein
   * `response.blob()` legte die ganze Welt in den Speicher des Browsers — bei
   * mehreren Gigabyte stürzt der Tab ab. So streamt der Browser auf die Platte,
   * zeigt seinen eigenen Fortschritt und übersteht einen Reload.
   */
  app.get<{ Params: { id: string } }>(
    '/api/instances/:id/welt/download',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const instance = need(request.params.id);
      const ziel = welt.ziel(instance);
      if (!ziel) return reply.code(404).send({ error: 'Diese Vorlage benennt keine Weltdaten' });

      const vorhanden = await welt.vorhandeneTeile(instance, ziel);
      if (vorhanden.length === 0) {
        return reply
          .code(404)
          .send({ error: 'Es gibt noch keine Weltdaten — die Instanz war nie gestartet' });
      }

      const roh = welt.istRoh(ziel, vorhanden.map((t) => t.fileName));
      const name = welt.downloadName(instance, ziel, roh);

      if (roh) {
        const teil = vorhanden[0]!;
        const info = await stat(teil.hostPath);
        reply.header('content-type', 'application/octet-stream');
        reply.header('content-length', String(info.size));
        reply.header('content-disposition', anhang(name));
        return reply.send(createReadStream(teil.hostPath));
      }

      const eintraege = (
        await Promise.all(vorhanden.map((t) => sammleEintraege(t.hostPath, t.fileName)))
      ).flat();
      const groessen = await Promise.all(
        eintraege.map((e) => stat(e.hostPath).then((i) => i.size).catch(() => 0)),
      );
      const gesamt = groessen.reduce((summe, g) => summe + g, 0);

      reply.header('content-type', 'application/zip');
      reply.header('content-disposition', anhang(name));
      const strom = packeZip(eintraege, brauchtZip64(gesamt, eintraege.length));
      // Bricht der Benutzer ab, soll der Server nicht weiter von der Platte
      // lesen — ein abgebrochener 20-GB-Download liefe sonst zu Ende.
      reply.raw.on('close', () => {
        strom.destroy(new Error('Download abgebrochen'));
      });
      return reply.send(strom);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/instances/:id/welt',
    { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const instance = need(request.params.id);
      const ziel = welt.ziel(instance);
      if (!ziel) return reply.code(404).send({ error: 'Diese Vorlage benennt keine Weltdaten' });

      const feld = await request.file({
        // Das globale Limit von 256 MB gilt für Mods; eine Welt sprengt es.
        limits: { fileSize: config.worldUploadMaxBytes, files: 1 },
      });
      if (!feld) return reply.code(400).send({ error: 'Keine Datei übertragen' });

      let quelle;
      try {
        quelle = await welt.entgegennehmen(ziel, feld.filename, feld.file);
      } catch (err) {
        // Eine falsche Endung ist Benutzereingabe, kein Serverfehler.
        if (err instanceof WeltError) return reply.code(400).send({ error: err.message });
        throw err;
      }
      if (feld.file.truncated) {
        await rm(quelle.pfad, { force: true });
        return reply
          .code(400)
          .send({ error: `Die Datei ist größer als ${formatBytes(config.worldUploadMaxBytes)}` });
      }

      /*
       * Die Option kommt als Multipart-Textfeld, also als Zeichenkette.
       * `z.coerce.boolean()` wäre hier eine Falle: `Boolean('false')` ist
       * `true`, und die Sicherung ließe sich nie abwählen.
       */
      const gewaehlt = feldWert(feld.fields, 'backup');
      const optionen = worldUploadOptionsSchema.safeParse({ backup: gewaehlt });
      if (!optionen.success) {
        await rm(quelle.pfad, { force: true });
        return reply.code(400).send({ error: 'Ungültige Eingabe' });
      }

      try {
        return { job: await instances.replaceWorld(instance.id, quelle, optionen.data.backup) };
      } catch (err) {
        await rm(quelle.pfad, { force: true });
        // Eine laufende Instanz ist kein Eingabefehler, sondern ein Konflikt.
        if (err instanceof ValidationError && err.message.includes('gestoppt')) {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // --- Mods -----------------------------------------------------------------

  app.get<{ Params: { id: string } }>('/api/instances/:id/mods', async (request) => {
    const instance = need(request.params.id);
    return { mods: await mods.list(instance) };
  });

  app.patch<{ Params: { id: string; file: string }; Body: { enabled?: boolean } }>(
    '/api/instances/:id/mods/:file',
    async (request, reply) => {
      const instance = need(request.params.id);
      if (typeof request.body?.enabled !== 'boolean') {
        return reply.code(400).send({ error: 'Feld `enabled` fehlt' });
      }
      await mods.setEnabled(instance, decodeURIComponent(request.params.file), request.body.enabled);
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string; file: string } }>(
    '/api/instances/:id/mods/:file',
    async (request) => {
      const instance = need(request.params.id);
      await mods.remove(instance, decodeURIComponent(request.params.file));
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>('/api/instances/:id/mods', async (request, reply) => {
    const instance = need(request.params.id);
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Keine Datei übertragen' });
    await mods.add(instance, file.filename, await file.toBuffer());
    return { ok: true };
  });

  // --- Jobs -----------------------------------------------------------------

  app.get('/api/jobs', async () => ({ jobs: jobs.listRecent() }));

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const job = jobs.get(request.params.id);
    if (!job) return reply.code(404).send({ error: 'Job nicht gefunden' });
    return job;
  });
}

function unsupported(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(err instanceof UnsupportedError ? 400 : 502).send({ error: message });
}

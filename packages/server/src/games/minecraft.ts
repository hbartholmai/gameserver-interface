import { Rcon } from 'rcon-client';
import type { Player } from '@gsp/shared';
import { pingMinecraft } from '../util/mcping.js';
import { UnsupportedError, withPlaytime, type AdapterContext, type GameAdapter, type Probe } from './types.js';

/**
 * Minecraft über RCON. Verbindungen werden je Instanz offen gehalten und bei
 * Fehlern verworfen — RCON bricht bei einem Serverneustart ab.
 */
const connections = new Map<string, Promise<Rcon>>();

async function rcon(ctx: AdapterContext): Promise<Rcon> {
  const key = ctx.instance.id;
  const existing = connections.get(key);
  if (existing) {
    try {
      return await existing;
    } catch {
      connections.delete(key);
    }
  }
  const password = ctx.instance.secrets.rconPassword;
  if (!password) throw new UnsupportedError('Für diese Instanz ist kein RCON-Passwort hinterlegt');

  // RCON ist nicht auf dem Host veröffentlicht — erreichbar ist es über die
  // Container-IP. Im Panel-Container läuft der Zugriff über den Container-Namen.
  const pending = Rcon.connect({
    host: ctx.instance.containerName,
    port: 25575,
    password,
    timeout: 5000,
  }).then((client) => {
    client.on('end', () => connections.delete(key));
    client.on('error', () => connections.delete(key));
    return client;
  });
  connections.set(key, pending);
  try {
    return await pending;
  } catch (err) {
    connections.delete(key);
    throw err;
  }
}

export function dropRconConnection(instanceId: string): void {
  const pending = connections.get(instanceId);
  connections.delete(instanceId);
  void pending?.then((client) => client.end()).catch(() => undefined);
}

/** Antwort von `list`: `There are 3 of a max of 10 players online: a, b, c`. */
export function parsePlayerList(response: string): { online: number; max: number; names: string[] } {
  const counts = /There are (\d+)[^\d]+(\d+)/.exec(response);
  const online = counts ? Number(counts[1]) : 0;
  const max = counts ? Number(counts[2]) : 0;
  const tail = response.slice(response.indexOf(':') + 1).trim();
  const names = tail
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && !n.includes(' '));
  return { online, max, names };
}

/** Antwort von `tps` (Paper): `TPS from last 1m, 5m, 15m: 19.87, 19.9, 20.0`. */
export function parseTps(response: string): string | null {
  const match = /([\d.]+)/.exec(response.replace(/§./g, '').split(':').pop() ?? '');
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return `${value.toFixed(1).replace('.', ',')} TPS`;
}

export const rconAdapter: GameAdapter = {

  async probe(ctx): Promise<Probe | null> {
    const port = ctx.instance.ports.game;
    if (!port) return null;
    const status = await pingMinecraft(ctx.publicHost, port);
    if (!status) return null;

    let tps: string | null = null;
    try {
      const client = await rcon(ctx);
      tps = parseTps(await client.send('tps'));
    } catch {
      // Paper-spezifisch; Vanilla kennt `tps` nicht. Kein Fehlerfall.
    }

    return {
      playerCount: status.players,
      maxPlayers: status.maxPlayers,
      pingMs: status.pingMs,
      version: status.versionName,
      tps,
      names: status.sample.length > 0 ? status.sample : null,
    };
  },

  async listPlayers(ctx): Promise<Player[]> {
    try {
      const client = await rcon(ctx);
      const { names } = parsePlayerList(await client.send('list'));
      return withPlaytime(ctx, names);
    } catch {
      // Ohne RCON bleibt die aus dem Log abgeleitete Liste.
      return withPlaytime(ctx, [...ctx.logPlayers]);
    }
  },

  async sendCommand(ctx, command): Promise<string> {
    const client = await rcon(ctx);
    return client.send(command.replace(/^\//, ''));
  },

  async kick(ctx, name): Promise<void> {
    const client = await rcon(ctx);
    await client.send(`kick ${name}`);
  },

  async ban(ctx, name, reason): Promise<void> {
    const client = await rcon(ctx);
    await client.send(`ban ${name} ${reason}`);
  },

  async unban(ctx, name): Promise<void> {
    const client = await rcon(ctx);
    await client.send(`pardon ${name}`);
  },
};

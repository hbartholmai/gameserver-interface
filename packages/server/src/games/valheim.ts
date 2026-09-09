import type { Player } from '@gsp/shared';
import { queryA2sInfo } from '../util/a2s.js';
import { UnsupportedError, withPlaytime, type AdapterContext, type GameAdapter, type Probe } from './types.js';

/**
 * Valheim. Das Spiel bietet kein RCON und keine stdin-Konsole — Admin-Befehle
 * gibt es nur im Spiel. Die Spielerzahl kommt per A2S vom Query-Port, die
 * Namen aus den `ZDOID`-Zeilen des Logs.
 */
export const valheimAdapter: GameAdapter = {
  game: 'valheim',

  async probe(ctx): Promise<Probe | null> {
    const port = ctx.instance.ports.query;
    if (!port) return null;
    const info = await queryA2sInfo(ctx.publicHost, port);
    if (!info) return null;
    return {
      playerCount: info.players,
      maxPlayers: info.maxPlayers > 0 ? info.maxPlayers : null,
      pingMs: info.pingMs,
      version: null,
      tps: null,
      names: null,
    };
  },

  /**
   * Die A2S-Abfrage liefert nur eine Zahl. Weicht sie von den aus dem Log
   * gelesenen Namen ab, gewinnt die Zahl: überzählige Namen werden verworfen,
   * fehlende als unbekannte Spieler ergänzt.
   */
  async listPlayers(ctx): Promise<Player[]> {
    const names = [...ctx.logPlayers];
    const players = withPlaytime(ctx, names);
    const port = ctx.instance.ports.query;
    if (!port) return players;

    const info = await queryA2sInfo(ctx.publicHost, port);
    if (!info) return players;

    if (players.length > info.players) return players.slice(0, info.players);
    const unknown: Player[] = [];
    for (let i = players.length; i < info.players; i += 1) {
      unknown.push({ name: 'unbekannter Spieler', playtimeSec: null, pingMs: null });
    }
    return [...players, ...unknown];
  },

  async sendCommand(): Promise<string> {
    throw new UnsupportedError(
      'Valheim nimmt keine Befehle über den Server entgegen — nutze die Admin-Konsole (F5) im Spiel.',
    );
  },

  async kick(): Promise<void> {
    throw new UnsupportedError('Kick ist bei Valheim nur über die Admin-Konsole im Spiel möglich.');
  },

  async ban(): Promise<void> {
    throw new UnsupportedError('Bann ist bei Valheim nur über die Admin-Konsole im Spiel möglich.');
  },

  async unban(): Promise<void> {
    throw new UnsupportedError('Bann ist bei Valheim nur über die Admin-Konsole im Spiel möglich.');
  },
};

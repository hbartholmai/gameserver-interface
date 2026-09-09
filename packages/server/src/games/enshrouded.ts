import type { Player } from '@gsp/shared';
import { UnsupportedError, withPlaytime, type AdapterContext, type GameAdapter, type Probe } from './types.js';

/**
 * Enshrouded. Der Server bietet weder RCON noch eine Steam-Abfrage, die das
 * Panel auswerten könnte — Spielerzahl und Namen stammen ausschließlich aus dem
 * Log, einen Ping liefert das Spiel nicht.
 */
export const enshroudedAdapter: GameAdapter = {
  game: 'enshrouded',

  async probe(ctx): Promise<Probe | null> {
    return {
      playerCount: ctx.logPlayers.size,
      maxPlayers: Number(ctx.instance.settings.slotCount ?? 16),
      pingMs: null,
      version: null,
      tps: null,
      names: [...ctx.logPlayers],
    };
  },

  async listPlayers(ctx): Promise<Player[]> {
    return withPlaytime(ctx, [...ctx.logPlayers]);
  },

  async sendCommand(): Promise<string> {
    throw new UnsupportedError('Enshrouded bietet keine Serverkonsole — Befehle sind nicht möglich.');
  },

  async kick(): Promise<void> {
    throw new UnsupportedError('Kick ist bei Enshrouded nur im Spiel über eine Admin-Rolle möglich.');
  },

  async ban(): Promise<void> {
    throw new UnsupportedError('Bann ist bei Enshrouded nur im Spiel über eine Admin-Rolle möglich.');
  },

  async unban(): Promise<void> {
    throw new UnsupportedError('Bann ist bei Enshrouded nur im Spiel über eine Admin-Rolle möglich.');
  },
};

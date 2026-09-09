import { getTemplate, type Player } from '@gsp/shared';
import { UnsupportedError, withPlaytime, type AdapterContext, type GameAdapter, type Probe } from './types.js';

/**
 * Adapter für Vorlagen mit `players: 'log'` — der schmalste Fall: weder RCON
 * noch eine auswertbare Serverabfrage. Spielerzahl und Namen stammen
 * ausschließlich aus dem Log, einen Ping gibt es nicht.
 *
 * Die Slotzahl steht als `adapter.maxPlayersField` in der Vorlage.
 */
export const logAdapter: GameAdapter = {

  async probe(ctx): Promise<Probe | null> {
    return {
      playerCount: ctx.logPlayers.size,
      maxPlayers: maxPlayers(ctx),
      pingMs: null,
      version: null,
      tps: null,
      names: [...ctx.logPlayers],
    };
  },

  async listPlayers(ctx): Promise<Player[]> {
    return withPlaytime(ctx, [...ctx.logPlayers]);
  },

  async sendCommand(ctx): Promise<string> {
    throw new UnsupportedError(
      `${label(ctx)} bietet keine Serverkonsole — Befehle sind nicht möglich.`,
    );
  },

  async kick(ctx): Promise<void> {
    throw new UnsupportedError(`Kick ist bei ${label(ctx)} nur im Spiel möglich.`);
  },

  async ban(ctx): Promise<void> {
    throw new UnsupportedError(`Bann ist bei ${label(ctx)} nur im Spiel möglich.`);
  },

  async unban(ctx): Promise<void> {
    throw new UnsupportedError(`Bann ist bei ${label(ctx)} nur im Spiel möglich.`);
  },
};

/**
 * Ohne benanntes Feld bleibt die Anzeige bei 0 — eine erfundene Zahl wäre
 * schlechter als eine sichtbar fehlende.
 */
function maxPlayers(ctx: AdapterContext): number {
  const feld = getTemplate(ctx.instance.game).definition.adapter.maxPlayersField;
  if (!feld) return 0;
  return Number(ctx.instance.settings[feld] ?? 0);
}

function label(ctx: AdapterContext): string {
  return getTemplate(ctx.instance.game).label;
}

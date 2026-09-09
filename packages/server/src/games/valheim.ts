import { getTemplate, type Player } from '@gsp/shared';
import { queryA2sInfo } from '../util/a2s.js';
import { UnsupportedError, withPlaytime, type AdapterContext, type GameAdapter, type Probe } from './types.js';

/**
 * Adapter für Vorlagen mit `players: 'a2s'` — die Spielerzahl kommt per
 * Steam-Query vom Abfrageport, die Namen aus dem Log. Ursprünglich für Valheim
 * geschrieben, aber nichts daran ist valheimspezifisch: welcher Port abgefragt
 * wird, steht als `adapter.queryPortName` in der Vorlage.
 *
 * Spiele dieser Art bieten typischerweise keine Serverkonsole; Befehle,
 * Kick und Bann werfen deshalb `UnsupportedError` mit einem Text, der den Grund
 * nennt — er erscheint so in der Oberfläche.
 */
export const a2sAdapter: GameAdapter = {

  async probe(ctx): Promise<Probe | null> {
    const port = ctx.instance.ports[queryPortName(ctx)];
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
    const port = ctx.instance.ports[queryPortName(ctx)];
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

  async sendCommand(ctx): Promise<string> {
    throw new UnsupportedError(
      `${label(ctx)} nimmt keine Befehle über den Server entgegen — nutze die Konsole im Spiel.`,
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

/** Ohne Angabe in der Vorlage bleibt `query` der gebräuchliche Name. */
function queryPortName(ctx: AdapterContext): string {
  return getTemplate(ctx.instance.game).definition.adapter.queryPortName ?? 'query';
}

function label(ctx: AdapterContext): string {
  return getTemplate(ctx.instance.game).label;
}

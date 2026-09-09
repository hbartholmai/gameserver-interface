import type { GameId, Player } from '@gsp/shared';
import type { InstanceRecord } from '../db/store.js';
import type { Store } from '../db/store.js';
import type { Runtime } from '../runtime/types.js';

export interface AdapterContext {
  instance: InstanceRecord;
  runtime: Runtime;
  store: Store;
  /** Host, unter dem die Instanz von außen erreichbar ist. */
  publicHost: string;
  /** Aktuell im Log gesehene Spielernamen. */
  logPlayers: Set<string>;
}

/** Ergebnis einer Serverabfrage. Nicht verfügbare Werte sind `null`. */
export interface Probe {
  playerCount: number | null;
  maxPlayers: number | null;
  pingMs: number | null;
  version: string | null;
  /** Vorformatierte Tickrate wie `19,7 TPS`. */
  tps: string | null;
  /** Namen, sofern die Abfrage sie liefert. */
  names: string[] | null;
}

export interface GameAdapter {
  readonly game: GameId;
  /** Zustandsabfrage über das Spielprotokoll. */
  probe(ctx: AdapterContext): Promise<Probe | null>;
  /** Spielerliste inklusive Spielzeit aus den gespeicherten Sitzungen. */
  listPlayers(ctx: AdapterContext): Promise<Player[]>;
  /** Konsolenbefehl absetzen. Wirft, wenn die Vorlage das nicht unterstützt. */
  sendCommand(ctx: AdapterContext, command: string): Promise<string>;
  kick(ctx: AdapterContext, name: string): Promise<void>;
  ban(ctx: AdapterContext, name: string, reason: string): Promise<void>;
  unban(ctx: AdapterContext, name: string): Promise<void>;
}

/**
 * Baut die Spielerliste aus Namen plus den in der Datenbank offenen Sitzungen.
 * Die Spielzeit stammt damit aus dem Panel und nicht aus dem Spiel — kein
 * Serverprotokoll der drei Spiele liefert sie.
 */
export function withPlaytime(ctx: AdapterContext, names: string[], pings?: Map<string, number>): Player[] {
  const sessions = ctx.store.openSessions(ctx.instance.id);
  const now = Date.now();
  return names.map((name) => {
    const joinedAt = sessions.get(name);
    return {
      name,
      playtimeSec: joinedAt ? Math.max(0, Math.round((now - joinedAt) / 1000)) : null,
      pingMs: pings?.get(name) ?? null,
    };
  });
}

export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedError';
  }
}

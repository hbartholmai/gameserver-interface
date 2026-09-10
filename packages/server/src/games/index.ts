import { getTemplate, type GameTemplate } from '@gsp/shared';
import type { GameAdapter } from './types.js';
import { rconAdapter } from './minecraft.js';
import { a2sAdapter } from './valheim.js';
import { logAdapter } from './enshrouded.js';

/**
 * Der Adapter wird über die **Fähigkeiten** der Vorlage gewählt, nicht über die
 * Spiel-ID. Das war ohnehin schon die Regel für die Oberfläche („nie gegen
 * `game === '…'` prüfen“) und ist mit anlegbaren Vorlagen zwingend: eine feste
 * Zuordnung `Record<GameId, GameAdapter>` kann eine erst zur Laufzeit
 * entstandene Vorlage nicht kennen.
 *
 * **Konsole und Spielerliste sind zwei Fragen, nicht eine.** Die
 * Fähigkeitstabelle beschreibt sie seit jeher als getrennte Spalten, aber die
 * Auswahl richtete sich allein nach `players` — was bei den drei ursprünglichen
 * Vorlagen nicht auffiel, weil keine die Spalten unterschiedlich belegte.
 * Palworld tut es: Spielerzahl per Steam-Abfrage, Konsole per RCON. Deshalb
 * wird hier zusammengesetzt statt ausgewählt.
 */
export function adapterFor(template: GameTemplate): GameAdapter {
  const basis = spielerAdapter(template.capabilities.players);
  if (template.capabilities.console !== 'rcon') return basis;

  return {
    ...basis,
    // Die Konsole kommt von RCON, auch wenn die Spielerliste anderswo herkommt.
    sendCommand: rconAdapter.sendCommand,
    // Kick und Bann nur, wo die Vorlage sie zusagt: Palworld etwa hat RCON,
    // adressiert Spieler dort aber über SteamIDs, die das Panel nicht führt.
    ...(template.capabilities.moderation
      ? { kick: rconAdapter.kick, ban: rconAdapter.ban, unban: rconAdapter.unban }
      : {}),
  };
}

function spielerAdapter(players: GameTemplate['capabilities']['players']): GameAdapter {
  switch (players) {
    case 'rcon':
      return rconAdapter;
    case 'a2s':
      return a2sAdapter;
    case 'log':
      return logAdapter;
  }
}

export function getAdapter(game: string): GameAdapter {
  return adapterFor(getTemplate(game));
}

export * from './types.js';

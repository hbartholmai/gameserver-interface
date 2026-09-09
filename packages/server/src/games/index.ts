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
 * Ein neues Spiel, das RCON, Steam-Query oder nur das Log nutzt, braucht damit
 * gar keinen eigenen Adapter mehr — nur eine Vorlage.
 */
export function adapterFor(template: GameTemplate): GameAdapter {
  switch (template.capabilities.players) {
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

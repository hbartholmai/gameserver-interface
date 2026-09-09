import type { GameId } from '@gsp/shared';
import type { GameAdapter } from './types.js';
import { minecraftAdapter } from './minecraft.js';
import { valheimAdapter } from './valheim.js';
import { enshroudedAdapter } from './enshrouded.js';

const ADAPTERS: Record<GameId, GameAdapter> = {
  minecraft: minecraftAdapter,
  valheim: valheimAdapter,
  enshrouded: enshroudedAdapter,
};

export function getAdapter(game: GameId): GameAdapter {
  return ADAPTERS[game];
}

export * from './types.js';

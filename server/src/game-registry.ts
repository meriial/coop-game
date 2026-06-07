import { GameRegistry } from '@workshop/game-core/server';
import { periodicMatchEngine } from '@workshop/game-periodic-match/engine';
import { pixelHeartEngine } from '@workshop/game-pixel-heart/engine';

export const gameRegistry = new GameRegistry();
gameRegistry.register(periodicMatchEngine);
gameRegistry.register(pixelHeartEngine);

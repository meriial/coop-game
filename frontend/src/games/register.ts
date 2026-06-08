import { clientGameRegistry } from '@workshop/game-core/client';
import { emptyCanvasState } from '@workshop/protocol';
import { PeriodicMatch } from '@workshop/game-periodic-match/client';
import type { PeriodicMatchState } from '@workshop/game-periodic-match/types';
import { PixelHeart } from '@workshop/game-pixel-heart/client';
import type { PixelHeartState } from '@workshop/game-pixel-heart/types';

const EMPTY_MATCH: PeriodicMatchState = {
  matchBoard: [],
  matchClaimed: [],
  matchPending: {},
  matchRevealed: {},
  matchPaused: false,
  matchScores: [],
  matchElementCount: 118,
  gameOver: false,
};

clientGameRegistry.register<PeriodicMatchState>({
  id: 'periodic-match',
  Component: PeriodicMatch,
  selectState: (games) => (games['periodic-match'] as PeriodicMatchState | undefined) ?? EMPTY_MATCH,
});

clientGameRegistry.register<PixelHeartState>({
  id: 'pixel-heart',
  Component: PixelHeart,
  selectState: (games) =>
    (games['pixel-heart'] as PixelHeartState | undefined) ?? emptyCanvasState(),
});

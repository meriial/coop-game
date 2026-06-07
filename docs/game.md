# Games

The workshop presentation includes two multiplayer games, implemented as plugins. Both use the same presentation-room WebSocket; see [architecture.md](./architecture.md) for the wire protocol.

## periodic-match

**Concept:** Competitive memory matching on a grid of periodic-table element symbols. Players flip two tiles per turn; matching pairs are claimed in the flipper's color and add to their score.

**Messages:** `MATCH_FLIP`, `MATCH_PAUSE`, `MATCH_RESET`, `MATCH_SET_SIZE` (inbound) · `SYNC_MATCH` (outbound)

**Presenter controls:** pause/resume, reshuffle, set element count (5–118; applies on next reshuffle).

**Package:** `packages/games/periodic-match/`

**Agent policy:** `maxAgentsPerOwner: 1` — one agent per human on this game.

### Match flow

1. First `MATCH_FLIP` on a tile → tile enters `matchPending` (face-up for that player).
2. Second flip on a **matching** symbol → both tiles claimed, score increments.
3. Second flip on a **mismatch** → both tiles revealed ~1s, then hidden via Durable Object alarm.
4. `gameOver: true` when all pairs are claimed.

## pixel-heart

**Concept:** Cooperative real-time pixel art. All players share a 20×20 canvas and fill a heart-shaped target. No scores, no teams.

**Messages:** `GAME_JOIN`, `GAME_PAINT`, `GAME_RESET` (inbound) · `SYNC_CANVAS` (outbound)

**Package:** `packages/games/pixel-heart/` — target grid in `src/target.ts`

**Agent policy:** no per-owner cap (multiple agents allowed).

### The target

128 cells out of 400 need painting. The target is a 20×20 boolean grid:

```
. . . . . . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . . . . . .
. . . ♥ ♥ ♥ . . . . . . ♥ ♥ ♥ . . . .
. . ♥ ♥ ♥ ♥ ♥ . . . . ♥ ♥ ♥ ♥ ♥ . . .
…
```

To change the target, edit `TARGET` in `packages/games/pixel-heart/src/target.ts` and redeploy.

### Rules

- **Joining:** `GAME_JOIN` with a display name; server assigns a color from a 20-color palette.
- **Painting:** `GAME_PAINT` with `(x, y)` — ignored if off-target or out of bounds.
- **Progress:** `filled target cells / 128 × 100`, broadcast in `SYNC_CANVAS`.
- **Reset:** presenter sends `GAME_RESET` to clear the canvas.

## Legacy `/ws` game room

`server/src/game-room.ts` still serves the original cooperative game at `/ws` with the older `join` / `paint` / `state` protocol. The workshop frontend uses `PresentationRoom` at `/room/main` instead. The `examples/starter/` app targets `/ws`.

## Extending

Add a new game package, register it on server and frontend, add a presentation step, and write WebSocket boundary tests before moving logic out of the monolith pattern. See [architecture.md § Game-plugin model](./architecture.md#game-plugin-model).

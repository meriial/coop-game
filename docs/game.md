# Game Design

## Concept

Workshop Pixel Art is a cooperative real-time game. All connected players share a single 20×20 canvas and work together to fill in a target image. There are no teams, no scores, no losing — just one shared goal.

The cooperative framing removes friction during a workshop: participants aren't competing against each other or worrying about losing. The focus stays on building the client, not on winning.

## The target

The current target is a heart shape — 128 cells out of 400 need to be painted. The target is defined as a 20×20 boolean grid baked into the server (`server/src/game-room.ts`, `TARGET` constant).

```
. . . . . . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . . . . . .
. . . ♥ ♥ ♥ . . . . . . ♥ ♥ ♥ . . . .
. . ♥ ♥ ♥ ♥ ♥ . . . . ♥ ♥ ♥ ♥ ♥ . . .
. ♥ ♥ ♥ ♥ ♥ ♥ ♥ . . ♥ ♥ ♥ ♥ ♥ ♥ ♥ . .
. ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ .
. ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ .
. . ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ . .
. . . ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ . . .
. . . . ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ . . . .
. . . . . ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ . . . . .
. . . . . . ♥ ♥ ♥ ♥ ♥ ♥ ♥ . . . . . .
. . . . . . . ♥ ♥ ♥ ♥ ♥ . . . . . . .
. . . . . . . . ♥ ♥ ♥ . . . . . . . .
. . . . . . . . . ♥ . . . . . . . . .
. . . . . . . . . . . . . . . . . . . .   (×5)
```

To change the target between rounds, edit `TARGET` in `game-room.ts` and redeploy.

## Rules

- **Joining**: Enter a name and click Join. The server assigns you a color from a palette of 20.
- **Painting**: Click any unpainted target cell (♥) on the canvas. The server ignores clicks on non-target cells.
- **Repainting**: You can paint over a cell that another player already painted. Their contribution is replaced by yours.
- **Progress**: Displayed as a percentage — `filled target cells / 128 × 100`. Progress only ever increases (cells can be repainted but not cleared).
- **Victory**: When progress reaches 100%, the canvas matches the target.

## Player colors

Colors are assigned in order from a fixed palette of 20 distinct hues. The palette index is persisted in Durable Object storage, so it survives server restarts. If more than 20 players join, the palette wraps (players 21+ share colors with earlier players).

## Canvas persistence

The canvas state is written to Durable Object storage after every paint. It survives Worker restarts and cold starts. To reset the canvas, redeploy the Worker (the DO migration re-initializes storage) or add a reset endpoint.

## Extending the game

The starter app intentionally does the minimum: join, show the grid, paint. Workshop participants are encouraged to extend it. Some directions:

- **Animation** — flash or pulse a cell when it's painted
- **My score** — count cells carrying your color
- **Bot** — auto-claim one random unpainted target cell per second
- **Sound** — a short tone per paint event
- **Confetti** — burst on victory (`progress === 100`)
- **Color picker** — override your assigned color
- **New target** — change the `TARGET` array to a different 20×20 pattern and redeploy

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

## pixel-heart (co-op canvas)

**Concept:** Cooperative real-time painting on a shared, configurable grid. Players (and their agents) paint cells; colors blend with their neighbours, building emergent gradients. Occasional power-ups temporarily change how your paint behaves. No scores, no teams — it's meant to be playful.

> The game id is still `pixel-heart` for compatibility, but it is no longer a fixed heart target — it's a free canvas.

**Messages:** `GAME_JOIN`, `GAME_PAINT`, `GAME_PAINT_PATH`, `GAME_CONFIG`, `GAME_RESET` (inbound) · `SYNC_CANVAS` (outbound)

**Package:** `packages/games/pixel-heart/` — engine in `src/engine.ts`

**Agent policy:** no per-owner cap (multiple agents allowed).

### Grid & layout

- The canvas is `cols × rows`, both **admin-configurable** (defaults 32×18), stored in room `meta` and broadcast in `config`.
- The grid may be rectangular, but **cells are always square**. The client measures its container and computes an integer cell size so the board scales to fit the viewport and **never overflows**.

### Color mixing

Each cell is an accumulating RGBA value (`paint_cells` table). On a paint at `(x, y)`:

- **Center** → your color at full opacity.
- **8 neighbours** → blended toward your color at `mixStrength` (default `0.5`). An empty neighbour becomes your color at ~half alpha (the "half-transparent" look); an already-painted neighbour becomes a true blend.

Paints **accumulate** rather than overwrite, so repainting deepens and shifts a region. Cells are sent to the client as ready-to-render `rgba(...)` strings; `null` means unpainted.

### Power-ups

Power-ups spawn on empty cells on a timer (activity-gated on paints, so there's no Durable Object alarm contention with periodic-match; capped by `powerupMax`). The **first eligible** player to paint on a power-up cell consumes it and gains a temporary **blend-mode effect** for a number of paints:

| Kind | Effect | Charges |
|------|--------|---------|
| **Bloom** (`bloom`) | Much stronger blending — lush, saturated edges | 6 |
| **Prism** (`prism`) | Your color cycles through the rainbow each paint | 8 |
| **Supernova** (`supernova`) | Paints spread 2 cells out instead of 1 | 3 |
| **Additive** (`additive`) | Neighbours blend by adding light — overlaps brighten | 6 |

**Fairness rotation:** once you claim a power-up you are **ineligible until everyone else has claimed one**; then the cycle resets (`paint_powerup_claims`). The active effect is keyed per player (`paint_effects`) and surfaced in state so the painter and their agents can see it.

### Rate limiting

- A per-player **cooldown** (`cooldownMs`, default 150ms) gates `GAME_PAINT`, applied to humans and agents alike (`paint_cooldown`).
- `GAME_PAINT_PATH` lets a caller lay down up to `agentBatchMax` cells in one message, consuming a single cooldown slot — intended for agents drawing lines/shapes/gradients without flooding.

### Metrics

- **Coverage** (`progress`): painted cells / total cells × 100.
- **Harmony** (`harmony`): cells blended by 2+ distinct painters / painted cells × 100.

### Presenter controls (`GAME_CONFIG`, presenter-only)

Set `cols`, `rows`, `mixStrength`, `cooldownMs`, `agentBatchMax`, `powerupsEnabled`, `powerupIntervalMs`, `powerupMax`. Resizing drops any cells/power-ups that fall outside the new bounds. `GAME_RESET` clears cells, power-ups, claims, effects, and cooldowns.

### Agent / MCP API

The MCP bridge (`packages/mcp-server/`) exposes co-op-canvas-aware tools so an LLM can play meaningfully:

- `get_config` — grid size, mix strength, cooldown, batch size, power-up kinds, and plain-English rules.
- `get_state` — compact view: dimensions, coverage, harmony, **only the painted cells**, active power-ups, plus **your color, your active effect, and your power-up eligibility**.
- `paint(x, y)` and `paint_path(cells)` — typed paint actions (`paint_path` is capped at `agentBatchMax`).
- `wait_for_update` / `take_action` — generic reactive primitives, retained.

You do not need Cursor MCP config to use these tools — see **[architecture.md § Poor man's MCP](./architecture.md#poor-mans-mcp-scripted-client)** for the scripted-client pattern (`verify-canvas.mjs`, `draw-circle.mjs`, etc.).

### Future ideas (not yet implemented)

Brainstormed mechanics that fit the architecture; adding a new power-up is roughly: a kind in the protocol union + an entry in `EFFECT_CHARGES` + a branch in `applyPaint`.

- **More power-ups:**
  - **Echo** — mirror your next few paints across an axis for instant symmetry.
  - **Beacon** — light a faint suggested region for everyone to converge on (drives cooperation).
  - **Palette gift** — hand you a new color sampled from your neighbours.
- **Gentle decay** — untouched cells slowly drift toward transparent, keeping the canvas breathing (would need a periodic tick; mind the shared DO alarm).
- **Heartbeat / pulse** — a global rhythm where paints landing on the beat spread a little further, giving humans and agents a shared tempo.
- **Ripple / harmony glow** — client-side animation on each paint and a soft glow on freshly blended cells.
- **Optional template overlay** — a faint admin-chosen guide shape (e.g. the original heart) with its own fill %, bridging free-paint and goal-directed play.
- **Live cursors** — show where other players/agents are about to paint (`CONNECTED_USERS` already carries presence; would need cursor positions on the wire).

## Legacy `/ws` game room

`server/src/game-room.ts` still serves the original cooperative game at `/ws` with the older `join` / `paint` / `state` protocol. The workshop frontend uses `PresentationRoom` at `/room/main` instead. The `examples/starter/` app targets `/ws`.

## Extending

Add a new game package, register it on server and frontend, add a presentation step, and write WebSocket boundary tests before moving logic out of the monolith pattern. See [architecture.md § Game-plugin model](./architecture.md#game-plugin-model).

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

**Concept:** Cooperative real-time painting on a shared, configurable grid. Players (and their agents) paint cells; colors blend with their neighbours, building emergent gradients. Occasional power-ups temporarily change how your paint behaves. Optionally, the presenter sets a text prompt and the group races to paint it — judged by a human or by Claude Vision.

> The game id is still `pixel-heart` for compatibility, but it is no longer a fixed heart target — it's a free canvas.

**Messages (inbound):** `GAME_JOIN`, `GAME_PAINT`, `GAME_PAINT_PATH`, `GAME_CONFIG`, `GAME_RESET`, `GAME_SET_COLOR`, `GAME_WORM_MOVE`, `GAME_SET_PROMPT`, `GAME_START_ROUND`, `GAME_END_ROUND`, `GAME_SET_SCORE`

**Messages (outbound):** `SYNC_CANVAS`

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

**No fairness gate** (as of "remove powerup fairness rotation"): you can claim as many power-ups as you can physically reach — the only limit is getting to the cell, which in worm mode means walking there step by step. The active effect is keyed per player (`paint_effects`) and surfaced in state so the painter and their agents can see it. (`get_state` still returns a `powerupEligible` field; it is effectively always true now.)

### Rate limiting

- A per-player **cooldown** (`cooldownMs`, default 150ms) gates `GAME_PAINT`, applied to humans and agents alike (`paint_cooldown`).
- `GAME_PAINT_PATH` lets a caller lay down up to `agentBatchMax` cells in one message, consuming a single cooldown slot — intended for agents drawing lines/shapes/gradients without flooding.

### Metrics

- **Coverage** (`progress`): painted cells / total cells × 100.
- **Harmony** (`harmony`): cells blended by 2+ distinct painters / painted cells × 100.

### Worm mode

When worm mode is enabled (`config.wormMode: true`), each paint must be within Chebyshev distance 1 of the player's last paint. This forces a connected path and makes both human and agent movement legible on the canvas.

**Keyboard navigation (worm mode only):**

| Key | Action |
|-----|--------|
| `←` `↑` `→` `↓` | Move cursor one cell (sends `GAME_WORM_MOVE`) |
| `Space` | Stamp paint at current cursor position |

The cursor (indigo ring) is visible to all players in real time. Clicking a cell still works as before — the click position becomes the new cursor. Arrow key moves obey the same adjacency constraint as paints; the server rejects teleport attempts silently.

`GAME_WORM_MOVE { x, y }` — moves the cursor without painting; validates adjacency and updates `wormLastPaints`. Agents can use this to position before a batch paint.

**`fromCursor` bypass (how to free-paint in worm mode):** `GAME_PAINT { x, y, fromCursor: true }` **skips the adjacency check** and paints anywhere — this is how the keyboard spacebar stamps at the cursor, and it's the simplest way for an agent to draw an arbitrary (non-connected) shape without turning worm mode off. **Caveats:** `fromCursor` is only honoured on `GAME_PAINT` — `GAME_PAINT_PATH` is always worm-locked (each cell must chain adjacently from the previous). The per-player `cooldownMs` still applies. See [§ Agent painting playbook](#agent-painting-playbook).

### Player color picking

Controlled by `config.colorMode`:

- **`'random'`** (default) — server assigns a color on join; players cannot change it.
- **`'pick'`** — each player sees a color picker. If `config.colorPalette` is set, they choose from swatches; otherwise a free color input (`<input type="color">`) is shown.

`GAME_SET_COLOR { color: string }` — sets the sending player's color. Rejected if `colorMode !== 'pick'`, if the hex string is malformed, or if the palette is non-empty and the color is not in it.

**Built-in palettes** (set via `GAME_CONFIG { colorMode: 'pick', colorPalette: [...] }`):

| Palette | Description |
|---------|-------------|
| **Earth** | Browns, forest greens, olive, slate — muted but distinct |
| **Pastel** | Soft pinks, peach, butter, mint, sky, lavender |
| **Vibrant** | High-saturation spread across the full hue wheel |

Palettes are exported from `packages/games/pixel-heart/src/palettes.ts` so scripts can reference them.

### Paint This Prompt mode

A lightweight round structure layered on top of free painting. The presenter sets a text prompt, starts a countdown, and then judges the result — either manually or via Claude Vision.

**Round lifecycle:**

```
idle → painting → judging → reveal → (idle again)
```

| State | What players see |
|-------|-----------------|
| `idle` | Prompt banner visible; no timer |
| `painting` | Countdown timer (turns red at 30 s) |
| `judging` | "Judging…" indicator; host sees judge panel |
| `reveal` | Score (1–10) and one-sentence commentary |

**Presenter messages:**

| Message | Effect |
|---------|--------|
| `GAME_SET_PROMPT { prompt }` | Sets prompt text, transitions to `idle`, clears previous score |
| `GAME_START_ROUND { durationMs }` | Starts countdown (`min 30 s`, `max 10 min`), clears previous score |
| `GAME_END_ROUND` | Transitions to `judging` immediately (also fires automatically when timer expires) |
| `GAME_SET_SCORE { score, commentary }` | Records score (1–10) and one-sentence commentary; transitions to `reveal` |

**AI judging:** the presenter UI includes a "Judge with Claude" button. It renders the canvas to a PNG in the browser (4 px/cell), sends it to `claude-haiku-4-5-20251001` via the Anthropic API with the prompt text, and parses `{ score, commentary }` from the response. The presenter's API key is entered inline and never leaves the browser.

**State fields added to `CanvasState`:**

```ts
prompt:     string | null;
phase:      'idle' | 'painting' | 'judging' | 'reveal';
roundEndMs: number | null;   // epoch ms when the round ends
score:      number | null;   // 1–10
commentary: string | null;
```

**Agent use:** agents can read `prompt`, `phase`, and `roundEndMs` from `SYNC_CANVAS` to decide when to start painting and how urgently to act. The `get_state` MCP tool surfaces these fields.

### Presenter controls (`GAME_CONFIG`, presenter-only)

Set `cols`, `rows`, `mixStrength`, `cooldownMs`, `agentBatchMax`, `powerupsEnabled`, `powerupIntervalMs`, `powerupMax`, `wormMode`, `colorMode`, `colorPalette`. Resizing drops any cells/power-ups that fall outside the new bounds. `GAME_RESET` clears cells, power-ups, claims, effects, and cooldowns (prompt and phase are not reset — use `GAME_SET_PROMPT` to clear them).

### Agent / MCP API

The MCP bridge (`packages/mcp-server/`) exposes co-op-canvas-aware tools so an LLM can play meaningfully. The registered tools are:

- `get_config` — grid size, mix strength, cooldown, batch size, power-up kinds, and plain-English rules.
- `get_state` — compact view: dimensions, coverage, harmony, **only the painted cells** (plus an `asciiCanvas` text rendering), active power-ups, plus **your color, your active effect, and your power-up eligibility**.
- `paint(x, y)` — single typed paint. Note: this sends a plain `GAME_PAINT` (no `fromCursor`), so in worm mode it is adjacency-locked.
- `wait_for_update` — long-poll until the next `SYNC_*` state change (the bridge→agent leg is pull-based; MCP can't push mid-turn).
- `take_action({ type, payload })` — send **any** inbound message. This is the escape hatch for messages without a dedicated tool: `GAME_PAINT_PATH` (batch), `GAME_PAINT` with `fromCursor: true` (free-paint, see below), `GAME_SET_COLOR`, `GAME_WORM_MOVE`, etc. It waits for the resulting `SYNC_*` before returning, so the write is delivered before the call resolves.

> There is **no `paint_path` MCP tool** — earlier docs/builds had one, but the current bridge dropped it. Paint a path with `take_action({ type: 'GAME_PAINT_PATH', payload: { cells } })` (capped at `agentBatchMax`, one cooldown slot for the batch).

You do not need Cursor MCP config to use these tools — see **[architecture.md § Poor man's MCP](./architecture.md#poor-mans-mcp-scripted-client)** for the scripted-client pattern (`mcp-call.mjs`).

### Agent painting playbook

Hard-won gotchas — **read this before writing an agent that paints, or your paints will silently vanish with no error.**

**1. Paints are dropped silently.** Every reject path is a quiet `return false`/early-return server-side; the MCP tool still echoes `{ sent: ... }`. **Never trust the tool echo — confirm landings via a fresh `get_state`** (`paintedCount` rose, or your `{x,y}` is in `paintedCells`). The three reasons a paint vanishes:
  - **Worm mode adjacency** — in `wormMode`, a `GAME_PAINT`/`GAME_PAINT_PATH` cell must be within Chebyshev distance 1 of your *last* paint (`paint_worm_last`). Your **first** paint (no last-paint row yet) lands anywhere. **Bypass with `GAME_PAINT { fromCursor: true }`** (not available on `GAME_PAINT_PATH`).
  - **Cooldown** — `cooldownMs` gates every paint; faster paints are dropped. A `GAME_PAINT_PATH` batch consumes **one** cooldown slot for the whole batch.
  - **Connection lifetime** — if you fire a message and close the socket immediately, it may not be delivered. The `paint`/`take_action` tools `await waitForUpdate`, so a one-shot connect→call→close is safe; raw fire-and-forget sends are not.

**2. Free-paint an arbitrary shape:** `take_action({ type: 'GAME_PAINT', payload: { x, y, fromCursor: true } })` per cell. Respect `cooldownMs` between calls (sequential `mcp-call.mjs` spawns are naturally far enough apart). Painting also blends the 8 neighbours into a halo, so outlines thicken — skeletons read better than dense fills.

**3. Draw with multiple colours:** the room must be in `colorMode: 'pick'` (presenter-set). Then `take_action({ type: 'GAME_SET_COLOR', payload: { color } })` changes your colour for **future** paints (existing cells keep their stored colour). If `colorPalette` is non-empty the colour must be a member; otherwise any `#RRGGBB`. `GAME_SET_COLOR` is **not** presenter-only — any player/agent can set their own.

**4. Identity = your JWT `email`.** Player rows are keyed by email. If your agent signs a token with a **human's** email, it **shares that human's row** — same pill, same colour — and its decorated display name (`"<Name>'s <agentLabel>"`) overwrites theirs on join. For an independent bot (own pill/colour), use a **distinct email**. The room de-dupes pills by email, so reconnecting with one pinned email always shows exactly one pill. See [architecture.md § Poor man's MCP](./architecture.md#poor-mans-mcp-scripted-client).

### Future ideas (not yet implemented)

Brainstormed mechanics that fit the architecture; adding a new power-up is roughly: a kind in the protocol union + an entry in `EFFECT_CHARGES` + a branch in `applyPaint`.

- **More power-ups:**
  - **Echo** — mirror your next few paints across an axis for instant symmetry.
  - **Beacon** — light a faint suggested region for everyone to converge on (drives cooperation).
  - **Palette gift** — hand you a new color sampled from your neighbours.
- **Gentle decay** — untouched cells slowly drift toward transparent, keeping the canvas breathing (would need a periodic tick; mind the shared DO alarm).
- **Heartbeat / pulse** — a global rhythm where paints landing on the beat spread a little further, giving humans and agents a shared tempo.
- **Ripple / harmony glow** — client-side animation on each paint and a soft glow on freshly blended cells.
- **Territory Fill mode** — show a shape silhouette on the canvas; score is in-shape painted cells minus out-of-shape penalty. Exposes agent precision advantage clearly.
- **Live cursors** — show where other players/agents are about to paint (`CONNECTED_USERS` already carries presence; would need cursor positions on the wire; worm mode already does this via `wormLastPaints`).

## Legacy `/ws` game room

`server/src/game-room.ts` still serves the original cooperative game at `/ws` with the older `join` / `paint` / `state` protocol. The workshop frontend uses `PresentationRoom` at `/room/main` instead. The `examples/starter/` app targets `/ws`.

## Extending

Add a new game package, register it on server and frontend, add a presentation step, and write WebSocket boundary tests before moving logic out of the monolith pattern. See [architecture.md § Game-plugin model](./architecture.md#game-plugin-model).

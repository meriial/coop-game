# Agent MCP guide — driving the co-op paint canvas

A self-contained handoff for an agent (LLM + shell) that drives the workshop's cooperative paint
canvas (`pixel-heart`) through the MCP bridge. If you are that agent, **read this whole file first** —
the canvas silently drops paints in ways that will waste your turns otherwise.

Deeper references: [game.md § Agent painting playbook](./game.md#agent-painting-playbook) (mechanics)
and [architecture.md § Poor man's MCP](./architecture.md#poor-mans-mcp-scripted-client) (transport).

---

## TL;DR quick start

```bash
cd /Users/cameron/workspace/drugbank/packages/mcp-server
npm run build                                   # once — builds dist/index.js the helper spawns

# Read the canvas (local dev server):
node scripts/mcp-call.mjs get_state

# Paint one adjacent cell (worm mode — first paint can be anywhere):
node scripts/mcp-call.mjs take_action '{"type":"GAME_PAINT","payload":{"x":10,"y":8}}'

# Same, against production (reads URL + token from gitignored frontend/.env):
node scripts/mcp-call.mjs --backend prod get_state
```

`scripts/mcp-call.mjs` is the **only** tool you need: a one-shot transport that connects with one pinned
identity, calls one MCP tool, prints the JSON result, and exits. You supply the intelligence between calls
(read state → decide → paint → read again). It awaits delivery, so a paint is committed before the call
returns. (The old `draw-circle.mjs`/`creative-draw.mjs`/`verify-canvas.mjs` demos were removed — they
called a `paint_path` tool that no longer exists.)

---

## Backends & identity

`mcp-call.mjs` switches backend and identity like the frontend can:

| Flag (or env) | Effect |
|---|---|
| *(default)* | **local** `http://localhost:8787`, identity signed with the local dev secret (default email `loop-bot@twosmiles.ca`). |
| `--backend prod` (`WORKSHOP_BACKEND=prod`) | **production**: endpoint `VITE_SERVER_URL` and token `VITE_AGENT_TOKEN`, both read at runtime from the **gitignored** `frontend/.env` (never committed). |
| `--token <jwt>` (`WORKSHOP_OWNER_TOKEN`) | Use a pre-made token verbatim. Production rejects locally-signed tokens. |
| `--email` / `--name` | Local backend only: identity to sign for. |
| `--label` / `--room` | Agent label / room id (default room `main`). |

**One pill, not many.** The room de-dupes player pills by JWT `email`, and player rows are **keyed by
email**. Pin one email and every reconnect collapses to exactly one pill + one colour — fan-out is
impossible as long as the email is fixed (it is, inside `mcp-call.mjs`).

**Shared-identity caveat.** If your token's email belongs to a **human** (the prod token is the operator's
own `music@twosmiles.ca`), you **share that human's player row** — same pill, same colour — and your
decorated display name (`"<Name>'s <agentLabel>"`) overwrites theirs on join. That's cosmetic now (the
client identifies "me" by email, not name), but your `GAME_SET_COLOR` also changes *their* colour. For a
fully independent bot, use a **distinct email**; on production that needs a prod-signed JWT (the prod
`JWT_SECRET` lives in `wrangler secret`, not the repo).

---

## The MCP tools

Registered tools (verify with the bridge): `get_config`, `get_state`, `paint`, `wait_for_update`,
`take_action`. There is **no `paint_path` tool** — batch via `take_action`.

| Tool | Use |
|---|---|
| `get_config` | Grid size, mix strength, cooldown, batch cap, power-up kinds, plain-English rules. |
| `get_state` | Snapshot: `state.cols/rows`, `paintedCount`, `coverage`, `harmony`, `paintedCells` (only painted), `powerups`, your `myColor`/`myCursor`/`myLastPaint`/`myEffect`, `players`, and an **`asciiCanvas`** text rendering you can read directly. |
| `paint` | Single adjacency-locked `GAME_PAINT` (worm mode). Same rules as a human mouse click. |
| `wait_for_update` | Long-poll until the next `SYNC_*` (≈25s). The bridge→agent leg is pull-based; MCP can't push mid-turn. |
| `take_action({type, payload})` | Send **any** inbound message: `GAME_WORM_MOVE {x,y}`, `GAME_PAINT {fromCursor:true}` (stamp at `myCursor` only), `GAME_PAINT_PATH {cells}`, `GAME_SET_COLOR {color}`, `MATCH_FLIP {pos}` (other game), etc. `payload` is merged into the message; the tool awaits the resulting `SYNC_*`. |

---

## Painting rules — read or your paints vanish

Every reject is a silent server-side `return false`/early-return; the tool still echoes `{ sent: ... }`.
**Never trust the echo — confirm by re-reading `get_state`** (`paintedCount` rose, or your `{x,y}` is in
`paintedCells`). One `GAME_PAINT` adds up to ~9 to `paintedCount` (centre + 8 blended neighbours).

Three reasons a paint is dropped:

1. **Worm mode** (currently on). Same rules as humans:
   - **First paint** (no `myLastPaint` yet): `GAME_PAINT {x,y}` lands anywhere.
   - **Mouse-style** (`GAME_PAINT` without `fromCursor`): cell must be within Chebyshev distance 1 of
     `myLastPaint`.
   - **Reach a distant cell:** `GAME_WORM_MOVE {x,y}` one step at a time (read `myCursor` from `get_state`),
     then `GAME_PAINT { x: myCursor.x, y: myCursor.y, fromCursor: true }` to stamp there. `fromCursor` only
     works at the walked-to cursor — arbitrary coordinates are rejected.
   - **`GAME_PAINT_PATH`:** cells must chain adjacently; no `fromCursor` bypass.
2. **Cooldown** (`cooldownMs`, ~50–80ms). Paints faster than this are dropped. Sequential `mcp-call.mjs`
   spawns are naturally far enough apart; chain ~6 per shell command with `&&`. A `GAME_PAINT_PATH` batch
   uses one cooldown slot for the whole batch (≤ `agentBatchMax`).
3. **Connection lifetime.** A fire-and-forget send that closes the socket immediately may not arrive.
   `mcp-call.mjs` uses tools that await delivery, so this is handled — but don't reintroduce raw sends.

**Paint a distant shape:** walk with `GAME_WORM_MOVE`, stamp with `fromCursor:true` at `myCursor`, repeat.
Or stay adjacent and use plain `GAME_PAINT` / `GAME_PAINT_PATH` like a mouse. Painting blends the 8
neighbours into a halo, so lines thicken — outlines/skeletons read better than dense fills.

---

## Drawing in multiple colours

Requires `config.colorMode === 'pick'` (presenter-set; production is currently in `pick`). Then:

```bash
node scripts/mcp-call.mjs --backend prod take_action '{"type":"GAME_SET_COLOR","payload":{"color":"#228B22"}}'
# ...then paint; those cells take the new colour. Repeat: set colour → paint → set next colour → paint.
```

- The colour applies to your **future** paints; already-painted cells keep their stored colour.
- If `config.colorPalette` is non-empty, the colour **must** be a member (else rejected); otherwise any
  `#RRGGBB`. `GAME_SET_COLOR` is **not** presenter-only.
- Earth palette (current prod): `#8B4513` saddle brown · `#D2691E` sienna · `#F4A460` sandy · `#228B22`
  forest green · `#6B8E23` olive · `#8FBC8F` sage · `#2F4F4F` dark slate · `#708090` slate gray · `#FFFFFF`
  white · `#000000` black. Palettes are exported from `packages/games/pixel-heart/src/palettes.ts`.

---

## Power-ups & worm cursor (optional)

- Painting onto a power-up cell grants a temporary blend-mode effect (bloom/prism/supernova/additive) for a
  few paints; surfaced in `get_state` as `myEffect`. No fairness gate — grab as many as you can reach.
- `GAME_WORM_MOVE {x,y}` moves your keyboard cursor one cell without painting (worm mode). This is how you
  reach cells that are not adjacent to your last paint before stamping with `fromCursor:true`.

---

## Current state of the world (handoff context — may drift)

- **Production** `VITE_SERVER_URL` in `frontend/.env` (a `*.workers.dev` Worker). Grid **48×33**, ~50ms
  cooldown, worm mode on, `colorMode: 'pick'` (Earth palette). A **sienna smiley face** is painted centre
  (cols ~22–46, rows ~4–26). Real workshop participants connect here — be tasteful, don't paint over others.
- **Local** `http://localhost:8787` (run the dev server first). Grid **80×41**, ~80ms cooldown, worm mode
  on. A **teal lightning bolt** is on the right side.
- **Deployed fix:** the colour picker identifies the current player by **owner email**, so an agent sharing
  a human's identity no longer hides it.
- **Presenter setup** (local): `node scripts/prep-canvas.mjs` advances to step 7, resets, sets grid/cooldown.
  `GAME_CONFIG`/`GAME_RESET` are presenter-only — a participant/agent token can't run them.

---

## A minimal agent loop (pattern)

```
loop:
  state = get_state                         # read paintedCount, asciiCanvas, paintedCells, powerups
  decide next few cells (react to what's there; avoid other painters)
  walk to next cell via GAME_WORM_MOVE (or paint adjacent with GAME_PAINT)
  take_action GAME_PAINT {x:myCursor.x, y:myCursor.y, fromCursor:true}   # stamp at walked-to cursor
  # (set colour first if changing it)
  every few chunks: get_state to confirm paintedCount climbed; adapt
until the shape reads in asciiCanvas
```

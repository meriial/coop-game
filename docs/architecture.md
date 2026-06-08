# Technical Architecture

## System overview

The workshop platform has two layers:

1. **Presentation room** — slide deck, live polls, and multiplayer games (`/room/{roomId}`)
2. **Legacy game room** — original cooperative pixel-art endpoint (`/ws`) via `GameRoom`

```
Browser (frontend Vite app)
         │
         │  WebSocket  wss://…/room/main?token=…
         │
         ▼
┌─────────────────────────────────────────────┐
│  Cloudflare Worker  (server/src/index.ts)   │
│                                             │
│  /room/{id}  → JWT auth → PresentationRoom│
│  /ws         → GameRoom (legacy starter)    │
│  /auth/*     → config, magic-link, guest invite │
└─────────────────────┬───────────────────────┘
                      │  DO binding: PRESENTATION_ROOM
                      │  idFromName(roomId)
                      ▼
┌─────────────────────────────────────────────┐
│  Durable Object: PresentationRoom           │
│  (server/src/PresentationRoom.ts)           │
│                                             │
│  Host runtime:                              │
│    WebSocket sessions, role gating          │
│    step/slide navigation, polls             │
│    player registry + colors                   │
│                                             │
│  Delegates game logic via GameRegistry:     │
│    periodic-match  (MATCH_*)                │
│    pixel-heart     (GAME_PAINT*, GAME_CONFIG)│
│                                             │
│  SQLite (DO storage):                       │
│    meta, votes, players, paint_cells,       │
│    paint_powerups, match_board, …           │
└─────────────────────────────────────────────┘
```

## Packages

| Package | Purpose |
|---|---|
| `server/` | Cloudflare Worker + Durable Objects. Deployed by the organizer. |
| `frontend/` | Presenter + participant UI (slides, polls, games). |
| `sdk/` | TypeScript clients for bots and integrations. |
| `packages/protocol` | `@workshop/protocol` — shared wire types (single source of truth). |
| `packages/game-core` | `@workshop/game-core` — `GameEngine` contract + server/client registries. |
| `packages/games/periodic-match` | Element-matching game (engine + React client). |
| `packages/games/pixel-heart` | Cooperative paint canvas with color mixing + power-ups (engine + React client). |
| `packages/mcp-server` | `@workshop/mcp` — stdio MCP bridge for LLM agents. |
| `examples/starter/` | Minimal starter app using the legacy `/ws` protocol. |

## Game-plugin model

Each game is a self-contained package with three exports:

| Subpath | Contents |
|---|---|
| `./engine` | Server `GameEngine` — SQL schema, message handlers, `buildState`, optional `onAlarm` |
| `./client` | React `GameComponent` registered in the client registry |
| `./types` | Game-specific state types (usually aliases of protocol types) |

### `GameEngine` contract

```typescript
interface GameEngine<State = unknown> {
  id: string;
  config?: { maxAgentsPerOwner?: number };
  inboundTypes: string[];           // e.g. ['MATCH_FLIP', 'MATCH_PAUSE', …]
  initSchema(ctx: GameContext): void;
  onJoin?(player: Player, ctx: GameContext): void;
  handleMessage(player: Player, msg: …, ctx: GameContext): void;
  buildState(ctx: GameContext): State;
  onAlarm?(ctx: GameContext): void;
}
```

`PresentationRoom` keeps shared concerns and routes inbound messages whose `type` is in an engine's `inboundTypes` to that engine. Engines emit the **same** outbound messages as before (`SYNC_MATCH`, `SYNC_CANVAS`, etc.) — the wire protocol is unchanged.

### Adding a new game

1. Create `packages/games/my-game/` with `engine`, `client`, `types`.
2. Register the engine in `server/src/game-registry.ts`.
3. Register the client in `frontend/src/games/register.ts`.
4. Add a `{ type: 'game', gameId: 'my-game' }` step in `frontend/src/config/presentationConfig.ts`.
5. Add BDD scenarios in `server/test/` that exercise the new message types at the WebSocket boundary.

## WebSocket protocol (presentation room)

Connect to `/room/{roomId}?token={jwt}` (optional `&devRole=presenter|participant` on localhost).

All messages are JSON. Types are defined in `@workshop/protocol`.

### Client → Server (inbound)

| Type | Who | Purpose |
|---|---|---|
| `STEP_CHANGE` | presenter | Advance slide deck |
| `SUBMIT_VOTE` | anyone | Poll vote or slider value |
| `RESET_POLL` | presenter | Clear poll results |
| `GAME_JOIN` | anyone | Register player name + color |
| `GAME_PAINT` | joined player | Paint a canvas cell (blends neighbours) |
| `GAME_PAINT_PATH` | joined player | Batch-paint up to `agentBatchMax` cells |
| `GAME_CONFIG` | presenter | Configure grid size, mixing, cooldown, power-ups |
| `GAME_RESET` | presenter | Clear the co-op canvas |
| `MATCH_FLIP` | joined player | Flip periodic-match tile |
| `MATCH_PAUSE` | presenter | Toggle match pause |
| `MATCH_RESET` | presenter | Reshuffle match board |
| `MATCH_SET_SIZE` | presenter | Set element count (applies on reshuffle) |

### Server → Client (outbound)

| Type | Purpose |
|---|---|
| `WELCOME` | Initial snapshot (step, polls, both game states) |
| `SYNC_STEP` | Step index changed |
| `SYNC_MATCH` | Periodic-match state |
| `SYNC_CANVAS` | Co-op canvas state (cells, config, power-ups, effects) |
| `POLL_UPDATES` / `POLL_RESET` | Poll aggregates |
| `CONNECTED_USERS` | Who is in the room |

## Authentication

| Endpoint | Method | Purpose |
|---|---|---|
| `/auth/config` | GET | Public: `allowed_email_domains`, `repo_url` for `setup.sh` |
| `/auth/request` | POST | Start magic-link flow (`{ email }`) |
| `/auth/verify` | GET | Click magic link → approve device |
| `/auth/poll` | GET | Poll for `agentToken` JWT |
| `/auth/inbox` | GET | Local dev: list unsent magic links (no Resend) |
| `/auth/guest-invite` | POST | Presenter sends signed guest invite |

**Secrets** (`.dev.vars` locally, `wrangler secret` in production): `JWT_SECRET`, `ADMIN_EMAIL`, `ALLOWED_EMAIL_DOMAINS`, `REPO_URL`. Optional: `RESEND_API_KEY`, `FROM_EMAIL`.

Magic-link auth rejects emails not on `ALLOWED_EMAIL_DOMAINS` (**403**). Missing config returns **500** (fail fast).

Room WebSocket auth: JWT in `?token=`. Presenter role when email equals `ADMIN_EMAIL`. Agents add `?agentLabel=`.

## Player identity

The `players` table stores:

| Column | Humans | Agents |
|---|---|---|
| `owner_id` | JWT email | Owner's email |
| `is_agent` | `false` | `true` |
| `agent_label` | — | e.g. `"Agent 1"` |

Agents connect with `?agentLabel=Agent%201` on the room WebSocket URL. Display name becomes `"Bob's Agent 1"`. The active game's `maxAgentsPerOwner` is enforced at connect time (periodic-match: 1; pixel-heart: unlimited).

## SDK

### `PresentationClient` (presentation room)

```typescript
import { PresentationClient, buildRoomWsUrl } from '@workshop/sdk';

const url = buildRoomWsUrl('http://localhost:8787', 'main', token, 'Agent 1');
const client = new PresentationClient(url, "Bob's Agent 1", { ownerId, agentLabel: 'Agent 1' });

await client.connect();                        // waits for WELCOME
client.sendAction({ type: 'MATCH_FLIP', pos: 0 });
const snap = await client.waitForUpdate();     // long-poll until next SYNC_*
client.getSnapshot();
client.disconnect();
```

### `GameClient` (legacy `/ws`)

The original `GameClient` in `sdk/src/client.ts` still targets `GameRoom` at `/ws` with the older `join` / `paint` / `state` protocol. Use `PresentationClient` for the workshop presentation.

## MCP bridge

`@workshop/mcp` is a local **stdio MCP server** that exposes workshop tools to LLM agents. The server itself is small; most agent work happens over WebSocket to `PresentationRoom` (same path as the browser).

### Tools

| Tool | Purpose |
|---|---|
| `get_state` | Active game id + state snapshot + agent identity (compact, agent-aware view for the co-op canvas) |
| `get_config` | Co-op canvas rules: grid, mix strength, cooldown, batch size, power-up kinds |
| `paint` | Paint one cell (plain `GAME_PAINT`, adjacency-locked in worm mode) |
| `wait_for_update` | Long-poll until next `SYNC_*` (or ~25s timeout) |
| `take_action` | Send an arbitrary inbound message — used for `GAME_PAINT_PATH` (batch), `GAME_PAINT { fromCursor: true }` (free-paint), `GAME_SET_COLOR`, `MATCH_FLIP`, … |

There is no `paint_path` tool; batch via `take_action({ type: 'GAME_PAINT_PATH', payload: { cells } })` (≤ `agentBatchMax`).

Build once (`npm run build` in `packages/mcp-server`) — esbuild bundles `@workshop/sdk` into `dist/index.js` so plain `node` works.

MCP cannot push to the LLM mid-turn; the bridge→agent leg is pull-based via `wait_for_update`.

### Poor man's MCP (scripted client)

You do **not** need to register the server in Cursor, Claude Desktop, or any MCP host config to exercise agents. The approach used in this repo's verification scripts and agent demos:

1. **Spawn** `node packages/mcp-server/dist/index.js` as a stdio subprocess.
2. **Connect** with `@modelcontextprotocol/sdk`'s `Client` + `StdioClientTransport`.
3. **Call tools** (`get_config`, `get_state`, `paint`, `take_action`, …) from any Node script, shell loop, or CI job.

The MCP server is just a thin adapter between MCP tool calls and the room WebSocket — your script plays the role of the "LLM", supplying the plan (geometry, loops, batching).

**Minimal pattern** (see `packages/mcp-server/scripts/mcp-call.mjs` for a switchable version):

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['packages/mcp-server/dist/index.js'],
  env: {
    WORKSHOP_OWNER_TOKEN: '<jwt>',
    WORKSHOP_ROOM_URL: 'http://localhost:8787',
    WORKSHOP_ROOM_ID: 'main',
    WORKSHOP_AGENT_LABEL: 'Agent 1',
  },
});

const client = new Client({ name: 'my-script', version: '0.0.1' });
await client.connect(transport);

const result = await client.callTool({ name: 'get_config', arguments: {} });
const text = result.content.find((c) => c.type === 'text').text;
console.log(JSON.parse(text));

// Paint a path via take_action (there is no `paint_path` MCP tool anymore).
await client.callTool({
  name: 'take_action',
  arguments: { type: 'GAME_PAINT_PATH', payload: { cells: [{ x: 10, y: 8 }, { x: 11, y: 8 }] } },
});

await client.close();
```

> **Registered tools:** `get_config`, `get_state`, `paint`, `wait_for_update`, `take_action`. Anything else (`GAME_PAINT_PATH`, `GAME_PAINT { fromCursor: true }`, `GAME_SET_COLOR`, …) goes through `take_action`. Before driving paints, read **[game.md § Agent painting playbook](./game.md#agent-painting-playbook)** — worm mode, cooldown, and silent drops will eat your paints otherwise.

**Why bother?** Same wire protocol and tools a hosted MCP client would use, but zero editor setup — useful for smoke tests, scripted demos, subagents running shell commands, and prototyping agent logic before wiring Cursor.

**Ready-made scripts** (all in `packages/mcp-server/scripts/`, run from that directory after `npm run build`):

| Script | What it does |
|---|---|
| `mcp-call.mjs` | **Generic one-shot transport.** Connects with one pinned identity, invokes one tool, prints JSON, exits. Switchable backend + identity (see below). The building block for an agent-in-the-loop. |
| `prep-canvas.mjs` | Presenter JWT: advance to step 7, reset canvas, set grid/cooldown |

> Earlier demo scripts (`draw-circle.mjs`, `creative-draw.mjs`, `verify-canvas.mjs`, `paint-agent.mjs`) were **removed** — they called the deleted `paint_path` tool and predated worm mode. Drive paints with `mcp-call.mjs` + `take_action`/`GAME_PAINT { fromCursor: true }` instead; see [game.md § Agent painting playbook](./game.md#agent-painting-playbook).

**`mcp-call.mjs` — switch backend and identity (like the frontend can):**

```bash
# Read-only / paint, choosing the backend:
node scripts/mcp-call.mjs                 get_state    # local (localhost:8787), signed loop-bot identity
node scripts/mcp-call.mjs --backend prod  get_state    # production, identity from frontend/.env VITE_AGENT_TOKEN
# Free-paint a cell anywhere (worm-mode bypass):
node scripts/mcp-call.mjs --backend prod take_action '{"type":"GAME_PAINT","payload":{"x":10,"y":8,"fromCursor":true}}'
```

| Knob (flag / env) | Meaning |
|---|---|
| `--backend local\|prod` (`WORKSHOP_BACKEND`) | `local` = `http://localhost:8787`, sign a JWT with the local dev secret. `prod` = the deployed Worker, token from `frontend/.env`. |
| `--token <jwt>` (`WORKSHOP_OWNER_TOKEN`) | Use a pre-made token verbatim (any backend). Production rejects locally-signed tokens. |
| `--email` / `--name` | Local backend: identity to sign for (default `loop-bot@twosmiles.ca`). |
| `--label` / `--room` | Agent label / room id. |

**Identity caveat (one pill, not many):** the room de-dupes pills by JWT `email`, and player rows are **keyed by email**. Pin one email → exactly one pill no matter how many times you reconnect. But if that email belongs to a **human**, your agent shares their row (pill, colour) and overwrites their display name on join — give a bot its **own** email for a separate identity. A production bot identity needs a prod-signed token (the prod `JWT_SECRET` lives in `wrangler secret`, not the repo).

```bash
# Prerequisites: Worker on :8787, room on co-op canvas step (or run prep-canvas.mjs first)
cd packages/mcp-server && npm run build

node scripts/prep-canvas.mjs                            # presenter: step 7, reset, set grid
node scripts/mcp-call.mjs get_state                     # read the canvas
node scripts/mcp-call.mjs take_action '{"type":"GAME_PAINT","payload":{"x":10,"y":8,"fromCursor":true}}'  # free-paint
```

JWT: `mcp-call.mjs` signs a local token for you (default `loop-bot@twosmiles.ca`) or reads `frontend/.env` for `--backend prod`. For other scripts, sign one locally with `JWT_SECRET` from `server/.dev.vars` (see `prep-canvas.mjs`). Each distinct email gets its own player color.

Subagents in Cursor can run these scripts via shell — that is how spiral/wave/diamond/circle demos were driven, not via Cursor's MCP settings panel.

### Hosted MCP (optional)

To attach an LLM inside Cursor or Claude Desktop instead, register the same stdio command in that tool's MCP config, passing the env vars above. Functionally identical to poor man's MCP; only the caller changes (chat model vs your script).

## Testing

Outside-in BDD tests exercise the **real** Worker + `PresentationRoom` Durable Object (SQLite, alarms) via Vitest and `@cloudflare/vitest-pool-workers`.

```bash
cd server && npm test          # 25 WebSocket boundary tests
cd packages/mcp-server && npm test
npm test                       # both, from repo root
```

Tests assert only on wire payloads — never internal classes or SQL. The suite must stay green through refactors without test edits; that is the safety net for the plugin architecture.

Config: `server/vitest.config.mts` (uses `isolate: false` and `maxWorkers: 1` because WebSockets + DO require shared storage).

For spinning up servers, obtaining JWTs, browser checks, and MCP smoke tests, see **[verification.md](./verification.md)**.

## Local vs production

| | Local | Production |
|---|---|---|
| Worker | `wrangler dev` on `:8787` | `wrangler deploy` |
| Frontend | Vite on `:5174` | Built to `frontend/dist`, served as Worker assets |
| DO storage | SQLite in Miniflare; resets between test files | Persistent |
| Auth emails | KV inbox (`/auth/inbox`) when no `RESEND_API_KEY` | Resend |
| Participant config | `GET /auth/config` from local `.dev.vars` | `wrangler secret` for `ALLOWED_EMAIL_DOMAINS`, `REPO_URL` |

## Deploying

```bash
pnpm deploy:wrangler    # builds frontend, then deploys server (alias: pnpm deploy)
```

Requires `wrangler login` and secrets (`JWT_SECRET`, `ADMIN_EMAIL`, `ALLOWED_EMAIL_DOMAINS`, `REPO_URL`, optional `RESEND_API_KEY`). See [README](../README.md#for-the-organizer).

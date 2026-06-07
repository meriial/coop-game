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
│  /auth/*     → magic-link + guest invite   │
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
│    pixel-heart     (GAME_PAINT, GAME_RESET) │
│                                             │
│  SQLite (DO storage):                       │
│    meta, votes, players, canvas_cells,      │
│    match_board, match_claimed, …            │
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
| `packages/games/pixel-heart` | Cooperative heart canvas (engine + React client). |
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
| `GAME_PAINT` | joined player | Paint pixel-heart target cell |
| `GAME_RESET` | presenter | Clear pixel-heart canvas |
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
| `SYNC_CANVAS` | Pixel-heart state |
| `POLL_UPDATES` / `POLL_RESET` | Poll aggregates |
| `CONNECTED_USERS` | Who is in the room |

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

`@workshop/mcp` is a local stdio MCP server for LLM agents:

| Tool | Purpose |
|---|---|
| `get_state` | Active game id + state snapshot + agent identity |
| `wait_for_update` | Long-poll until next `SYNC_*` (or ~25s timeout) |
| `take_action` | Send an inbound message (e.g. `MATCH_FLIP`, `GAME_PAINT`) |

```bash
cd packages/mcp-server && npm run build

WORKSHOP_OWNER_TOKEN=<jwt> \
WORKSHOP_AGENT_LABEL="Agent 1" \
WORKSHOP_ROOM_URL=http://localhost:8787 \
node dist/index.js
```

MCP cannot push to the LLM mid-turn; real-time events arrive on the DO→bridge WebSocket leg, and the bridge→agent leg is pull-based via `wait_for_update`.

## Testing

Outside-in BDD tests exercise the **real** Worker + `PresentationRoom` Durable Object (SQLite, alarms) via Vitest and `@cloudflare/vitest-pool-workers`.

```bash
cd server && npm test          # 21 WebSocket boundary tests
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

## Deploying

```bash
pnpm deploy    # builds frontend, then deploys server
```

Requires `wrangler login` and secrets (`JWT_SECRET`, `RESEND_API_KEY`, etc.). See [README](../README.md#for-the-organizer).

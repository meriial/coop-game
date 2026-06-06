# Technical Architecture

## System overview

```
Browser (participant's Vite app)
         │
         │  WebSocket  wss://workshop-game.YOUR-SUBDOMAIN.workers.dev/ws
         │
         ▼
┌─────────────────────────────────────────────┐
│  Cloudflare Worker  (server/src/index.ts)   │
│                                             │
│  GET /     → status JSON                   │
│  GET /ws   → upgrade + forward to DO       │
└─────────────────────┬───────────────────────┘
                      │  DO binding: GAME_ROOM
                      │  idFromName("main-room")
                      ▼
┌─────────────────────────────────────────────┐
│  Durable Object: GameRoom                   │
│  (server/src/game-room.ts)                  │
│                                             │
│  in-memory:                                 │
│    players:     Map<playerId, Player>       │
│    connections: Map<playerId, WebSocket>    │
│    colorIndex:  number                      │
│                                             │
│  DO storage (persisted):                    │
│    canvas:      (string|null)[][]           │
│    colorIndex:  number                      │
└─────────────────────────────────────────────┘
```

There is exactly one Durable Object instance — `idFromName("main-room")` always resolves to the same DO, regardless of which Cloudflare edge node handles a request. All players connect to the same shared state.

## Packages

| Package | Purpose |
|---|---|
| `server/` | Cloudflare Worker + Durable Object. Deployed once by the organizer. |
| `sdk/` | Browser-compatible TypeScript client (`@workshop/sdk`). Wraps the WebSocket protocol. |
| `examples/starter/` | Minimal Vite + TypeScript app. Participants fork this and build on top. |

## WebSocket protocol

All messages are JSON.

### Client → Server

```typescript
{ type: 'join';  name: string }          // register as a player; server assigns color
{ type: 'paint'; x: number; y: number }  // claim cell (x, y); ignored if not a target cell
```

### Server → Client

```typescript
{ type: 'state'; state: GameState }  // broadcast after every join, paint, or disconnect
{ type: 'error'; message: string }   // sent to the specific client that caused the error
```

The server sends the full `GameState` on every change — no deltas. At 20×20 = 400 cells with ~10 bytes each, a state message is ~4–5 KB uncompressed. Fine for a workshop.

### Connection lifecycle

```
client connects
    → server accepts WebSocket (ws.accept())
    → server assigns playerId (crypto.randomUUID())

client sends { type: 'join', name }
    → server assigns color from palette
    → server broadcasts full state to all

client sends { type: 'paint', x, y }
    → server validates: is (x,y) a target cell?
    → server sets canvas[y][x] = player.color
    → server persists canvas to DO storage
    → server broadcasts full state to all

client disconnects
    → server removes player from registry
    → server broadcasts full state to all
```

## State model

```typescript
interface GameState {
  canvas:   (string | null)[][];   // 20×20 grid, hex color string or null
  target:   boolean[][];           // 20×20 grid, true = must be painted
  players:  Record<string, Player>;
  progress: number;                // 0–100, integer
}

interface Player {
  id:    string;   // UUID assigned at connect time
  name:  string;   // provided at join, truncated to 30 chars
  color: string;   // hex color from PLAYER_COLORS palette
}
```

## SDK

`@workshop/sdk` exports a single class:

```typescript
class GameClient {
  constructor(wsUrl: string)
  connect(name: string): Promise<void>       // resolves after first state message
  onStateUpdate(cb: (state: GameState) => void): void
  paint(x: number, y: number): void
  getState(): GameState | null
  disconnect(): void
}
```

The SDK is browser-only (uses `globalThis.WebSocket`). It's TypeScript source — no build step. The Vite app imports it directly via a path alias in `vite.config.ts`:

```typescript
alias: { '@workshop/sdk': resolve(__dirname, '../../sdk/src/index.ts') }
```

## Dev container

The `.devcontainer/` setup isolates Cursor's yolo-mode within Docker. Key details:

- **Base image**: `node:22-bookworm-slim` with pnpm added globally
- **Node version**: pinned to 22 via `.tool-versions` (asdf)
- **node_modules isolation**: a named Docker volume (`workshop-game-nodemodules`) is mounted at the workspace `node_modules`. This prevents the Linux (container) and macOS (host) platform-specific binaries from contaminating each other — particularly `workerd`, which is native code.
- **Port forwarding**: 5173 (Vite dev server) and 8787 (wrangler dev) are forwarded to the host so the browser can reach both
- **Vite `host: true`**: Vite must bind on `0.0.0.0` (not just `127.0.0.1`) so the dev container port forwarding can reach it

## Local vs production

| | Local (`pnpm dev:server`) | Production (deployed) |
|---|---|---|
| Runtime | Miniflare (in-process) | Cloudflare edge |
| DO storage | In-memory, resets on restart | SQLite-backed, persistent |
| URL | `ws://localhost:8787/ws` | `wss://workshop-game.YOUR-SUBDOMAIN.workers.dev/ws` |
| Canvas persists? | No | Yes |

The `.env` file in `examples/starter/` holds both:
```
DEV_VITE_GAME_URL=ws://localhost:8787/ws
VITE_GAME_URL=wss://workshop-game.YOUR-SUBDOMAIN.workers.dev/ws
```

Switch between them by renaming the variable Vite reads (`VITE_GAME_URL`).

## Deploying

```bash
# From repo root (uses wrangler from server/node_modules)
pnpm deploy

# Or directly
cd server && pnpm exec wrangler deploy
```

Requires prior `wrangler login`. The `wrangler.toml` migration tag `v1` with `new_sqlite_classes` is required by Cloudflare's free plan.

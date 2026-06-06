# Workshop Pixel Art

A cooperative real-time game for AI workshops. All players work together to paint a heart-shaped pixel art by clicking cells on a shared 20×20 canvas. The game is won when the canvas matches the target (100% progress).

Each player is auto-assigned a unique color. Paint any unpainted target cell to contribute. Watch other participants' strokes appear in real-time.

---

## For participants

### Option A — Dev container (recommended for yolo mode)

Keeps Cursor's AI terminal commands safely inside Docker — nothing can touch your host machine.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and [Cursor](https://cursor.com) (or VS Code with the Dev Containers extension)
2. Clone this repo and open it in Cursor
3. When prompted, click **Reopen in Container** (or run `Dev Containers: Reopen in Container` from the command palette)
4. Wait for the container to build and `pnpm install` to finish
5. Create your env file:
   ```
   cp examples/starter/.env.example examples/starter/.env
   # Edit .env and replace the placeholder URL with the one your organizer shared
   ```
6. Start the dev server:
   ```bash
   pnpm dev:starter
   ```
7. Open http://localhost:5173, enter your name, and start painting!

### Option B — Local (no Docker)

1. Install [Node.js 20+](https://nodejs.org) and [pnpm](https://pnpm.io)
2. Clone and install:
   ```bash
   git clone <repo-url>
   cd workshop-game
   pnpm install
   ```
3. Create `examples/starter/.env`:
   ```
   VITE_GAME_URL=wss://<url-from-organizer>
   ```
4. `pnpm dev:starter` → open http://localhost:5173

---

## SDK reference

The `@workshop/sdk` package exposes a single `GameClient` class.

```typescript
import { GameClient } from '@workshop/sdk';
import type { GameState } from '@workshop/sdk';

const client = new GameClient('wss://workshop-game.SUBDOMAIN.workers.dev/ws');

// Register state listener (call before connect)
client.onStateUpdate((state: GameState) => {
  console.log(`Progress: ${state.progress}%`);
  console.log('Players:', Object.values(state.players));
  console.log('Canvas:', state.canvas);   // (string|null)[][] — color or null per cell
  console.log('Target:', state.target);   // boolean[][] — which cells need painting
});

// Connect with your name (resolves after the first state arrives)
await client.connect('Alice');

// Paint a cell at (x, y) — server ignores non-target cells
client.paint(3, 7);

// Read current state without a callback
const state = client.getState();

// Disconnect when done
client.disconnect();
```

### Types

```typescript
interface Player  { id: string; name: string; color: string }
interface GameState {
  canvas:   (string | null)[][];  // 20×20, hex color or null
  target:   boolean[][];           // 20×20, true = needs painting
  players:  Record<string, Player>;
  progress: number;                // 0–100
}
```

---

## Ideas for extending the starter

These are good Cursor / AI-assisted tasks once you understand the SDK:

- **Animation** — flash or scale a cell when it gets painted
- **My score** — count how many cells carry your color and display it
- **Bot mode** — auto-paint one random target cell every second
- **Sound** — play a short tone when any cell is painted
- **Color picker** — override your assigned color with an `<input type="color">`
- **Confetti** — burst confetti when `progress === 100`
- **Heatmap overlay** — shade cells by how many times they've been repainted

---

## For the organizer

### Deploy the server (one-time)

```bash
# 1. Authenticate with Cloudflare (opens browser)
wrangler login

# 2. Deploy from the repo root
pnpm deploy

# 3. Note the URL printed by wrangler, e.g.:
#    https://workshop-game.your-subdomain.workers.dev
#
# 4. The WebSocket endpoint is:
#    wss://workshop-game.your-subdomain.workers.dev/ws
#
# 5. Share that wss:// URL with participants
```

### Reset the canvas between rounds

The canvas persists in Durable Object storage. To reset for a new round:

```bash
# Delete and re-create the DO storage (this resets the canvas)
wrangler durable-objects namespace list
# Then redeploy — the DO will reinitialize with an empty canvas on first request
pnpm deploy
```

Or for a quick in-place reset without redeploying, you can add a `POST /reset` endpoint (see `server/src/game-room.ts`).

### Customise the target image

Edit the `TARGET` constant in `server/src/game-room.ts`. It's a 20×20 boolean grid — `true` means a cell needs to be painted, `false` means it should stay empty. Redeploy after changing it.

### Local development (test the server without deploying)

```bash
pnpm dev:server   # starts wrangler dev on http://localhost:8787
```

Then point participants at `ws://localhost:8787/ws` for local testing.

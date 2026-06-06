# Workshop Pixel Art

A cooperative real-time game for AI workshops. All players work together to paint a heart-shaped pixel art by clicking cells on a shared 20×20 canvas. The game is won when the canvas matches the target (100% progress).

Each player is auto-assigned a unique color. Paint any unpainted target cell to contribute. Watch other participants' strokes appear in real-time.

---

## For participants

Run this single command in your terminal — it handles everything:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/meriial/coop-game/main/setup.sh)
```

You'll be prompted for your `@drugbank.com` or `@twosmiles.ca` email address. A magic link will arrive in your inbox — click it to authenticate, and your browser will open the game automatically.

**Requirements:** Node.js 18+, git, curl &nbsp;·&nbsp; pnpm is installed automatically if missing

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

### First-time setup

```bash
# 1. Authenticate with Cloudflare
cd server && pnpm exec wrangler login

# 2. Create the KV namespace for auth tokens
pnpm exec wrangler kv namespace create AUTH_KV
pnpm exec wrangler kv namespace create AUTH_KV --preview
# Copy the two IDs printed into server/wrangler.toml

# 3. Set secrets
pnpm exec wrangler secret put RESEND_API_KEY   # your Resend API key
pnpm exec wrangler secret put FROM_EMAIL       # e.g. info@yourdomain.com
pnpm exec wrangler secret put JWT_SECRET       # run: openssl rand -hex 32

# 4. Update the default WORKER_URL in setup.sh to match your worker subdomain

# 5. Deploy
pnpm exec wrangler deploy
```

### Local development

```bash
# Create server/.dev.vars with:
#   JWT_SECRET=any-local-value
# (RESEND_API_KEY absent → fake inbox mode, magic links logged to /auth/inbox)

cd server && pnpm dev        # worker on http://localhost:8787
WORKER_URL=http://localhost:8787 bash <(curl -fsSL https://raw.githubusercontent.com/meriial/coop-game/main/setup.sh)
# Check http://localhost:8787/auth/inbox for the magic link
```

### Reset the canvas between rounds

```bash
# Redeploy — the Durable Object reinitialises with an empty canvas on first request
cd server && pnpm exec wrangler deploy
```

Or add a `POST /reset` endpoint to `server/src/game-room.ts` for in-place resets.

### Customise the target image

Edit the `TARGET` constant in `server/src/game-room.ts`. It's a 20×20 boolean grid — `true` means a cell needs to be painted. Redeploy after changing it.

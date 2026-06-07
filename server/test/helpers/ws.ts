import { SELF, env } from 'cloudflare:test';
import { createTestJWT } from './jwt';

export type WireMsg = Record<string, unknown> & { type: string };

export interface RoomClient {
  ws: WebSocket;
  roomId: string;
  role: 'presenter' | 'participant';
  email: string;
  name: string;
  messages: WireMsg[];
  waitFor: (predicate: (msg: WireMsg) => boolean, timeoutMs?: number) => Promise<WireMsg>;
  send: (msg: WireMsg) => void;
  close: () => void;
}

function trackMessages(ws: WebSocket, buffer: WireMsg[]) {
  ws.addEventListener('message', (event) => {
    try {
      buffer.push(JSON.parse(event.data as string) as WireMsg);
    } catch {
      /* ignore malformed */
    }
  });
}

export async function connectRoom(opts: {
  role: 'presenter' | 'participant';
  email: string;
  name: string;
  roomId?: string;
}): Promise<RoomClient> {
  const token = await createTestJWT({ email: opts.email, name: opts.name });
  const roomId = opts.roomId ?? `test-${crypto.randomUUID()}`;
  const url = `http://localhost/room/${roomId}?token=${encodeURIComponent(token)}&devRole=${opts.role}`;
  const res = await SELF.fetch(url, { headers: { Upgrade: 'websocket' } });
  if (res.status !== 101 || !res.webSocket) {
    throw new Error(`WebSocket upgrade failed: ${res.status}`);
  }
  const ws = res.webSocket;
  ws.accept();

  const messages: WireMsg[] = [];
  let cursor = 0;
  trackMessages(ws, messages);

  const waitFor = (predicate: (msg: WireMsg) => boolean, timeoutMs = 5000): Promise<WireMsg> =>
    new Promise((resolve, reject) => {
      const scan = () => {
        for (let i = cursor; i < messages.length; i++) {
          if (predicate(messages[i])) {
            cursor = i + 1;
            return messages[i];
          }
        }
        return undefined;
      };
      const hit = scan();
      if (hit) {
        resolve(hit);
        return;
      }
      const timer = setTimeout(() => {
        ws.removeEventListener('message', onMessage);
        reject(new Error(`Timed out waiting for message after ${timeoutMs}ms`));
      }, timeoutMs);
      const onMessage = () => {
        const found = scan();
        if (found) {
          clearTimeout(timer);
          ws.removeEventListener('message', onMessage);
          resolve(found);
        }
      };
      ws.addEventListener('message', onMessage);
    });

  return {
    ws,
    roomId,
    role: opts.role,
    email: opts.email,
    name: opts.name,
    messages,
    waitFor,
    send: (msg) => ws.send(JSON.stringify(msg)),
    close: () => ws.close(),
  };
}

export function getPresentationRoomStub(roomId: string) {
  const id = env.PRESENTATION_ROOM.idFromName(roomId);
  return env.PRESENTATION_ROOM.get(id);
}

export function findMatchingPair(board: string[]): [number, number] | null {
  const bySymbol = new Map<string, number[]>();
  for (let i = 0; i < board.length; i++) {
    const sym = board[i];
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(i);
  }
  for (const positions of bySymbol.values()) {
    if (positions.length >= 2) return [positions[0], positions[1]];
  }
  return null;
}

export function findMismatchPair(board: string[]): [number, number] | null {
  const bySymbol = new Map<string, number[]>();
  for (let i = 0; i < board.length; i++) {
    const sym = board[i];
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(i);
  }
  const symbols = [...bySymbol.keys()];
  if (symbols.length < 2) return null;
  return [bySymbol.get(symbols[0])![0], bySymbol.get(symbols[1])![0]];
}

export function latestSyncMatch(client: RoomClient): WireMsg | undefined {
  return [...client.messages].reverse().find((m) => m.type === 'SYNC_MATCH');
}

export function latestSyncCanvas(client: RoomClient): WireMsg | undefined {
  return [...client.messages].reverse().find((m) => m.type === 'SYNC_CANVAS');
}

export async function joinGame(client: RoomClient, displayName?: string) {
  client.send({ type: 'GAME_JOIN', name: displayName ?? client.name });
  await client.waitFor((m) => m.type === 'SYNC_MATCH');
}

export async function joinGameCanvas(client: RoomClient, displayName?: string) {
  client.send({ type: 'GAME_JOIN', name: displayName ?? client.name });
  await client.waitFor((m) => m.type === 'SYNC_CANVAS');
}

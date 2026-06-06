import type { GameState, ClientMsg, ServerMsg } from './types';

type StateCallback = (state: GameState) => void;

export class GameClient {
  private ws: WebSocket | null = null;
  private state: GameState | null = null;
  private callbacks: StateCallback[] = [];

  constructor(private readonly wsUrl: string) {}

  connect(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      let settled = false;

      const settle = (fn: () => void) => {
        if (!settled) { settled = true; fn(); }
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', name } satisfies ClientMsg));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as ServerMsg;
        if (msg.type === 'state') {
          this.state = msg.state;
          this.callbacks.forEach(cb => cb(msg.state));
          settle(resolve);
        } else if (msg.type === 'error') {
          settle(() => reject(new Error(msg.message)));
        }
      };

      ws.onerror = () => settle(() => reject(new Error('WebSocket error')));
      ws.onclose = () => settle(() => reject(new Error('Connection closed before joining')));
    });
  }

  onStateUpdate(cb: StateCallback): void {
    this.callbacks.push(cb);
  }

  paint(x: number, y: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'paint', x, y } satisfies ClientMsg));
    }
  }

  getState(): GameState | null {
    return this.state;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}

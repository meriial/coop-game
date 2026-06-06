export interface Player {
  id: string;
  name: string;
  color: string;
}

export interface GameState {
  canvas: (string | null)[][];
  target: boolean[][];
  players: Record<string, Player>;
  progress: number;
}

export type ClientMsg =
  | { type: 'join'; name: string }
  | { type: 'paint'; x: number; y: number };

export type ServerMsg =
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string };

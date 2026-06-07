import type { ComponentType } from 'react';

export interface GameComponentProps<State = unknown> {
  state: State;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  isHost: boolean;
  myName: string;
  myOwner: string;
  connectedUsers: { name: string; color?: string }[];
}

export type GameComponent<State = unknown> = ComponentType<GameComponentProps<State>>;

export interface ClientGameEntry<State = unknown> {
  id: string;
  Component: GameComponent<State>;
  /** Extract this game's state slice from the merged WsState games bag */
  selectState: (games: Record<string, unknown>) => State;
}

export class ClientGameRegistry {
  private games = new Map<string, ClientGameEntry>();

  register<State>(entry: ClientGameEntry<State>): void {
    this.games.set(entry.id, entry as ClientGameEntry);
  }

  get(id: string): ClientGameEntry | undefined {
    return this.games.get(id);
  }
}

export const clientGameRegistry = new ClientGameRegistry();

export interface Player {
  id: string;
  name: string;
  color: string;
  ownerId: string;
  isAgent: boolean;
  agentLabel?: string;
}

export interface MatchScore {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface MatchState {
  matchBoard: string[];
  matchClaimed: (string | null)[];
  matchPending: Record<string, string>;
  matchRevealed: Record<string, string>;
  matchPaused: boolean;
  matchScores: MatchScore[];
  matchElementCount: number;
  gameOver: boolean;
}

export interface CanvasState {
  canvas: (string | null)[][];
  progress: number;
  players: Record<string, Pick<Player, 'id' | 'name' | 'color'>>;
}

export interface ConnectedUser {
  name: string;
  color?: string;
}

export type InboundMsg =
  | { type: 'STEP_CHANGE'; stepIndex: number }
  | { type: 'SUBMIT_VOTE'; pollId: string; choice: string; pollType?: string }
  | { type: 'RESET_POLL'; pollId: string }
  | { type: 'GAME_JOIN'; name: string }
  | { type: 'GAME_PAINT'; x: number; y: number }
  | { type: 'GAME_RESET' }
  | { type: 'MATCH_FLIP'; pos: number }
  | { type: 'MATCH_PAUSE' }
  | { type: 'MATCH_RESET' }
  | { type: 'MATCH_SET_SIZE'; count: number };

export type OutboundMsg =
  | ({ type: 'WELCOME'; stepIndex: number; role: string; pollResults: Record<string, Record<string, number>>; pollValues: Record<string, string[]> } & CanvasState & MatchState)
  | { type: 'SYNC_STEP'; stepIndex: number }
  | { type: 'POLL_UPDATES'; pollId: string; results?: Record<string, number>; values?: string[] }
  | { type: 'POLL_RESET'; pollId: string }
  | ({ type: 'SYNC_CANVAS' } & CanvasState)
  | ({ type: 'SYNC_MATCH' } & MatchState)
  | { type: 'CONNECTED_USERS'; users: ConnectedUser[] };

export interface RoomAttachment {
  role: 'presenter' | 'participant';
  email: string;
  name: string;
  participantId: string;
  ownerId?: string;
  isAgent?: boolean;
  agentLabel?: string;
}

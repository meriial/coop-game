export type PollType = 'choice' | 'slider1d' | 'slider2d';

export type PollConfig =
  | { type: 'choice'; question: string; options: string[]; showLiveResults?: boolean }
  | { type: 'slider1d'; question: string; leftLabel: string; rightLabel: string; showLiveResults?: boolean }
  | { type: 'slider2d'; question: string; labels: [string, string, string]; showLiveResults?: boolean };

export type PresentationStep =
  | { type: 'slide'; slideIndex: number }
  | { type: 'poll'; slideIndex: number; pollId: string }
  | { type: 'results'; slideIndex: number; pollIds: string[] }
  | { type: 'game'; gameId: string };

export const POLL_QUESTIONS: Record<string, PollConfig> = {
  workshop_feel: {
    type: 'choice',
    question: 'What excites you most about building with AI?',
    options: ['The speed', 'New possibilities', 'Better products', 'Learning it'],
    showLiveResults: true,
  },
  role_preference: {
    type: 'slider1d',
    question: 'Where do you sit on the stack?',
    leftLabel: 'Frontend',
    rightLabel: 'Backend',
  },
  discipline: {
    type: 'slider2d',
    question: 'What pulls you most?',
    labels: ['Games', 'Arts', 'Physical'],
  },
};

export function stepHasSound(step: PresentationStep): boolean {
  return step.type === 'game' && step.gameId === 'periodic-match';
}

export const presentationSteps: PresentationStep[] = [
  { type: 'game',    gameId: 'periodic-match' },
  { type: 'slide',   slideIndex: 0 },
  { type: 'slide',   slideIndex: 1 },
  { type: 'poll',    slideIndex: 3, pollId: 'workshop_feel' },
  { type: 'poll',    slideIndex: 3, pollId: 'role_preference' },
  { type: 'poll',    slideIndex: 3, pollId: 'discipline' },
  { type: 'results', slideIndex: 4, pollIds: ['workshop_feel', 'role_preference', 'discipline'] },
  { type: 'game',    gameId: 'pixel-heart' },
  { type: 'slide',   slideIndex: 2 },
];

export type PresentationStep =
  | { type: 'slide'; slideIndex: number; drawerOpen: false }
  | { type: 'slide'; slideIndex: number; drawerOpen: true; drawerContent: 'quiz' | 'results'; pollId: string }
  | { type: 'game'; gameId: 'pixel-heart' | 'periodic-match'; drawerOpen: false };

export const POLL_QUESTIONS: Record<string, { question: string; options: string[] }> = {
  workshop_feel: {
    question: 'What excites you most about building with AI?',
    options: ['The speed', 'New possibilities', 'Better products', 'Learning it'],
  },
};

export function stepHasSound(step: PresentationStep): boolean {
  return step.type === 'game' && step.gameId === 'periodic-match';
}

export const presentationSteps: PresentationStep[] = [
  { type: 'game',  gameId: 'periodic-match', drawerOpen: false },
  { type: 'slide', slideIndex: 0, drawerOpen: false },
  { type: 'slide', slideIndex: 1, drawerOpen: false },
  { type: 'slide', slideIndex: 1, drawerOpen: true, drawerContent: 'quiz',    pollId: 'workshop_feel' },
  { type: 'slide', slideIndex: 1, drawerOpen: true, drawerContent: 'results', pollId: 'workshop_feel' },
  { type: 'game',  gameId: 'pixel-heart', drawerOpen: false },
  { type: 'slide', slideIndex: 2, drawerOpen: false },
];

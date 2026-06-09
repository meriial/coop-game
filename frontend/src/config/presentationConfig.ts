export type PollType = "choice" | "slider1d" | "slider2d";

export type PollConfig =
  | {
      type: "choice";
      question: string;
      options: string[];
      showLiveResults?: boolean;
    }
  | {
      type: "slider1d";
      question: string;
      leftLabel: string;
      rightLabel: string;
      showLiveResults?: boolean;
    }
  | {
      type: "slider2d";
      question: string;
      labels: [string, string, string];
      showLiveResults?: boolean;
    };

export type PresentationStep =
  | { type: "slide"; slideIndex: number }
  | { type: "poll"; slideIndex: number; pollId: string }
  | { type: "results"; slideIndex: number; pollIds: string[] }
  | { type: "game"; gameId: string };

export const POLL_QUESTIONS: Record<string, PollConfig> = {
  workshop_feel: {
    type: "choice",
    question: "What excites you most about building with AI?",
    options: [
      "The speed",
      "New possibilities",
      "Better products",
      "Learning it",
    ],
    showLiveResults: true,
  },
  role_preference: {
    type: "slider1d",
    question: "Where do you sit on the stack?",
    leftLabel: "Frontend",
    rightLabel: "Backend",
  },
  discipline: {
    type: "slider2d",
    question: "What pulls you most?",
    labels: ["Games", "Arts", "Physical"],
  },
  cats_or_dogs: {
    type: "slider2d",
    question: "Cats or dogs?",
    labels: ["Cats", "Dogs", "Neither"],
  },
  scifi: {
    type: "slider2d",
    question: "Scify?",
    labels: ["Star Wars", "Star Trek", "Neither"],
  },
};

export function stepHasSound(step: PresentationStep): boolean {
  return step.type === "game" && step.gameId === "periodic-match";
}

export const presentationSteps: PresentationStep[] = [
  { type: "game", gameId: "periodic-match" },
  { type: "slide", slideIndex: 0 },
  { type: "poll", slideIndex: 1, pollId: "scifi" },
  { type: "poll", slideIndex: 1, pollId: "cats_or_dogs" },
  { type: "poll", slideIndex: 1, pollId: "discipline" },
  { type: "poll", slideIndex: 1, pollId: "role_preference" },
  { type: "poll", slideIndex: 1, pollId: "workshop_feel" },
  {
    type: "results",
    slideIndex: 1,
    pollIds: [
      "scifi",
      "cats_or_dogs",
      "workshop_feel",
      "role_preference",
      "discipline",
    ],
  },
  { type: "slide", slideIndex: 1 },
  { type: "slide", slideIndex: 2 },
  { type: "slide", slideIndex: 3 },
  { type: "slide", slideIndex: 4 },
  { type: "slide", slideIndex: 5 },
  { type: "slide", slideIndex: 6 },
  { type: "slide", slideIndex: 7 },
  { type: "slide", slideIndex: 8 },
  { type: "slide", slideIndex: 9 },
  { type: "slide", slideIndex: 10 },
  { type: "slide", slideIndex: 11 },
  { type: "slide", slideIndex: 12 },
  { type: "slide", slideIndex: 13 },
  { type: "slide", slideIndex: 14 },
  { type: "slide", slideIndex: 15 },
  { type: "slide", slideIndex: 16 },
  { type: "slide", slideIndex: 17 },
  { type: "slide", slideIndex: 18 },
  { type: "slide", slideIndex: 19 },
  { type: "slide", slideIndex: 20 },
  { type: "slide", slideIndex: 21 },
  { type: "game", gameId: "pixel-heart" },
];

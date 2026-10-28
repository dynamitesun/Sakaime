export type Skill = "grammar" | "nuance" | "keigo";

export type ChoiceItem = {
  id: string;
  skill: Skill;
  label: string;
  gloss: string;
  prompt: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  why: string;
  example: string;
  exampleEn: string;
};

export type ReadingQuestion = {
  id: string;
  prompt: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  why: string;
};

export type Reading = {
  id: string;
  title: string;
  source: string;
  body: string;
  translation: string;
  questions: [ReadingQuestion, ReadingQuestion];
};

export type CardStat = {
  ease: number;
  interval: number;
  due: string;
  seen: number;
  correct: number;
  lapses: number;
};

export type DayStat = {
  answered: number;
  correct: number;
  bridged: boolean;
};

export type Progress = {
  cards: Record<string, CardStat>;
  readings: Record<string, { seen: number; correct: number }>;
  days: Record<string, DayStat>;
  streak: number;
  bestStreak: number;
  lastDay: string | null;
};

export type LiveChoice = {
  item: ChoiceItem;
  options: { text: string; ok: boolean }[];
  retried: boolean;
};

export type Answered = {
  id: string;
  label: string;
  prompt: string;
  skill: Skill | "reading";
  ok: boolean;
  chosen: string;
  correct: string;
};

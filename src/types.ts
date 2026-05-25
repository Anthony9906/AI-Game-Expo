export type Screen = 'welcome' | 'briefing' | 'battle' | 'result';

export type Option = {
  id: string;
  label: string;
  description: string;
  prefix?: string;
  visual?: string;
};

export type Question = {
  id: string;
  prompt: string;
  briefingPrompt?: string;
  scene: string;
  background: string;
  requirement: string;
  hintTags: string[];
  visual: 'lotus' | 'camera' | 'rail';
  domainLabel: string;
  options: Option[];
  correctOptionId: string;
  aiAnswer: string;
  aiLogic: string[];
  aiSteps: {
    recognize: string;
    judge: string;
    answer: string;
  };
};

export type QuestionSet = {
  id: string;
  title: string;
  description: string;
  questions: Question[];
};

export type AiStepKey = 'recognize' | 'judge' | 'answer';

export type AiState = {
  recognize: string;
  judge: string;
  answer: string;
  logic: string[];
  optionId: string | null;
  elapsedMs: number | null;
  currentStep: AiStepKey | null;
  source: 'model' | 'fallback';
};

export type MatchRecord = {
  id: string;
  createdAt: string;
  questionSetId: string;
  questionId: string;
  challengeIndex: number;
  totalChallenges: number;
  prompt: string;
  userOptionId: string;
  userOptionLabel: string;
  userElapsedMs: number;
  userAttemptCount: number;
  aiOptionId: string;
  aiOptionLabel: string;
  aiElapsedMs: number;
  aiSteps: {
    recognize: string;
    judge: string;
    answer: string;
  };
  aiLogic: string[];
  userCorrect: boolean;
  aiCorrect: boolean;
  aiSource: 'model' | 'fallback';
};

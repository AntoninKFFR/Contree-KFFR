import type { BidReadingAnswer, BidReadingExercise, BidReadingLevel } from "@/engine/training/bidReading";

export type TrainingDuoStatus = "lobby" | "active" | "completed" | "cancelled";
export type TrainingDuoQuestionPhase = "answering" | "revealed";
export type TrainingDuoIntent =
  | { type: "set-ready"; ready: boolean }
  | { type: "start" }
  | { type: "submit-answer"; answer: BidReadingAnswer }
  | { type: "ready-next" }
  | { type: "leave" }
  | { type: "cancel" };

export type TrainingDuoSessionView = {
  id: string;
  code?: string;
  status: TrainingDuoStatus;
  questionPhase: TrainingDuoQuestionPhase | null;
  level: BidReadingLevel;
  axisId: "bid-reading";
  axisVersion: 1;
  doctrineId: "advanced_rules_v4";
  doctrineRevision: "4.1";
  generatorVersion: 1;
  rulesetId: "contree-kffr";
  rulesetVersion: 1;
  seriesLength: 10;
  currentIndex: number;
  stateVersion: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelReason: string | null;
};

export type TrainingDuoParticipantView = {
  slot: 0 | 1;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  hasAnswered: boolean;
  readyForNext: boolean;
};

export type PublicBidReadingExerciseView = Pick<
  BidReadingExercise,
  "publicBids" | "targetBidIndex" | "targetPlayerId" | "targetBid" | "playerNames" | "assertionChoices"
> & {
  kind: "public";
  questionIndex: number;
  level: BidReadingLevel;
};

export type RevealedBidReadingExerciseView = Omit<PublicBidReadingExerciseView, "kind"> & {
  kind: "revealed";
  promise: BidReadingExercise["promise"];
  illustrationHand: BidReadingExercise["illustrationHand"];
  answers: { slot: 0 | 1; answer: BidReadingAnswer; correct: boolean; score: 0 | 1 }[];
};

export type TrainingDuoResult = {
  scoreA: number;
  scoreB: number;
  commonSuccesses: number;
  outOf: 10;
};

export type TrainingDuoView = {
  session: TrainingDuoSessionView;
  participants: TrainingDuoParticipantView[];
  viewerSlot: 0 | 1;
  exercise: PublicBidReadingExerciseView | RevealedBidReadingExerciseView | null;
  result?: TrainingDuoResult;
};

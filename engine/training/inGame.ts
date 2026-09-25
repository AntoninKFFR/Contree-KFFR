import type { GameState, PlayerId } from "@/engine/types";
import { generatorVersion } from "@/engine/training/generator";
import { createTrickValueExercise, type TrickValueExercise } from "@/engine/training/trickValue";
import { createMemoryExercise, gradeMemoryExercise, MEMORY_LEVELS, type MemoryAxisId, type MemoryExercise, type MemoryGrade } from "@/engine/training/memory";
import { createOpponentVoidsExercise, gradeOpponentVoidsExercise, OPPONENT_VOIDS_LEVELS, type OpponentVoidsExercise, type OpponentVoidsGrade } from "@/engine/training/opponentVoids";
import { inferVoidSuitsByPlayer } from "@/engine/knowledge/tableKnowledge";

export type TriggerMoment = "trick-start" | "trick-end" | "round-end" | "bidding-end";
export type InGameAxisId = "trick-value" | MemoryAxisId | "opponent-voids";
export type InGameContext = { viewerId: PlayerId; level: number; seed: number; moment: TriggerMoment };
export type InGameExercise =
  | { kind: "number"; axisId: "trick-value"; data: TrickValueExercise }
  | { kind: "cards"; axisId: MemoryAxisId; data: MemoryExercise }
  | { kind: "voids"; axisId: "opponent-voids"; data: OpponentVoidsExercise };
export type InGameAnswer =
  | { kind: "number"; value: number }
  | { kind: "cards"; selectedIds: string[]; assignments: Partial<Record<string, PlayerId>> }
  | { kind: "voids"; selectedCells: string[]; trumpCount: number | null };
export type InGameGrade =
  | { kind: "number"; correct: boolean; earnedScore: number; possibleScore: 1 }
  | { kind: "cards"; correct: boolean; earnedScore: number; possibleScore: 1; details: MemoryGrade }
  | { kind: "voids"; correct: boolean; earnedScore: number; possibleScore: 1; details: OpponentVoidsGrade };

export type InGameCapability = {
  moments: readonly TriggerMoment[];
  answerKind: InGameExercise["kind"];
  levelCount: number;
  isApplicable: (state: GameState, context: InGameContext) => boolean;
  buildExercise: (state: GameState, context: InGameContext) => InGameExercise;
  grade: (exercise: InGameExercise, answer: InGameAnswer) => InGameGrade;
};

export function gradeInGameExercise(exercise: InGameExercise, answer: InGameAnswer): InGameGrade {
  if (exercise.kind === "number" && answer.kind === "number") {
    const correct = Number.isInteger(answer.value) && answer.value === exercise.data.answer;
    return { kind: "number", correct, earnedScore: Number(correct), possibleScore: 1 };
  }
  if (exercise.kind === "cards" && answer.kind === "cards") {
    const details = gradeMemoryExercise(exercise.data, answer.selectedIds, answer.assignments);
    return { kind: "cards", correct: details.correct, earnedScore: details.score, possibleScore: 1, details };
  }
  if (exercise.kind === "voids" && answer.kind === "voids") {
    const details = gradeOpponentVoidsExercise(exercise.data, answer.selectedCells, answer.trumpCount);
    return { kind: "voids", correct: details.correct, earnedScore: details.score, possibleScore: 1, details };
  }
  throw new Error("Answer kind does not match the exercise.");
}

export const trickValueInGame: InGameCapability = {
  moments: ["trick-end"], answerKind: "number", levelCount: 2,
  isApplicable: (state, context) => context.viewerId === 0 && context.moment === "trick-end"
    && (context.level === 1 || context.level === 2) && state.completedTricks.length > 0
    && (context.level !== 1 || state.completedTricks.length < 8)
    && (state.phase === "playing" || state.phase === "finished" || state.phase === "game-over"),
  buildExercise: (state, context) => {
    const exercise = createTrickValueExercise({ state, seed: context.seed, generatorVersion });
    // The real engine result is the authority for this in-game question.
    return { kind: "number", axisId: "trick-value", data: { ...exercise, answer: state.completedTricks.at(-1)!.points } };
  },
  grade: gradeInGameExercise,
};

export function memoryInGame(axisId: MemoryAxisId): InGameCapability {
  const isRecall = axisId === "trick-recall";
  return {
    moments: [isRecall ? "trick-end" : "trick-start"], answerKind: "cards", levelCount: MEMORY_LEVELS[axisId],
    isApplicable: (state, context) => {
      if (context.viewerId !== 0 || context.moment !== (isRecall ? "trick-end" : "trick-start")
        || (state.phase !== "playing" && (!isRecall || (state.phase !== "finished" && state.phase !== "game-over")))
        || !state.trump || state.currentTrick.cards.length !== 0
        || context.level < 1 || context.level > MEMORY_LEVELS[axisId] || !Number.isInteger(context.level)) return false;
      const needed = isRecall && context.level === 4 ? 3 : isRecall && context.level === 3 ? 2 : 1;
      if (state.completedTricks.length < needed) return false;
      if (axisId === "master-in-hand" && state.hands[0].length === 0) return false;
      if (axisId === "master-cards") return createMemoryExercise(axisId, context.level, state, context.seed).expectedIds.length > 0;
      return true;
    },
    buildExercise: (state, context) => ({ kind: "cards", axisId, data: createMemoryExercise(axisId, context.level, state, context.seed) }),
    grade: gradeInGameExercise,
  };
}

export const opponentVoidsInGame: InGameCapability = {
  moments: ["trick-start"], answerKind: "voids", levelCount: OPPONENT_VOIDS_LEVELS,
  isApplicable: (state, context) => {
    if (context.viewerId !== 0 || context.moment !== "trick-start" || state.phase !== "playing"
      || !state.trump || state.currentTrick.cards.length !== 0 || state.completedTricks.length === 0
      || !Number.isInteger(context.level) || context.level < 1 || context.level > OPPONENT_VOIDS_LEVELS) return false;
    if (context.level === 1) return true;
    const inferred = inferVoidSuitsByPlayer(state, 0);
    return ([1, 2, 3] as const).some((id) => inferred[id].length > 0);
  },
  buildExercise: (state, context) => ({ kind: "voids", axisId: "opponent-voids",
    data: createOpponentVoidsExercise(context.level, state, context.seed) }),
  grade: gradeInGameExercise,
};

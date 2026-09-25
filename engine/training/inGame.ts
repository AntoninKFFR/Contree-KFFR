import type { GameState, PlayerId } from "@/engine/types";
import { generatorVersion } from "@/engine/training/generator";
import { createTrickValueExercise, type TrickValueExercise } from "@/engine/training/trickValue";
import { createMemoryExercise, gradeMemoryExercise, MEMORY_LEVELS, type MemoryAxisId, type MemoryExercise, type MemoryGrade } from "@/engine/training/memory";
import { createOpponentVoidsExercise, gradeOpponentVoidsExercise, OPPONENT_VOIDS_LEVELS, type OpponentVoidsExercise, type OpponentVoidsGrade } from "@/engine/training/opponentVoids";
import { getRemainingCardsBySuit, inferVoidSuitsByPlayer } from "@/engine/knowledge/tableKnowledge";

export type TriggerMoment = "trick-start" | "trick-end" | "round-end" | "bidding-end";
export type InGameAxisId = "trick-value" | MemoryAxisId | "opponent-voids";
export type InGameContext = { viewerId: PlayerId; level: number; seed: number; moment: TriggerMoment };
export type InGameExercise =
  | { kind: "number"; axisId: "trick-value"; data: TrickValueExercise }
  | { kind: "cards"; axisId: MemoryAxisId; data: MemoryExercise }
  | { kind: "boolean"; axisId: "master-in-hand"; data: MemoryExercise }
  | { kind: "voids"; axisId: "opponent-voids"; data: OpponentVoidsExercise };
export type InGameAnswer =
  | { kind: "number"; value: number }
  | { kind: "cards"; selectedIds: string[]; assignments: Partial<Record<string, PlayerId>> }
  | { kind: "boolean"; value: boolean }
  | { kind: "voids"; selectedCells: string[]; trumpCount: number | null };
export type InGameGrade =
  | { kind: "number"; correct: boolean; earnedScore: number; possibleScore: 1 }
  | { kind: "cards"; correct: boolean; earnedScore: number; possibleScore: 1; details: MemoryGrade }
  | { kind: "boolean"; correct: boolean; earnedScore: number; possibleScore: 1 }
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
  if (exercise.kind === "boolean" && answer.kind === "boolean") {
    const correct = answer.value === (exercise.data.expectedIds.length > 0);
    return { kind: "boolean", correct, earnedScore: Number(correct), possibleScore: 1 };
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

function inGameMemoryExercise(axisId: MemoryAxisId, level: number, state: GameState, seed: number): MemoryExercise {
  const trickIndex = axisId === "trick-recall" ? (seed >>> 0) % (state.completedTricks.length - 1) : undefined;
  const exercise = createMemoryExercise(axisId, level, state, seed, { trickIndex });
  if (axisId === "master-in-hand" && level === 1) {
    const suit = exercise.candidates[0]?.suit;
    const label = suit === "hearts" ? "cœur" : suit === "spades" ? "pique" : suit === "diamonds" ? "carreau" : "trèfle";
    if (suit) return { ...exercise, question: `As-tu la maîtrise à ${label} ?` };
  }
  return exercise;
}

export function memoryInGame(axisId: MemoryAxisId): InGameCapability {
  const isRecall = axisId === "trick-recall";
  return {
    moments: [isRecall ? "trick-end" : "trick-start"], answerKind: "cards", levelCount: MEMORY_LEVELS[axisId],
    isApplicable: (state, context) => {
      if (context.viewerId !== 0 || context.moment !== (isRecall ? "trick-end" : "trick-start")
        || (state.phase !== "playing" && (!isRecall || (state.phase !== "finished" && state.phase !== "game-over")))
        || !state.trump || state.currentTrick.cards.length !== 0
        || context.level < 1 || context.level > MEMORY_LEVELS[axisId] || !Number.isInteger(context.level)) return false;
      const needed = isRecall ? 3 : 1;
      if (state.completedTricks.length < needed) return false;
      if (axisId === "master-in-hand" && state.hands[0].length === 0) return false;
      const exercise = inGameMemoryExercise(axisId, context.level, state, context.seed);
      if (axisId === "master-cards") return exercise.expectedIds.length > 0;
      if (axisId === "master-in-hand") {
        if (context.level === 1) {
          const suit = exercise.candidates[0]?.suit;
          return exercise.candidates.length >= 2 && Boolean(suit)
            && getRemainingCardsBySuit(state, 0)[suit!].length > exercise.candidates.length;
        }
        return exercise.candidates.length >= 3 && exercise.expectedIds.length > 0
          && exercise.expectedIds.length < exercise.candidates.length;
      }
      if (axisId === "played-cards") return state.completedTricks.length >= 2 && exercise.candidates.length >= 4
        && exercise.expectedIds.length > 0 && exercise.expectedIds.length < exercise.candidates.length;
      return true;
    },
    buildExercise: (state, context) => {
      const data = inGameMemoryExercise(axisId, context.level, state, context.seed);
      return axisId === "master-in-hand" && context.level === 1
        ? { kind: "boolean", axisId, data } : { kind: "cards", axisId, data };
    },
    grade: gradeInGameExercise,
  };
}

function inGameLevelOneVoid(state: GameState, seed: number): OpponentVoidsExercise | null {
  const inferred = inferVoidSuitsByPlayer(state, 0);
  if (![1, 2, 3].some((id) => inferred[id as 1 | 2 | 3].length > 0)) return null;
  const targetProven = (seed & 1) === 0;
  for (let offset = 0; offset < 12; offset += 1) {
    let exercise: OpponentVoidsExercise;
    try { exercise = createOpponentVoidsExercise(1, state, seed + offset, targetProven); }
    catch { return null; }
    const suit = exercise.suits[0];
    const playerId = exercise.players[0];
    if (state.completedTricks.some((trick) => trick.cards[0]?.card.suit === suit
      && trick.cards[0]?.playerId !== playerId)) return exercise;
  }
  return null;
}

export const opponentVoidsInGame: InGameCapability = {
  moments: ["trick-start"], answerKind: "voids", levelCount: OPPONENT_VOIDS_LEVELS,
  isApplicable: (state, context) => {
    if (context.viewerId !== 0 || context.moment !== "trick-start" || state.phase !== "playing"
      || !state.trump || state.currentTrick.cards.length !== 0 || state.completedTricks.length === 0
      || !Number.isInteger(context.level) || context.level < 1 || context.level > OPPONENT_VOIDS_LEVELS) return false;
    if (context.level === 1) return state.completedTricks.length >= 2 && inGameLevelOneVoid(state, context.seed) !== null;
    const inferred = inferVoidSuitsByPlayer(state, 0);
    return ([1, 2, 3] as const).some((id) => inferred[id].length > 0);
  },
  buildExercise: (state, context) => {
    const data = context.level === 1 ? inGameLevelOneVoid(state, context.seed) : createOpponentVoidsExercise(context.level, state, context.seed);
    if (!data) throw new Error("No meaningful public void question at this boundary.");
    return { kind: "voids", axisId: "opponent-voids", data };
  },
  grade: gradeInGameExercise,
};

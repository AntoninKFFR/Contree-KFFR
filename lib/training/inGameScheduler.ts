import { trainingAxes } from "@/engine/training/axes";
import type { InGameAxisId, InGameExercise, TriggerMoment } from "@/engine/training/inGame";
import type { createTrainingAxisRegistry } from "@/engine/training/registry";
import type { GameState } from "@/engine/types";

export type InGameAxisChoice = { id: InGameAxisId; enabled: boolean; level: number };
export type InGameConfiguration = { budgetPerRound: 1 | 2 | 3; axes: InGameAxisChoice[] };
export type InGameBoundary = {
  key: string;
  roundNumber: number;
  trickIndex: number;
  moments: readonly TriggerMoment[];
  state: GameState;
};
export type InGameSchedulerState = {
  roundNumber: number;
  askedThisRound: number;
  seenKeys: readonly string[];
  countsByAxis: Readonly<Partial<Record<InGameAxisId, number>>>;
  questionCount: number;
};
export type ScheduledInGameQuestion = {
  eventKey: string;
  axisId: InGameAxisId;
  level: number;
  moment: TriggerMoment;
  exercise: InGameExercise;
};

export function emptyInGameSchedulerState(): InGameSchedulerState {
  return { roundNumber: 0, askedThisRound: 0, seenKeys: [], countsByAxis: {}, questionCount: 0 };
}

/** A completed trick is one boundary, even though it is also the next trick's start. */
export function detectInGameBoundary(previous: GameState | null, current: GameState): InGameBoundary | null {
  if (!previous || current.roundNumber !== previous.roundNumber && current.phase !== "playing") return null;
  const completed = current.completedTricks.length;
  const ended = current.roundNumber === previous.roundNumber && completed > previous.completedTricks.length;
  const started = current.phase === "playing" && current.currentTrick.cards.length === 0
    && (ended || previous.phase === "bidding");
  if (!ended && !started) return null;
  const moments: TriggerMoment[] = [];
  if (ended) moments.push("trick-end");
  if (started) moments.push("trick-start");
  if (ended && (current.phase === "finished" || current.phase === "game-over")) moments.push("round-end");
  return { key: `round:${current.roundNumber}:after-trick:${completed}`, roundNumber: current.roundNumber,
    trickIndex: completed, moments, state: current };
}

export function inGameQuestionSeed(sessionSeed: number, boundary: InGameBoundary, axisId: string, questionIndex: number): number {
  let hash = sessionSeed >>> 0;
  for (const char of `${boundary.roundNumber}:${boundary.trickIndex}:${boundary.key}:${axisId}:${questionIndex}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return hash;
}

export function scheduleInGameQuestion(
  current: InGameSchedulerState,
  boundary: InGameBoundary,
  configuration: InGameConfiguration,
  sessionSeed: number,
  registry: ReturnType<typeof createTrainingAxisRegistry> = trainingAxes,
): { state: InGameSchedulerState; question: ScheduledInGameQuestion | null } {
  if (current.seenKeys.includes(boundary.key)) return { state: current, question: null };
  const roundChanged = current.roundNumber !== boundary.roundNumber;
  const askedThisRound = roundChanged ? 0 : current.askedThisRound;
  const base: InGameSchedulerState = {
    ...current, roundNumber: boundary.roundNumber, askedThisRound, seenKeys: [...current.seenKeys, boundary.key],
  };
  const options = configuration.axes.flatMap((choice) => {
    if (!choice.enabled) return [];
    const axis = registry.resolve(choice.id);
    const capability = axis.inGame;
    if (!capability || !Number.isInteger(choice.level) || choice.level < 1 || choice.level > capability.levelCount) return [];
    const moment = boundary.moments.find((candidate) => capability.moments.includes(candidate));
    if (!moment || (moment !== "round-end" && askedThisRound >= Math.min(3, configuration.budgetPerRound))) return [];
    const seed = inGameQuestionSeed(sessionSeed, boundary, choice.id, current.questionCount);
    const context = { viewerId: 0 as const, level: choice.level, seed, moment };
    return capability.isApplicable(boundary.state, context) ? [{ choice, capability, context, moment }] : [];
  });
  const order = new Map(registry.list().map((axis, index) => [axis.id, index]));
  options.sort((left, right) =>
    (current.countsByAxis[left.choice.id] ?? 0) - (current.countsByAxis[right.choice.id] ?? 0)
    || (order.get(left.choice.id) ?? 0) - (order.get(right.choice.id) ?? 0));
  const selected = options[0];
  if (!selected) return { state: base, question: null };
  const exercise = selected.capability.buildExercise(boundary.state, selected.context);
  return {
    state: { ...base, askedThisRound: askedThisRound + Number(selected.moment !== "round-end"),
      countsByAxis: { ...current.countsByAxis, [selected.choice.id]: (current.countsByAxis[selected.choice.id] ?? 0) + 1 },
      questionCount: current.questionCount + 1 },
    question: { eventKey: boundary.key, axisId: selected.choice.id, level: selected.choice.level,
      moment: selected.moment, exercise },
  };
}

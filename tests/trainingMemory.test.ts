import { describe, expect, it } from "vitest";
import { cardId, createDeck, SUITS } from "@/engine/cards";
import { getMasterCardsStillOutBySuit, getPlayedCards, getRemainingCardsBySuit } from "@/engine/knowledge/tableKnowledge";
import { generateTrainingPosition, generatorVersion } from "@/engine/training/generator";
import { createMemoryExercise, generateMemorySeries, gradeMemoryExercise, MEMORY_AXIS_IDS, MEMORY_LEVELS } from "@/engine/training/memory";
import type { Card, GameState, PlayerId } from "@/engine/types";
import { emptyTrainingProgress, isMemoryLevelUnlocked, memorySeriesSeed, parseTrainingProgress, recordMemorySeries, recordPileCountSeries, recordTrickValueChallengeRun, recordTrickValueSeries, saveTrainingProgress } from "@/components/training/progress";
import { initialChallengeState } from "@/engine/training/trickValueChallenge";

function stateWithHistory(): GameState {
  for (let seed = 1; seed < 100; seed += 1) {
    const state = generateTrainingPosition({ seed, generatorVersion }).state;
    if (state.completedTricks.length >= 3 && state.hands[0].length > 0 && state.trump && getMasterCardsStillOutBySuit(state, 0)[state.trump]) return state;
  }
  throw new Error("No position with three completed tricks.");
}

function stateForCascade(hand: Card[], played: Card[] = []): GameState {
  const state = stateWithHistory();
  state.trump = "spades";
  state.contractMode = { kind: "suit", suit: "spades" };
  state.hands[0] = hand;
  state.currentTrick.cards = [];
  state.completedTricks = [{
    leaderId: 0, winnerId: 0, points: 0,
    cards: [...played, ...(["7", "8", "9", "J"] as const).slice(0, 4 - played.length).map((rank) => ({ suit: "diamonds" as const, rank }))]
      .map((card, index) => ({ playerId: (index % 4) as PlayerId, card })),
  }];
  return state;
}

describe("memory axes", () => {
  it("generates deterministic ten-question series on separate seed lanes for every axis and level", () => {
    const progress = emptyTrainingProgress();
    const seeds = new Set<number>();
    for (const axisId of MEMORY_AXIS_IDS) {
      for (let level = 1; level <= MEMORY_LEVELS[axisId]; level += 1) {
        const seed = 1_000_000 + MEMORY_AXIS_IDS.indexOf(axisId) * 1_000_000_000 + level * 10_000_000;
        seeds.add(seed);
        const options = { axisId, level, seed, generatorVersion };
        const first = generateMemorySeries(options);
        expect(first).toHaveLength(10);
        expect(generateMemorySeries(options)).toEqual(first);
        expect(first.every((exercise) => exercise.axisId === axisId && exercise.level === level)).toBe(true);
        expect(first.every((exercise) => exercise.observation.completedTricks.length >= (axisId === "trick-recall" && level >= 3 ? 2 : 1))).toBe(true);
        expect(first.every((exercise) => !exercise.observation.currentCards.some((played) => exercise.axisId === "trick-recall" && exercise.expectedIds.includes(cardId(played.card))))).toBe(true);
      }
      expect(memorySeriesSeed(progress, axisId, 1)).toBe(1_000_000 + MEMORY_AXIS_IDS.indexOf(axisId) * 1_000_000_000 + 10_000_000);
    }
    expect(seeds.size).toBe(14);
    const first = generateMemorySeries({ axisId: "played-cards", level: 1, seed: memorySeriesSeed(progress, "played-cards", 1), generatorVersion });
    const after = recordMemorySeries(progress, "played-cards", 1, 0);
    const second = generateMemorySeries({ axisId: "played-cards", level: 1, seed: memorySeriesSeed(after, "played-cards", 1), generatorVersion });
    expect(second.map((exercise) => exercise.seed)).not.toEqual(first.map((exercise) => exercise.seed));
  });

  it("takes master-card answers from table knowledge, with side suit, trump and four-suit scopes", () => {
    const state = stateWithHistory();
    const masters = getMasterCardsStillOutBySuit(state, 0);
    for (const level of [1, 2, 3]) {
      const exercise = createMemoryExercise("master-cards", level, state, 42);
      const suits = level === 3 ? SUITS : [exercise.candidates[0].suit];
      expect(exercise.expectedIds).toEqual(suits.flatMap((suit) => masters[suit] ? [cardId(masters[suit])] : []));
      if (level === 1) expect(exercise.candidates[0].suit).not.toBe(state.trump);
      if (level === 2) expect(exercise.candidates[0].suit).toBe(state.trump);
      if (level === 3) expect(exercise.candidates).toHaveLength(32);
    }
    const trumpMaster = masters[state.trump!];
    expect(trumpMaster).not.toBeNull();
    expect(createMemoryExercise("master-cards", 2, state, 42).expectedIds).toEqual([cardId(trumpMaster!)]);
  });

  it("promotes the trump nine after the trump jack has been played", () => {
    let found: GameState | null = null;
    for (let seed = 1; seed < 500 && !found; seed += 1) {
      const state = generateTrainingPosition({ seed, generatorVersion }).state;
      if (!state.trump || state.completedTricks.length === 0) continue;
      const playedJack = getPlayedCards(state, 0).some((card) => card.suit === state.trump && card.rank === "J");
      if (playedJack && getMasterCardsStillOutBySuit(state, 0)[state.trump]?.rank === "9") found = state;
    }
    expect(found).not.toBeNull();
    expect(createMemoryExercise("master-cards", 2, found!, 42).expectedIds).toEqual([cardId({ suit: found!.trump!, rank: "9" })]);
  });

  it("recognizes a ten in hand once its higher ace has fallen, without reading another hand", () => {
    let found: GameState | null = null;
    let ten: Card | null = null;
    for (let seed = 1; seed < 500 && !found; seed += 1) {
      const state = generateTrainingPosition({ seed, generatorVersion }).state;
      if (state.completedTricks.length === 0) continue;
      const masters = getMasterCardsStillOutBySuit(state, 0);
      ten = state.hands[0].find((card) => card.rank === "10" && card.suit !== state.trump && masters[card.suit]?.rank === "10") ?? null;
      if (ten) found = state;
    }
    expect(found).not.toBeNull();
    const exercise = createMemoryExercise("master-in-hand", 2, found!, 19);
    expect(exercise.expectedIds).toContain(cardId(ten!));
    expect(exercise.candidates).toEqual(found!.hands[0]);
    const scope = createMemoryExercise("master-in-hand", 1, found!, 19);
    expect(new Set(scope.candidates.map((card) => card.suit)).size).toBe(1);
    expect(scope.candidates.every((card) => found!.hands[0].some((held) => cardId(held) === cardId(card)))).toBe(true);
    const changed = structuredClone(found!);
    changed.hands[1] = []; changed.hands[2] = []; changed.hands[3] = [];
    expect(createMemoryExercise("master-in-hand", 2, changed, 19).expectedIds).toEqual(exercise.expectedIds);
  });

  it("includes consecutive non-trump masters in both master-in-hand levels", () => {
    const ace = { suit: "hearts", rank: "A" } as const;
    const ten = { suit: "hearts", rank: "10" } as const;
    const state = stateForCascade([ace, ten]);
    for (const level of [1, 2]) {
      expect(createMemoryExercise("master-in-hand", level, state, 19).expectedIds).toEqual([cardId(ace), cardId(ten)]);
    }
  });

  it("stops the cascade at the first card still outside the hand", () => {
    const ace = { suit: "hearts", rank: "A" } as const;
    const king = { suit: "hearts", rank: "K" } as const;
    const state = stateForCascade([ace, king]);
    for (const level of [1, 2]) {
      expect(createMemoryExercise("master-in-hand", level, state, 19).expectedIds).toEqual([cardId(ace)]);
    }
  });

  it("includes cascades from every suit at level two while level one keeps its chosen suit", () => {
    const hearts = [{ suit: "hearts", rank: "A" }, { suit: "hearts", rank: "10" }] as const;
    const spades = [{ suit: "spades", rank: "J" }, { suit: "spades", rank: "9" }] as const;
    const state = stateForCascade([...hearts, ...spades]);
    expect(createMemoryExercise("master-in-hand", 1, state, 0).expectedIds).toEqual(hearts.map(cardId));
    expect(createMemoryExercise("master-in-hand", 2, state, 0).expectedIds).toEqual([...hearts, ...spades].map(cardId));
  });

  it("continues the cascade from the ten after the ace has been played", () => {
    const ace = { suit: "hearts", rank: "A" } as const;
    const ten = { suit: "hearts", rank: "10" } as const;
    const king = { suit: "hearts", rank: "K" } as const;
    const state = stateForCascade([ten, king], [ace]);
    for (const level of [1, 2]) {
      expect(createMemoryExercise("master-in-hand", level, state, 19).expectedIds).toEqual([cardId(ten), cardId(king)]);
    }
  });

  it("uses trump master order and ignores changes to hidden opponent hands", () => {
    const jack = { suit: "spades", rank: "J" } as const;
    const nine = { suit: "spades", rank: "9" } as const;
    const ace = { suit: "spades", rank: "A" } as const;
    const ten = { suit: "spades", rank: "10" } as const;
    const state = stateForCascade([jack, nine, ace, ten]);
    const changed = structuredClone(state);
    changed.hands[1] = []; changed.hands[2] = []; changed.hands[3] = [];
    for (const level of [1, 2]) {
      const expectedIds = [cardId(jack), cardId(nine), cardId(ace), cardId(ten)];
      expect(createMemoryExercise("master-in-hand", level, state, 19).expectedIds).toEqual(expectedIds);
      expect(createMemoryExercise("master-in-hand", level, changed, 19).expectedIds).toEqual(expectedIds);
    }
  });

  it("takes played-card answers from remaining-card knowledge for all five scopes", () => {
    const state = stateWithHistory();
    const remaining = new Set(SUITS.flatMap((suit) => getRemainingCardsBySuit(state, 0)[suit]).map(cardId));
    const sizes = [4, 8, 8, 8, 32];
    for (let level = 1; level <= 5; level += 1) {
      const exercise = createMemoryExercise("played-cards", level, state, 42);
      expect(exercise.candidates).toHaveLength(sizes[level - 1]);
      expect(exercise.expectedIds).toEqual(exercise.candidates.map(cardId).filter((id) => remaining.has(id)));
      if (level === 3) expect(exercise.candidates[0].suit).not.toBe(state.trump);
      if (level === 4) expect(exercise.candidates[0].suit).toBe(state.trump);
    }
  });

  it("recalls only completed tricks and grades cards and player attribution by eighths", () => {
    const state = stateWithHistory();
    for (const level of [1, 2, 3, 4]) {
      const exercise = createMemoryExercise("trick-recall", level, state, 42);
      const index = level === 3 ? state.completedTricks.length - 2 : level === 4 ? 42 % state.completedTricks.length : state.completedTricks.length - 1;
      const trick = state.completedTricks[index];
      expect(new Set(exercise.expectedIds)).toEqual(new Set(trick.cards.map(({ card }) => cardId(card))));
      expect(exercise.requiresPlayers).toBe(level === 2 || level === 4);
      expect(exercise.candidates).toEqual(createDeck());
      if (exercise.requiresPlayers) {
        expect(exercise.expectedPlayers).toEqual(Object.fromEntries(trick.cards.map(({ card, playerId }) => [cardId(card), playerId])));
      }
    }
    const plain = createMemoryExercise("trick-recall", 1, state, 42);
    const wrong = plain.candidates.map(cardId).filter((id) => !plain.expectedIds.includes(id));
    expect(() => gradeMemoryExercise(plain, plain.expectedIds.slice(0, 3))).toThrow();
    for (let count = 0; count <= 4; count += 1) {
      const selection = [...plain.expectedIds.slice(0, count), ...wrong.slice(0, 4 - count)];
      expect(gradeMemoryExercise(plain, selection).score).toBe(count / 4);
    }
    const attributed = createMemoryExercise("trick-recall", 2, state, 42);
    const selected = attributed.expectedIds;
    const correctAssignments = attributed.expectedPlayers;
    expect(gradeMemoryExercise(attributed, selected, correctAssignments).score).toBe(1);
    expect(gradeMemoryExercise(attributed, selected).score).toBe(0.5);
    expect(gradeMemoryExercise(attributed, [...selected.slice(0, 3), wrong[0]], correctAssignments).score).toBe(0.75);
    const oneWrong = { ...correctAssignments, [selected[0]]: ((correctAssignments[selected[0]]! + 1) % 4) as PlayerId };
    expect(gradeMemoryExercise(attributed, selected, oneWrong).score).toBe(0.875);
    expect(gradeMemoryExercise(attributed, wrong.slice(0, 4), correctAssignments).score).toBe(0);
  });

  it("returns binary scoring and useful correction for the other axes, including an empty answer", () => {
    const state = stateWithHistory();
    const exercise = createMemoryExercise("played-cards", 1, state, 42);
    expect(gradeMemoryExercise(exercise, exercise.expectedIds)).toMatchObject({ correct: true, score: 1, missedIds: [], extraIds: [] });
    const grade = gradeMemoryExercise(exercise, []);
    expect(grade.score).toBe(exercise.expectedIds.length === 0 ? 1 : 0);
    expect(grade.missedIds).toEqual(exercise.expectedIds);
    const handExercise = createMemoryExercise("master-in-hand", 2, state, 42);
    expect(gradeMemoryExercise(handExercise, [])).toBeDefined();
  });

  it("does not let hidden opponent hands affect public memory answers", () => {
    const state = stateWithHistory();
    const mutated = structuredClone(state);
    mutated.hands[1] = []; mutated.hands[2] = []; mutated.hands[3] = [];
    for (const axisId of ["master-cards", "played-cards", "trick-recall"] as const) {
      const first = createMemoryExercise(axisId, 1, state, 42);
      const second = createMemoryExercise(axisId, 1, mutated, 42);
      expect(second.expectedIds).toEqual(first.expectedIds);
      expect(second.expectedPlayers).toEqual(first.expectedPlayers);
      expect(JSON.stringify(first)).not.toContain(JSON.stringify(state.hands[1]));
    }
  });

  it("preserves trick-value challenges and decimal memory records through local parsing", () => {
    let progress = emptyTrainingProgress();
    progress = recordTrickValueSeries(progress, 1, 8);
    progress = recordMemorySeries(progress, "trick-recall", 1, 8.25);
    expect(isMemoryLevelUnlocked(progress, "trick-recall", 2)).toBe(true);
    expect(progress.axes["trick-value"].levels[1].bestScore).toBe(8);
    const parsed = parseTrainingProgress(JSON.stringify(progress));
    expect(parsed).toEqual(progress);
    expect(parseTrainingProgress("bad json")).toEqual(emptyTrainingProgress());
    expect(parseTrainingProgress(JSON.stringify({ version: 1, axes: { "trick-recall": progress.axes["trick-recall"] } })).axes["trick-recall"].levels[1].bestScore).toBe(8.25);
    expect(parseTrainingProgress('{"version":1,"axes":{"trick-value":{"bestScore":8,"completedSeries":1}}}').axes["trick-value"].unlockedLevel).toBe(2);
    expect(recordMemorySeries(parsed, "trick-recall", 2, 7.5).axes["trick-recall"].unlockedLevel).toBe(2);
    expect(recordMemorySeries(parsed, "trick-recall", 2, 8).axes["trick-recall"].unlockedLevel).toBe(3);
    expect(recordTrickValueSeries(parsed, 1, 1).axes["trick-recall"].levels[1].bestScore).toBe(8.25);
  });

  it("round-trips pile-count, memory, trick-value and challenges in either update order", () => {
    const serializeAndParse = (value: ReturnType<typeof emptyTrainingProgress>) => {
      let raw = "";
      saveTrainingProgress(value, { setItem: (_key, saved) => { raw = saved; } });
      return parseTrainingProgress(raw);
    };
    const initial = emptyTrainingProgress();
    const pileFirst = recordPileCountSeries(initial, "beginner", 9);
    const withManualTime = recordPileCountSeries(pileFirst, "manual", 10, 42_500);
    const withMemory = recordMemorySeries(withManualTime, "trick-recall", 1, 8.25);
    const withTrickValue = recordTrickValueSeries(withMemory, 1, 8);
    const withChallenge = recordTrickValueChallengeRun(withTrickValue, {
      ...initialChallengeState("survival"), finished: true, correctAnswers: 4,
    });
    const parsed = serializeAndParse(withChallenge);
    expect(parsed).toEqual(withChallenge);
    expect(parsed.axes["pile-count"].modes.beginner.bestScore).toBe(9);
    expect(parsed.axes["pile-count"].modes.manual.bestTimeMs).toBe(42_500);
    expect(parsed.axes["trick-recall"].levels[1].bestScore).toBe(8.25);
    expect(parsed.axes["trick-value"].levels[1].bestScore).toBe(8);
    expect(parsed.axes["trick-value"].challenges.survival.bestScore).toBe(4);

    const memoryFirst = recordMemorySeries(initial, "master-cards", 1, 8);
    const pileAfter = recordPileCountSeries(memoryFirst, "normal", 7);
    const reversed = serializeAndParse(pileAfter);
    expect(reversed).toEqual(pileAfter);
    expect(reversed.axes["master-cards"].levels[1].bestScore).toBe(8);
    expect(reversed.axes["pile-count"].modes.normal.bestScore).toBe(7);

    const badPile = parseTrainingProgress(JSON.stringify({ version: 1, axes: { ...parsed.axes, "pile-count": "invalid" } }));
    expect(badPile.axes["trick-recall"]).toEqual(parsed.axes["trick-recall"]);
    const badMemory = parseTrainingProgress(JSON.stringify({ version: 1, axes: { ...parsed.axes, "trick-recall": "invalid" } }));
    expect(badMemory.axes["pile-count"]).toEqual(parsed.axes["pile-count"]);
  });
});

import { describe, expect, it } from "vitest";
import { cardId, SUITS } from "@/engine/cards";
import { getRemainingTrumps, inferVoidSuitsByPlayer } from "@/engine/knowledge/tableKnowledge";
import { generateTrainingPosition, generatorVersion } from "@/engine/training/generator";
import { createOpponentVoidsExercise, generateOpponentVoidsSeries, gradeOpponentVoidsExercise, voidCellId } from "@/engine/training/opponentVoids";
import type { Card, CompletedTrick, GameState, PlayerId, Suit } from "@/engine/types";
import { createGameSettings } from "@/engine/rulesets/resolve";
import { relaxedFollowSuitVariant } from "@/tests/helpers/rulesets";
import { emptyTrainingProgress, isOpponentVoidsLevelUnlocked, opponentVoidsSeriesSeed, parseTrainingProgress, recordMemorySeries, recordOpponentVoidsSeries, recordPileCountSeries, recordTrickValueChallengeRun, recordTrickValueSeries } from "@/components/training/progress";
import { initialChallengeState } from "@/engine/training/trickValueChallenge";

function card(rank: Card["rank"], suit: Suit): Card { return { rank, suit }; }

function trick(cards: Array<[PlayerId, Card]>): CompletedTrick {
  return { leaderId: cards[0][0], winnerId: cards[0][0], points: 0,
    cards: cards.map(([playerId, played]) => ({ playerId, card: played })) };
}

function publicState(): GameState {
  const state = generateTrainingPosition({ seed: 370039, generatorVersion }).state;
  state.trump = "spades";
  state.contractMode = { kind: "suit", suit: "spades" };
  state.currentTrick.cards = [];
  state.completedTricks = [
    trick([[0, card("A", "hearts")], [1, card("7", "spades")], [2, card("K", "hearts")], [3, card("Q", "hearts")]]),
    trick([[2, card("A", "diamonds")], [3, card("8", "clubs")], [0, card("K", "diamonds")], [1, card("7", "diamonds")]]),
  ];
  state.hands[0] = [card("J", "spades"), card("9", "spades")];
  return state;
}

describe("opponent void deduction", () => {
  it("uses public off-suit plays for proven voids across players and suits", () => {
    const state = publicState();
    const inferred = inferVoidSuitsByPlayer(state, 0);
    expect(inferred[1]).toContain("hearts");
    expect(inferred[3]).toContain("diamonds");
    const level2 = createOpponentVoidsExercise(2, state, 12);
    expect(level2.players).toEqual([1, 2, 3]);
    expect(level2.suits).toEqual(SUITS);
    expect(level2.expectedCells).toEqual([voidCellId(1, "hearts"), voidCellId(3, "diamonds")]);
    expect(level2.proofs[voidCellId(1, "hearts")]).toMatchObject({ trickNumber: 1, playerId: 1 });
    expect(level2.proofs[voidCellId(3, "diamonds")]).toMatchObject({ trickNumber: 2, playerId: 3 });
    expect(gradeOpponentVoidsExercise(level2, level2.expectedCells, null)).toMatchObject({ correct: true, score: 1 });
    expect(gradeOpponentVoidsExercise(level2, [voidCellId(1, "diamonds")], null)).toMatchObject({
      correct: false, score: 0, unprovedCells: [voidCellId(1, "diamonds")], missedCells: level2.expectedCells,
    });
  });

  it("treats an unproven cell as unknown even when the opponent's hidden hand lacks that suit", () => {
    const state = publicState();
    state.hands[1] = state.hands[1].filter((held) => held.suit !== "diamonds");
    expect(inferVoidSuitsByPlayer(state, 0)[1]).not.toContain("diamonds");
    expect(createOpponentVoidsExercise(2, state, 0).expectedCells).not.toContain(voidCellId(1, "diamonds"));
    const exercise = createOpponentVoidsExercise(1, state, 0, false);
    expect(exercise.players).toHaveLength(1);
    expect(exercise.suits).toHaveLength(1);
    expect(exercise.expectedCells).toEqual([]);
    expect(gradeOpponentVoidsExercise(exercise, [], null).score).toBe(1);
  });

  it("follows the engine when a ruleset does not require following suit", () => {
    const state = publicState();
    state.settings = createGameSettings({ ruleset: relaxedFollowSuitVariant });
    expect(inferVoidSuitsByPlayer(state, 0)[1]).toEqual([]);
    expect(createOpponentVoidsExercise(2, state, 0).expectedCells).toEqual([]);
  });

  it("is invariant to opponent hands and counts only public remaining trumps outside seat zero's hand", () => {
    const state = publicState();
    const first = createOpponentVoidsExercise(3, state, 12);
    const expectedCount = getRemainingTrumps(state, 0).filter((trump) => !state.hands[0].some((own) => cardId(own) === cardId(trump))).length;
    expect(first.expectedTrumpCount).toBe(expectedCount);
    const changed = structuredClone(state);
    changed.hands[1] = []; changed.hands[2] = []; changed.hands[3] = [];
    for (const level of [1, 2, 3]) {
      const original = createOpponentVoidsExercise(level, state, 12);
      const mutated = createOpponentVoidsExercise(level, changed, 12);
      expect(mutated.expectedCells).toEqual(original.expectedCells);
      expect(mutated.expectedTrumpCount).toEqual(original.expectedTrumpCount);
    }
    changed.hands[0] = [card("J", "spades")];
    expect(createOpponentVoidsExercise(3, changed, 12).expectedTrumpCount).toBe(expectedCount + 1);
    changed.hands[0] = getRemainingTrumps(changed, 0);
    const zeroTrumps = createOpponentVoidsExercise(3, changed, 12);
    expect(zeroTrumps.expectedTrumpCount).toBe(0);
    expect(gradeOpponentVoidsExercise(zeroTrumps, zeroTrumps.expectedCells, 0).score).toBe(1);
    expect(gradeOpponentVoidsExercise(first, first.expectedCells, expectedCount).score).toBe(1);
    expect(gradeOpponentVoidsExercise(first, first.expectedCells, expectedCount - 1).score).toBe(0);
  });

  it("generates deterministic ten-question levels at trick starts with five proven and five unproven level-one cases", () => {
    const progress = emptyTrainingProgress();
    for (const level of [1, 2, 3]) {
      const options = { level, seed: opponentVoidsSeriesSeed({ ...progress, axes: { ...progress.axes, "opponent-voids": { ...progress.axes["opponent-voids"], unlockedLevel: 3 } } }, level), generatorVersion };
      const series = generateOpponentVoidsSeries(options);
      expect(series).toHaveLength(10);
      expect(generateOpponentVoidsSeries(options)).toEqual(series);
      expect(series.every((exercise) => exercise.observation.completedTricks.length >= 1 && exercise.observation.currentCards.length === 0)).toBe(true);
      if (level === 1) expect(series.map((exercise) => exercise.expectedCells.length)).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
      else expect(series.every((exercise) => exercise.expectedCells.length >= 1 && exercise.players.length === 3 && exercise.suits.length === 4)).toBe(true);
      if (level === 3) expect(series.every((exercise) => exercise.observation.ownHand !== undefined && exercise.expectedTrumpCount !== null)).toBe(true);
      else expect(series.every((exercise) => exercise.observation.ownHand === undefined)).toBe(true);
    }
    expect(opponentVoidsSeriesSeed(progress, 1)).toBe(5_010_000_000);
  });

  it("keeps local progress isolated, unlocks at 8/10, and does not reannounce a replay", () => {
    let progress = emptyTrainingProgress();
    progress = recordTrickValueSeries(progress, 1, 8);
    progress = recordTrickValueChallengeRun(progress, { ...initialChallengeState("survival"), finished: true, correctAnswers: 3 });
    progress = recordTrickValueChallengeRun(progress, { ...initialChallengeState("blitz"), finished: true, correctAnswers: 4 });
    progress = recordPileCountSeries(progress, "beginner", 9);
    for (const axisId of ["master-cards", "master-in-hand", "played-cards", "trick-recall"] as const) {
      progress = recordMemorySeries(progress, axisId, 1, 8);
    }
    const seven = recordOpponentVoidsSeries(progress, 1, 7);
    expect(isOpponentVoidsLevelUnlocked(seven, 2)).toBe(false);
    const eight = recordOpponentVoidsSeries(seven, 1, 8);
    expect(isOpponentVoidsLevelUnlocked(eight, 2)).toBe(true);
    expect(eight.axes["opponent-voids"].levels[1]).toEqual({ bestScore: 8, completedSeries: 2 });
    expect(opponentVoidsSeriesSeed(eight, 1)).toBe(opponentVoidsSeriesSeed(progress, 1) + 2_000);
    const replay = recordOpponentVoidsSeries(eight, 1, 1);
    expect(replay.axes["opponent-voids"].unlockedLevel).toBe(eight.axes["opponent-voids"].unlockedLevel);
    expect(replay.axes["opponent-voids"].levels[1]).toEqual({ bestScore: 8, completedSeries: 3 });
    const level3 = recordOpponentVoidsSeries(replay, 2, 8);
    expect(level3.axes["opponent-voids"].unlockedLevel).toBe(3);
    expect(recordOpponentVoidsSeries(level3, 3, 8).axes["opponent-voids"].unlockedLevel).toBe(3);
    expect(parseTrainingProgress(JSON.stringify(replay))).toEqual(replay);
    const corrupted = parseTrainingProgress(JSON.stringify({ ...replay, axes: { ...replay.axes, "opponent-voids": "bad" } }));
    expect(corrupted.axes["opponent-voids"]).toEqual(emptyTrainingProgress().axes["opponent-voids"]);
    for (const axisId of ["trick-value", "pile-count", "master-cards", "master-in-hand", "played-cards", "trick-recall"] as const) {
      expect(corrupted.axes[axisId]).toEqual(replay.axes[axisId]);
    }
    expect(parseTrainingProgress(null).axes["opponent-voids"]).toEqual(emptyTrainingProgress().axes["opponent-voids"]);
    const older = parseTrainingProgress(JSON.stringify({ ...replay, axes: { ...replay.axes, "opponent-voids": undefined } }));
    expect(older.axes["opponent-voids"]).toEqual(emptyTrainingProgress().axes["opponent-voids"]);
    expect(older.axes["trick-value"]).toEqual(replay.axes["trick-value"]);
    expect(older.axes["pile-count"]).toEqual(replay.axes["pile-count"]);
    expect(parseTrainingProgress("bad json")).toEqual(emptyTrainingProgress());
  });
});

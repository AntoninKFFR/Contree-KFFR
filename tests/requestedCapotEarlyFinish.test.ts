import { describe, expect, it, vi } from "vitest";
import { cardId, createDeck } from "@/engine/cards";
import { applyGameAction } from "@/engine/actions";
import { createInitialGame, playCard } from "@/engine/game";
import { createGameSettings } from "@/engine/rulesets/resolve";
import { generatorVersion } from "@/engine/training/generator";
import { trickValueInGame } from "@/engine/training/inGame";
import { createTrickValueExercise } from "@/engine/training/trickValue";
import type { Card, CompletedTrick, ContractStatus, GameState, PlayerId } from "@/engine/types";
import { turnDeadlineForState } from "@/lib/multiplayerTurnTimer";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { applyAuthorizedAction, applySingleBotTurn } from "@/lib/server/multiplayerGame";
import { parseServerGameState } from "@/lib/server/gameStateValidation";
import { createTestRuleset } from "@/tests/helpers/rulesets";

vi.mock("server-only", () => ({}));

function c(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

const firstTwoTricks: CompletedTrick[] = [
  {
    leaderId: 0,
    cards: [
      { playerId: 0, card: c("A", "clubs") },
      { playerId: 1, card: c("7", "clubs") },
      { playerId: 2, card: c("10", "clubs") },
      { playerId: 3, card: c("K", "clubs") },
    ],
    winnerId: 0,
    points: 25,
  },
  {
    leaderId: 0,
    cards: [
      { playerId: 0, card: c("K", "diamonds") },
      { playerId: 1, card: c("7", "diamonds") },
      { playerId: 2, card: c("A", "diamonds") },
      { playerId: 3, card: c("10", "diamonds") },
    ],
    winnerId: 2,
    points: 25,
  },
];

const decisiveCard = c("10", "spades");

function capotBeforeThirdTrickEnds(
  status: ContractStatus = "normal",
  thirdTrickWinner: 2 | 3 = 3,
  withAcquiredBonuses = false,
): GameState {
  const thirdTrickCards = thirdTrickWinner === 3
    ? [
        { playerId: 2 as const, card: c("7", "spades") },
        { playerId: 3 as const, card: c("A", "spades") },
        { playerId: 0 as const, card: c("K", "spades") },
      ]
    : [
        { playerId: 2 as const, card: c("A", "spades") },
        { playerId: 3 as const, card: c("7", "spades") },
        { playerId: 0 as const, card: c("K", "spades") },
      ];
  const alreadyPlayed = [...firstTwoTricks.flatMap((trick) => trick.cards), ...thirdTrickCards]
    .map((played) => cardId(played.card));
  const unplayed = createDeck().filter((card) => !alreadyPlayed.includes(cardId(card)));
  const otherCards = unplayed.filter((card) => cardId(card) !== cardId(decisiveCard));
  const playerOneFillers = otherCards.filter((card) => card.suit !== "spades").slice(0, 5);
  const remaining = otherCards.filter((card) => !playerOneFillers.some((selected) => cardId(selected) === cardId(card)));
  const ruleset = createTestRuleset({
    game: { targetScore: 5_000 },
    ...(withAcquiredBonuses ? { announcements: { enabled: true, tierce: true } } : {}),
  });

  return {
    ...createInitialGame(() => 0.1, { ruleset }),
    phase: "playing",
    settings: createGameSettings({ ruleset }),
    trump: "hearts",
    contractMode: { kind: "suit", suit: "hearts" },
    hands: {
      0: remaining.slice(0, 5),
      1: [decisiveCard, ...playerOneFillers],
      2: remaining.slice(5, 10),
      3: remaining.slice(10, 15),
    },
    currentPlayerId: 1,
    currentTrick: { leaderId: 2, cards: thirdTrickCards },
    completedTricks: firstTwoTricks,
    bids: [{ playerId: 0, action: "capot", trump: "hearts" }],
    contract: {
      kind: "capot",
      playerId: 0,
      teamId: 0,
      value: 250,
      trump: "hearts",
      contractMode: { kind: "suit", suit: "hearts" },
      status,
      ...(status !== "normal" ? { coinchedBy: 1 as const } : {}),
      ...(status === "surcoinched" ? { surcoinchedBy: 2 as const } : {}),
    },
    trickPoints: { 0: 50, 1: 0 },
    announcements: withAcquiredBonuses
      ? {
          declarations: [{ playerId: 0, teamId: 0, type: "tierce", value: 20, suit: "clubs", highestRank: "A" }],
          declaredPlayerIds: [0], winningTeam: 0, pointsByTeam: { 0: 20, 1: 0 },
        }
      : { declarations: [], declaredPlayerIds: [], winningTeam: null, pointsByTeam: { 0: 0, 1: 0 } },
    belote: withAcquiredBonuses
      ? { declaration: { playerId: 0, teamId: 0, firstRank: "K", completed: true, suit: "hearts" }, pointsByTeam: { 0: 20, 1: 0 } }
      : { declaration: null, pointsByTeam: { 0: 0, 1: 0 } },
  };
}

function successfulCapotBeforeLastCard(): GameState {
  const state = capotBeforeThirdTrickEnds();
  return {
    ...state,
    hands: { 0: [c("10", "clubs")], 1: [], 2: [], 3: [] },
    currentPlayerId: 0,
    currentTrick: {
      leaderId: 1,
      cards: [
        { playerId: 1, card: c("7", "clubs") },
        { playerId: 2, card: c("A", "clubs") },
        { playerId: 3, card: c("K", "clubs") },
      ],
    },
    completedTricks: Array.from({ length: 7 }, (_, index) => ({
      leaderId: 0 as const,
      cards: [],
      winnerId: (index % 2 === 0 ? 0 : 2) as PlayerId,
      points: 0,
    })),
    trickPoints: { 0: 127, 1: 0 },
  };
}

const room: RoomRow = {
  id: "room", code: "CAP001", status: "playing", host_user_id: "user-0", active_game_id: "game",
  scoring_mode: "ffb", target_score: 5_000, game_phase: "playing", state_version: 3,
  turn_deadline_at: null, created_at: "", updated_at: "", started_at: "", finished_at: null,
};

function players(kinds: Array<"human" | "bot"> = ["human", "human", "human", "human"]): RoomPlayerRow[] {
  return kinds.map((kind, seat) => ({
    id: `p${seat}`, room_id: room.id, seat_index: seat as PlayerId, kind,
    user_id: kind === "human" ? `user-${seat}` : null,
    bot_profile_id: kind === "bot" ? "simple" : null,
    display_name: `P${seat}`, is_ready: true, is_connected: true, bot_takeover: false,
    last_seen_at: null, joined_at: null, left_at: null, created_at: "", updated_at: "",
  }));
}

describe("requested capot early completion", () => {
  it.each([
    [5_000, "finished"],
    [500, "game-over"],
  ] as const)("builds a trick-value question from the decisive defensive trick in %s-point games", (targetScore, phase) => {
    const state = capotBeforeThirdTrickEnds();
    state.settings = createGameSettings({ ruleset: createTestRuleset({ game: { targetScore } }) });
    const ended = playCard(state, 1, decisiveCard);
    expect(ended.phase).toBe(phase);
    expect(ended.completedTricks).toHaveLength(3);
    expect(ended.currentTrick.cards).toEqual([]);

    const context = { viewerId: 0 as const, level: 1, seed: 43, moment: "trick-end" as const };
    expect(trickValueInGame.isApplicable(ended, context)).toBe(true);
    const direct = createTrickValueExercise({ state: ended, seed: context.seed, generatorVersion });
    expect(direct).toMatchObject({
      answer: ended.completedTricks.at(-1)!.points,
      isLastTrick: false,
      isCapot: false,
      bonusPoints: 0,
    });
    const exercise = trickValueInGame.buildExercise(ended, context);
    expect(exercise.kind).toBe("number");
    if (exercise.kind !== "number") throw new Error("Expected a trick-value question.");
    expect(exercise.data).toMatchObject({
      answer: ended.completedTricks.at(-1)!.points,
      isLastTrick: false,
      isCapot: false,
      bonusPoints: 0,
    });
  });

  it.each([
    ["normal", 1, 500],
    ["coinched", 2, 1_000],
    ["surcoinched", 4, 2_000],
  ] as const)("ends immediately on the first defensive trick when %s", (status, multiplier, defensiveScore) => {
    const finished = playCard(capotBeforeThirdTrickEnds(status), 1, decisiveCard);

    expect(finished.phase).toBe("finished");
    expect(finished.completedTricks).toHaveLength(3);
    expect(finished.currentTrick.cards).toEqual([]);
    expect(finished.hands[0]).toHaveLength(5);
    expect(finished.result).toMatchObject({
      kind: "played", contractSucceeded: false, multiplier,
      roundScore: { 0: 0, 1: defensiveScore },
    });
    expect(finished.roundHistory).toHaveLength(1);
    expect(finished.roundHistory[0].result).toEqual(finished.result);
    expect(finished.roundHistory[0].result).not.toHaveProperty("tenDeDerTeam");
  });

  it("keeps announcements and Belote already acquired under the active ruleset", () => {
    const finished = playCard(capotBeforeThirdTrickEnds("normal", 3, true), 1, decisiveCard);
    expect(finished.result).toMatchObject({
      announcementPointsByTeam: { 0: 0, 1: 20 },
      belotePointsByTeam: { 0: 20, 1: 0 },
      roundScore: { 0: 20, 1: 520 },
    });
  });

  it("ends the game when the defensive score reaches the target", () => {
    const state = capotBeforeThirdTrickEnds();
    const ruleset = createTestRuleset({ game: { targetScore: 500 } });
    state.settings = createGameSettings({ ruleset });
    const finished = playCard(state, 1, decisiveCard);
    expect(finished).toMatchObject({
      phase: "game-over", winnerTeam: 1, endReason: "score",
      totalScore: { 0: 0, 1: 500 },
    });
    expect(finished.roundHistory[0].totalScoreAfterRound).toEqual({ 0: 0, 1: 500 });
  });

  it("does not fail when the taker's partner wins the trick", () => {
    const next = playCard(capotBeforeThirdTrickEnds("normal", 2), 1, decisiveCard);
    expect(next.phase).toBe("playing");
    expect(next.completedTricks).toHaveLength(3);
    expect(next.currentPlayerId).toBe(2);
    expect(next.result).toBeNull();
  });

  it("keeps the successful eight-trick capot behavior", () => {
    const finished = playCard(successfulCapotBeforeLastCard(), 0, c("10", "clubs"));
    expect(finished.phase).toBe("finished");
    expect(finished.completedTricks).toHaveLength(8);
    expect(finished.result).toMatchObject({
      contractSucceeded: true, capotTeam: 0, multiplier: 1,
      tenDeDerTeam: 0,
      roundScore: { 0: 500, 1: 0 },
    });
  });

  it("does not end a numeric contract after a defensive trick", () => {
    const state = capotBeforeThirdTrickEnds();
    state.contract = { kind: "points", playerId: 0, teamId: 0, value: 80, trump: "hearts", status: "normal" };
    const next = playCard(state, 1, decisiveCard);
    expect(next.phase).toBe("playing");
    expect(next.completedTricks).toHaveLength(3);
  });

  it("finishes through the authoritative multiplayer path without a new timer", () => {
    const finished = applyAuthorizedAction({
      room, players: players(), state: capotBeforeThirdTrickEnds(), userId: "user-1",
      expectedVersion: 3, action: { type: "play-card", card: decisiveCard },
    });
    expect(parseServerGameState(finished).phase).toBe("finished");
    expect(finished.completedTricks).toHaveLength(3);
    expect(turnDeadlineForState(finished, players(), 1_000)).toBeNull();
  });

  it("stops bot automation as soon as the defensive trick defeats the capot", () => {
    const initial = capotBeforeThirdTrickEnds();
    const cardsBefore = Object.values(initial.hands).flat().length;
    const finished = applySingleBotTurn(initial, players(["human", "bot", "bot", "bot"]));
    expect(finished.phase).toBe("finished");
    expect(finished.completedTricks).toHaveLength(3);
    expect(Object.values(finished.hands).flat()).toHaveLength(cardsBefore - 1);
    expect(applyGameAction(finished, { type: "play-card", playerId: 2, card: finished.hands[2][0] })).toBe(finished);
  });
});

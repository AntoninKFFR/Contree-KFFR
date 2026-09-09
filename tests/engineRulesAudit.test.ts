import { describe, expect, it } from "vitest";
import { BID_VALUES, getAvailableBidValues } from "@/engine/bidding";
import { cardId, createDeck } from "@/engine/cards";
import {
  createInitialGame,
  getCurrentContract,
  makeBid,
  playCard,
  playableCardsForCurrentPlayer,
  startNextRound,
} from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import {
  cardPoints,
  getLegalCards,
  getTrickWinner,
  isLegalCard,
  nextPlayer,
} from "@/engine/rules";
import { scoreRound } from "@/engine/scoring";
import type { BidValue, Card, GameState, PlayerId, Rank, Suit, Trick } from "@/engine/types";

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });
const ids = (cards: Card[]) => cards.map(cardId).sort();

describe("engine rules audit: card model", () => {
  it("matches every normal and trump rank point value", () => {
    const normal: Array<[Rank, number]> = [
      ["A", 11], ["10", 10], ["K", 4], ["Q", 3], ["J", 2], ["9", 0], ["8", 0], ["7", 0],
    ];
    const trump: Array<[Rank, number]> = [
      ["J", 20], ["9", 14], ["A", 11], ["10", 10], ["K", 4], ["Q", 3], ["8", 0], ["7", 0],
    ];

    for (const [rank, points] of normal) expect(cardPoints(c(rank, "clubs"), "hearts")).toBe(points);
    for (const [rank, points] of trump) expect(cardPoints(c(rank, "hearts"), "hearts")).toBe(points);
    expect(createDeck().reduce((sum, card) => sum + cardPoints(card, "hearts"), 0)).toBe(152);
  });

  it("matches every adjacent comparison in normal and trump strength order", () => {
    const orders: Array<{ ranks: Rank[]; suit: Suit; trump: Suit }> = [
      { ranks: ["A", "10", "K", "Q", "J", "9", "8", "7"], suit: "clubs", trump: "hearts" },
      { ranks: ["J", "9", "A", "10", "K", "Q", "8", "7"], suit: "hearts", trump: "hearts" },
    ];

    for (const { ranks, suit, trump } of orders) {
      for (let index = 0; index < ranks.length - 1; index += 1) {
        const stronger = c(ranks[index], suit);
        const weaker = c(ranks[index + 1], suit);
        expect(getTrickWinner({ leaderId: 0, cards: [
          { playerId: 0, card: weaker }, { playerId: 1, card: stronger },
        ] }, trump)).toBe(1);
        expect(getTrickWinner({ leaderId: 0, cards: [
          { playerId: 0, card: stronger }, { playerId: 1, card: weaker },
        ] }, trump)).toBe(0);
      }
    }
  });
});

type LegalCase = {
  name: string;
  playerId: PlayerId;
  trump: Suit;
  hand: Card[];
  trick: Trick;
  expected: Card[];
};

const legalCases: LegalCase[] = [
  {
    name: "entame libre",
    playerId: 0,
    trump: "hearts",
    hand: [c("7", "clubs"), c("A", "hearts")],
    trick: { leaderId: 0, cards: [] },
    expected: [c("7", "clubs"), c("A", "hearts")],
  },
  {
    name: "deuxième joueur fournit la couleur hors atout",
    playerId: 1,
    trump: "hearts",
    hand: [c("7", "clubs"), c("A", "hearts")],
    trick: { leaderId: 0, cards: [{ playerId: 0, card: c("K", "clubs") }] },
    expected: [c("7", "clubs")],
  },
  {
    name: "troisième joueur fournit même après une coupe adverse",
    playerId: 2,
    trump: "hearts",
    hand: [c("A", "clubs"), c("J", "hearts")],
    trick: { leaderId: 0, cards: [
      { playerId: 0, card: c("K", "clubs") },
      { playerId: 1, card: c("7", "hearts") },
    ] },
    expected: [c("A", "clubs")],
  },
  {
    name: "quatrième joueur monte à l'atout même si son partenaire est maître",
    playerId: 3,
    trump: "hearts",
    hand: [c("J", "hearts"), c("8", "hearts"), c("7", "clubs")],
    trick: { leaderId: 0, cards: [
      { playerId: 0, card: c("7", "hearts") },
      { playerId: 1, card: c("9", "hearts") },
      { playerId: 2, card: c("A", "hearts") },
    ] },
    expected: [c("J", "hearts")],
  },
  {
    name: "à l'atout tous les atouts plus faibles restent légaux sans surmonte",
    playerId: 2,
    trump: "hearts",
    hand: [c("A", "hearts"), c("10", "hearts"), c("7", "clubs")],
    trick: { leaderId: 0, cards: [
      { playerId: 0, card: c("J", "hearts") },
      { playerId: 1, card: c("7", "hearts") },
    ] },
    expected: [c("A", "hearts"), c("10", "hearts")],
  },
  {
    name: "deuxième joueur coupe quand l'adversaire est maître",
    playerId: 1,
    trump: "hearts",
    hand: [c("7", "diamonds"), c("A", "hearts"), c("8", "hearts")],
    trick: { leaderId: 0, cards: [{ playerId: 0, card: c("K", "clubs") }] },
    expected: [c("A", "hearts"), c("8", "hearts")],
  },
  {
    name: "troisième joueur peut se défausser quand son partenaire est maître",
    playerId: 2,
    trump: "hearts",
    hand: [c("7", "diamonds"), c("A", "hearts")],
    trick: { leaderId: 0, cards: [
      { playerId: 0, card: c("A", "clubs") },
      { playerId: 1, card: c("K", "clubs") },
    ] },
    expected: [c("7", "diamonds"), c("A", "hearts")],
  },
  {
    name: "quatrième joueur avec seulement des atouts reste libre quand le partenaire a coupé maître",
    playerId: 3,
    trump: "hearts",
    hand: [c("8", "hearts"), c("J", "hearts")],
    trick: { leaderId: 0, cards: [
      { playerId: 0, card: c("A", "clubs") },
      { playerId: 1, card: c("9", "hearts") },
      { playerId: 2, card: c("K", "clubs") },
    ] },
    expected: [c("8", "hearts"), c("J", "hearts")],
  },
  {
    name: "sans couleur ni atout toutes les défausses sont légales",
    playerId: 1,
    trump: "hearts",
    hand: [c("7", "diamonds"), c("A", "spades")],
    trick: { leaderId: 0, cards: [{ playerId: 0, card: c("K", "clubs") }] },
    expected: [c("7", "diamonds"), c("A", "spades")],
  },
  {
    name: "surcoupe obligatoire contre un adversaire",
    playerId: 2,
    trump: "hearts",
    hand: [c("J", "hearts"), c("A", "hearts"), c("7", "diamonds")],
    trick: { leaderId: 0, cards: [
      { playerId: 0, card: c("A", "clubs") },
      { playerId: 1, card: c("9", "hearts") },
    ] },
    expected: [c("J", "hearts")],
  },
  {
    name: "ne pisse pas quand la surcoupe est impossible",
    playerId: 2,
    trump: "hearts",
    hand: [c("A", "hearts"), c("10", "hearts"), c("7", "diamonds")],
    trick: { leaderId: 0, cards: [
      { playerId: 0, card: c("A", "clubs") },
      { playerId: 1, card: c("J", "hearts") },
    ] },
    expected: [c("A", "hearts"), c("10", "hearts"), c("7", "diamonds")],
  },
  {
    name: "partenaire maître après sa coupe autorise toute carte",
    playerId: 3,
    trump: "hearts",
    hand: [c("A", "hearts"), c("7", "diamonds")],
    trick: { leaderId: 0, cards: [
      { playerId: 0, card: c("A", "clubs") },
      { playerId: 1, card: c("J", "hearts") },
      { playerId: 2, card: c("K", "clubs") },
    ] },
    expected: [c("A", "hearts"), c("7", "diamonds")],
  },
];

describe("engine rules audit: legal-card matrix", () => {
  it.each(legalCases)("accepts exactly the legal set: $name", ({ hand, trick, playerId, trump, expected }) => {
    const legal = getLegalCards(hand, trick, playerId, trump);
    expect(ids(legal)).toEqual(ids(expected));
    for (const card of hand) {
      expect(isLegalCard(hand, trick, card, playerId, trump)).toBe(ids(expected).includes(cardId(card)));
    }
  });

  it("playCard accepts a legal card and rejects both an illegal owned card and an absent card", () => {
    const state: GameState = {
      settings: { scoringMode: "made-points", targetScore: 1000 },
      phase: "playing",
      roundNumber: 1,
      startingPlayerId: 0,
      totalScore: { 0: 0, 1: 0 },
      roundHistory: [],
      winnerTeam: null,
      trump: "hearts",
      hands: {
        0: [c("K", "clubs")],
        1: [c("7", "clubs"), c("A", "hearts")],
        2: [c("8", "clubs")],
        3: [c("9", "clubs")],
      },
      currentPlayerId: 1,
      currentTrick: { leaderId: 0, cards: [{ playerId: 0, card: c("K", "clubs") }] },
      completedTricks: [],
      bids: [{ playerId: 0, action: "bid", value: 80, trump: "hearts" }],
      contract: { playerId: 0, teamId: 0, value: 80, trump: "hearts", status: "normal" },
      result: null,
      trickPoints: { 0: 0, 1: 0 },
      roundScore: { 0: 0, 1: 0 },
      message: "Audit",
    };

    expect(() => playCard(state, 1, c("7", "clubs"))).not.toThrow();
    expect(() => playCard(state, 1, c("A", "hearts"))).toThrow("not legal");
    expect(() => playCard(state, 1, c("A", "spades"))).toThrow("does not have");
  });
});

describe("engine rules audit: bidding characterization", () => {
  it("offers only 80 through 160 and only values strictly above the contract", () => {
    expect(BID_VALUES).toEqual([80, 90, 100, 110, 120, 130, 140, 150, 160]);
    expect(getAvailableBidValues(null)).toEqual(BID_VALUES);
    expect(getAvailableBidValues({
      playerId: 0, teamId: 0, value: 130, trump: "clubs", status: "normal",
    })).toEqual([140, 150, 160]);
  });

  it("characterizes that makeBid relies on TypeScript for the allowed-value boundary", () => {
    const state = createInitialGame(() => 0.1);
    const forgedValue = 170 as BidValue;
    const accepted = makeBid(state, 0, { action: "bid", value: forgedValue, trump: "clubs" });
    expect(getCurrentContract(accepted)?.value).toBe(170);
  });

  it("allows a player who passed to speak again after a later bid and rejects an equal bid", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "pass" });
    state = makeBid(state, 1, { action: "bid", value: 80, trump: "clubs" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    expect(state.currentPlayerId).toBe(0);
    expect(() => makeBid(state, 0, { action: "bid", value: 80, trump: "spades" })).toThrow("higher");
    expect(makeBid(state, 0, { action: "bid", value: 90, trump: "spades" }).currentPlayerId).toBe(1);
  });

  it("rejects coinche by the contract team and freezes normal bidding after a valid coinche", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    expect(() => makeBid(state, 3, { action: "coinche" })).toThrow("bid turn");
    state = makeBid(state, 1, { action: "pass" });
    expect(() => makeBid(state, 2, { action: "coinche" })).toThrow("cannot coinche");
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "coinche" });
    expect(getCurrentContract(state)?.status).toBe("coinched");
    expect(() => makeBid(state, 0, { action: "bid", value: 90, trump: "clubs" })).toThrow("not allowed");
  });

  it("rejects surcoinche by the coinching team", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    state = makeBid(state, 1, { action: "coinche" });
    state = makeBid(state, 2, { action: "pass" });
    expect(() => makeBid(state, 3, { action: "surcoinche" })).toThrow("cannot surcoinche");
  });

  it("ends immediately after a legal surcoinche", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    state = makeBid(state, 1, { action: "coinche" });
    state = makeBid(state, 2, { action: "surcoinche" });
    expect(state.phase).toBe("playing");
    expect(state.contract?.status).toBe("surcoinched");
  });

  it("characterizes the late-coinche gap: bidder pass ends before partner can surcoinche", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
    state = makeBid(state, 1, { action: "pass" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "coinche" });
    state = makeBid(state, 0, { action: "pass" });

    expect(state.phase).toBe("playing");
    expect(state.bids.at(-1)).toEqual({ playerId: 0, action: "pass" });
    expect(state.bids.some((bid) => bid.playerId === 2 && bid.action === "surcoinche")).toBe(false);
  });

  it("characterizes entame as the contract bidder rather than the original starting player", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "pass" });
    state = makeBid(state, 1, { action: "bid", value: 80, trump: "hearts" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    state = makeBid(state, 0, { action: "pass" });

    expect(state.startingPlayerId).toBe(0);
    expect(state.contract?.playerId).toBe(1);
    expect(state.currentTrick.leaderId).toBe(1);
  });
});

describe("engine rules audit: scoring characterization", () => {
  const contract = { playerId: 0, teamId: 0, value: 80, trump: "hearts" } as const;

  it("characterizes the missing defense comparison at equality and when defense is higher", () => {
    for (const scoringMode of ["announced-points", "made-points"] as const) {
      for (const trickPointsByTeam of [{ 0: 81, 1: 81 }, { 0: 80, 1: 82 }]) {
        const result = scoreRound({
          contract: { ...contract, status: "normal" },
          settings: { scoringMode, targetScore: 1000 },
          trickPointsByTeam,
        });
        expect(result.contractSucceeded).toBe(true);
      }
    }
  });

  it.each([
    { mode: "announced-points", status: "normal", points: { 0: 92, 1: 70 }, score: { 0: 80, 1: 0 } },
    { mode: "announced-points", status: "coinched", points: { 0: 92, 1: 70 }, score: { 0: 160, 1: 0 } },
    { mode: "announced-points", status: "surcoinched", points: { 0: 92, 1: 70 }, score: { 0: 320, 1: 0 } },
    { mode: "announced-points", status: "normal", points: { 0: 70, 1: 92 }, score: { 0: 0, 1: 80 } },
    { mode: "announced-points", status: "coinched", points: { 0: 70, 1: 92 }, score: { 0: 0, 1: 160 } },
    { mode: "announced-points", status: "surcoinched", points: { 0: 70, 1: 92 }, score: { 0: 0, 1: 320 } },
    { mode: "made-points", status: "normal", points: { 0: 92, 1: 70 }, score: { 0: 172, 1: 70 } },
    { mode: "made-points", status: "coinched", points: { 0: 92, 1: 70 }, score: { 0: 252, 1: 70 } },
    { mode: "made-points", status: "surcoinched", points: { 0: 92, 1: 70 }, score: { 0: 412, 1: 70 } },
    { mode: "made-points", status: "normal", points: { 0: 70, 1: 92 }, score: { 0: 0, 1: 242 } },
    { mode: "made-points", status: "coinched", points: { 0: 70, 1: 92 }, score: { 0: 0, 1: 322 } },
    { mode: "made-points", status: "surcoinched", points: { 0: 70, 1: 92 }, score: { 0: 0, 1: 482 } },
  ] as const)("documents $mode / $status scoring", ({ mode, status, points, score }) => {
    const result = scoreRound({
      contract: { ...contract, status },
      settings: { scoringMode: mode, targetScore: 1000 },
      trickPointsByTeam: points,
    });
    expect(result.roundScore).toEqual(score);
  });

  it.each([
    { status: "normal", score: 242 },
    { status: "coinched", score: 322 },
    { status: "surcoinched", score: 482 },
  ] as const)("characterizes absent capot scoring for a $status contract", ({ status, score }) => {
    const result = scoreRound({
      contract: { ...contract, status },
      settings: { scoringMode: "made-points", targetScore: 1000 },
      trickPointsByTeam: { 0: 162, 1: 0 },
    });
    expect(result.roundScore).toEqual({ 0: score, 1: 0 });
    expect("capot" in result).toBe(false);
  });
});

function allCardsInState(state: GameState): Card[] {
  return [
    ...state.hands[0], ...state.hands[1], ...state.hands[2], ...state.hands[3],
    ...state.currentTrick.cards.map((played) => played.card),
    ...state.completedTricks.flatMap((trick) => trick.cards.map((played) => played.card)),
  ];
}

function playDeterministicRound(seed: number): GameState {
  let state = createInitialGame(createSeededRandom(seed), { targetScore: 100_000 });
  const initialCards = allCardsInState(state);
  expect(initialCards).toHaveLength(32);
  expect(new Set(initialCards.map(cardId)).size).toBe(32);
  for (const playerId of [0, 1, 2, 3] as const) expect(state.hands[playerId]).toHaveLength(8);

  state = makeBid(state, state.currentPlayerId, { action: "bid", value: 80, trump: "hearts" });
  for (let count = 0; count < 3; count += 1) {
    state = makeBid(state, state.currentPlayerId, { action: "pass" });
  }

  const played = new Set<string>();
  while (state.phase === "playing") {
    const cardsInState = allCardsInState(state);
    expect(cardsInState).toHaveLength(32);
    expect(new Set(cardsInState.map(cardId)).size).toBe(32);

    const actor = state.currentPlayerId;
    const trickLength = state.currentTrick.cards.length;
    const legal = playableCardsForCurrentPlayer(state);
    expect(legal.length).toBeGreaterThan(0);
    const selected = legal[0];
    expect(played.has(cardId(selected))).toBe(false);
    played.add(cardId(selected));
    state = playCard(state, actor, selected);

    if (trickLength < 3) expect(state.currentPlayerId).toBe(nextPlayer(actor));
    else expect(state.currentPlayerId).toBe(state.completedTricks.at(-1)?.winnerId);
  }

  expect(played.size).toBe(32);
  expect(state.completedTricks).toHaveLength(8);
  expect(state.completedTricks.every((trick) => trick.cards.length === 4)).toBe(true);
  expect(state.completedTricks.reduce((sum, trick) => sum + trick.points, 0)).toBe(162);
  expect(state.hands[0]).toHaveLength(0);
  expect(state.hands[1]).toHaveLength(0);
  expect(state.hands[2]).toHaveLength(0);
  expect(state.hands[3]).toHaveLength(0);
  expect(state.roundHistory).toHaveLength(1);
  return state;
}

function playSyntheticLastTrick(totalScore: GameState["totalScore"], targetScore: number): GameState {
  let state: GameState = {
    settings: { scoringMode: "made-points", targetScore },
    phase: "playing",
    roundNumber: 2,
    startingPlayerId: 0,
    totalScore,
    roundHistory: [],
    winnerTeam: null,
    trump: "hearts",
    hands: {
      0: [c("7", "clubs")],
      1: [c("8", "clubs")],
      2: [c("9", "clubs")],
      3: [c("7", "diamonds")],
    },
    currentPlayerId: 0,
    currentTrick: { leaderId: 0, cards: [] },
    completedTricks: [],
    bids: [{ playerId: 0, action: "bid", value: 80, trump: "hearts" }],
    contract: { playerId: 0, teamId: 0, value: 80, trump: "hearts", status: "normal" },
    result: null,
    trickPoints: { 0: 71, 1: 81 },
    roundScore: { 0: 0, 1: 0 },
    message: "Audit final trick",
  };
  state = playCard(state, 0, c("7", "clubs"));
  state = playCard(state, 1, c("8", "clubs"));
  state = playCard(state, 2, c("9", "clubs"));
  return playCard(state, 3, c("7", "diamonds"));
}

describe("engine rules audit: round and game invariants", () => {
  it("preserves all cards and completes exactly eight legal tricks across deterministic seeds", () => {
    for (let seed = 1; seed <= 32; seed += 1) playDeterministicRound(seed);
  });

  it("is deterministic for an identical seed", () => {
    expect(playDeterministicRound(20260909)).toEqual(playDeterministicRound(20260909));
  });

  it("rotates the starting player after an all-pass round", () => {
    let state = createInitialGame(() => 0.1, { targetScore: 1000 });
    for (let count = 0; count < 4; count += 1) {
      state = makeBid(state, state.currentPlayerId, { action: "pass" });
    }
    const next = state.startingPlayerId;
    const nextRound = state.phase === "finished" ? startNextRound(state, () => 0.5) : state;
    expect(nextRound.startingPlayerId).toBe(nextPlayer(next));
  });

  it("handles below-target, one-winner, two-winner and exact-tie totals as currently implemented", () => {
    const below = playSyntheticLastTrick({ 0: 0, 1: 0 }, 500);
    expect(below).toMatchObject({ phase: "finished", winnerTeam: null, totalScore: { 0: 161, 1: 81 } });

    const oneWinner = playSyntheticLastTrick({ 0: 0, 1: 0 }, 100);
    expect(oneWinner).toMatchObject({ phase: "game-over", winnerTeam: 0, totalScore: { 0: 161, 1: 81 } });

    const higherWinner = playSyntheticLastTrick({ 0: 0, 1: 100 }, 100);
    expect(higherWinner).toMatchObject({ phase: "game-over", winnerTeam: 1, totalScore: { 0: 161, 1: 181 } });

    const exactTie = playSyntheticLastTrick({ 0: 0, 1: 80 }, 100);
    expect(exactTie).toMatchObject({ phase: "game-over", winnerTeam: 0, totalScore: { 0: 161, 1: 161 } });
  });
});

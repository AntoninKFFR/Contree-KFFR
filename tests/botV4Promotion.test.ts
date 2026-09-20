import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";
import {
  chooseBotBid,
  chooseBotCard,
  chooseV31RulesBaselineBid,
  chooseV31RulesBaselineCard,
} from "@/bots/simpleBot";
import { chooseAdvancedRulesCard } from "@/bots/strategy/advancedRulesCard";
import { createDeck } from "@/engine/cards";
import { createInitialGame, makeBid } from "@/engine/game";
import type { BidValue, Card, ContractMode, GameState, PlayerId } from "@/engine/types";
import type { RoomPlayerRow } from "@/lib/roomTypes";
import { fillEmptySeatsWithOfficialBots } from "@/lib/server/multiplayerService";
import { applySingleBotTurn } from "@/lib/server/multiplayerGame";
import {
  ADVANCED_RULES_STRATEGY,
  chooseStrategyBid,
  chooseStrategyCard,
  findBotStrategy,
  OFFICIAL_RULES_BASELINE_STRATEGY,
} from "@/simulation/botRegistry";
import { createTestRuleset } from "@/tests/helpers/rulesets";

const card = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });
const SA: ContractMode = { kind: "no-trump" };
const TA: ContractMode = { kind: "all-trump" };

function sameCard(first: Card, second: Card): boolean {
  return first.rank === second.rank && first.suit === second.suit;
}

function biddingState(
  playerId: PlayerId,
  hand: Card[],
  options: { sa?: boolean; ta?: boolean; capot?: boolean; generale?: boolean; generaleTA?: boolean } = {},
): GameState {
  const ruleset = createTestRuleset({
    bidding: {
      allowNoTrump: options.sa ?? false,
      allowAllTrump: options.ta ?? false,
      allowCapot: options.capot ?? true,
      allowGenerale: options.generale ?? false,
      generaleAllowAllTrump: options.generaleTA ?? false,
    },
  });
  const state = createInitialGame(() => 0.1, { ruleset });
  const remaining = createDeck().filter((candidate) => !hand.some((held) => sameCard(held, candidate)));
  let cursor = 0;
  const hands = { 0: [] as Card[], 1: [] as Card[], 2: [] as Card[], 3: [] as Card[] };
  for (const seat of [0, 1, 2, 3] as PlayerId[]) {
    if (seat === playerId) hands[seat] = [...hand];
    else {
      hands[seat] = remaining.slice(cursor, cursor + 8);
      cursor += 8;
    }
  }
  return { ...state, hands };
}

function opponentBid(hand: Card[], value: BidValue): GameState {
  return makeBid(biddingState(1, hand), 0, { action: "bid", value, trump: "hearts" });
}

function coinchedOwnBid(hand: Card[]): GameState {
  let state = biddingState(2, hand);
  state = makeBid(state, 0, { action: "bid", value: 120, trump: "hearts" });
  return makeBid(state, 1, { action: "coinche" });
}

function playingState(hand: Card[], playerId: PlayerId): GameState {
  let state = biddingState(0, hand);
  state = makeBid(state, 0, { action: "bid", value: 80, trump: "hearts" });
  for (let index = 0; index < 3; index += 1) {
    state = makeBid(state, state.currentPlayerId, { action: "pass" });
  }
  return { ...state, currentPlayerId: playerId, hands: { ...state.hands, [playerId]: hand } };
}

function roomPlayer(seat: RoomPlayerRow["seat_index"], kind: RoomPlayerRow["kind"]): RoomPlayerRow {
  return {
    id: `player-${seat}`,
    room_id: "room-1",
    seat_index: seat,
    kind,
    user_id: kind === "human" ? "user-1" : null,
    bot_profile_id: null,
    display_name: kind === "human" ? "Antonin" : null,
    is_ready: kind === "human",
    is_connected: kind === "human",
    bot_takeover: false,
    last_seen_at: null,
    joined_at: null,
    left_at: null,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
  };
}

describe("advanced rules V4 product promotion", () => {
  it("uses the stable active V4 registry entry while retaining rollback and benchmark IDs", () => {
    expect(OFFICIAL_BOT_PROFILE_ID).toBe("advanced_rules_v4");
    expect(findBotStrategy(OFFICIAL_BOT_PROFILE_ID)).toMatchObject({
      status: "active",
      bidding: { kind: "advanced-rules" },
      card: { kind: "advanced-rules" },
    });
    expect(findBotStrategy("advanced_rules_v4_experimental").status).toBe("experimental");
    expect(findBotStrategy("human_doctrine_v3_1_conversation_mc_v1")).toMatchObject({
      status: "active",
      bidding: { kind: "human-doctrine-v3-1" },
      card: { kind: "monte-carlo-v1" },
    });
  });

  it("keeps the historical benchmark baseline independent from the V4 product router", () => {
    const perfectSuit = [card("J", "clubs"), card("9", "clubs"), card("A", "clubs"), card("10", "clubs"),
      card("K", "clubs"), card("A", "diamonds"), card("A", "hearts"), card("A", "spades")];
    const state = biddingState(0, perfectSuit);
    const product = chooseBotBid(state);
    const candidate = chooseStrategyBid(state, ADVANCED_RULES_STRATEGY);
    const baseline = chooseStrategyBid(state, OFFICIAL_RULES_BASELINE_STRATEGY);

    expect(OFFICIAL_BOT_PROFILE_ID).toBe("advanced_rules_v4");
    expect(ADVANCED_RULES_STRATEGY.id).toBe("advanced_rules_v4_experimental");
    expect(product).toMatchObject({ action: "capot" });
    expect(candidate).toEqual(product);
    expect(baseline).toEqual(chooseV31RulesBaselineBid(state));
    expect(baseline.action).not.toBe("capot");
    expect(baseline).not.toEqual(product);

    const cardState = playingState(perfectSuit, 0);
    expect(chooseStrategyCard(cardState, OFFICIAL_RULES_BASELINE_STRATEGY))
      .toEqual(chooseV31RulesBaselineCard(cardState));
  });

  it("routes product bids through V4 for No Trump and All Trump", () => {
    const strongSA = [card("A", "clubs"), card("10", "clubs"), card("A", "diamonds"), card("10", "diamonds"),
      card("A", "hearts"), card("K", "hearts"), card("A", "spades"), card("10", "spades")];
    const strongTA = [card("J", "clubs"), card("9", "clubs"), card("J", "diamonds"), card("9", "diamonds"),
      card("J", "hearts"), card("A", "hearts"), card("J", "spades"), card("9", "spades")];
    expect(chooseBotBid(biddingState(0, strongSA, { sa: true, capot: false })))
      .toMatchObject({ action: "bid", contractMode: SA });
    expect(chooseBotBid(biddingState(0, strongTA, { ta: true, capot: false })))
      .toMatchObject({ action: "bid", contractMode: TA });
  });

  it("preserves Capot and Générale as distinct product actions", () => {
    const perfectSuit = [card("J", "clubs"), card("9", "clubs"), card("A", "clubs"), card("10", "clubs"),
      card("K", "clubs"), card("A", "diamonds"), card("A", "hearts"), card("A", "spades")];
    expect(chooseBotBid(biddingState(0, perfectSuit))).toMatchObject({
      action: "capot", contractMode: { kind: "suit", suit: "clubs" },
    });
    expect(chooseBotBid(biddingState(0, perfectSuit, { generale: true }))).toMatchObject({
      action: "generale", contractMode: { kind: "suit", suit: "clubs" },
    });

    const botSeats = [0, 1, 2, 3].map((seat) => roomPlayer(seat as RoomPlayerRow["seat_index"], "bot"));
    const capotState = applySingleBotTurn(biddingState(0, perfectSuit), botSeats);
    const generaleState = applySingleBotTurn(biddingState(0, perfectSuit, { generale: true }), botSeats);
    expect(capotState.bids[0]).toMatchObject({ action: "capot", contractMode: { kind: "suit", suit: "clubs" } });
    expect(generaleState.bids[0]).toMatchObject({ action: "generale", contractMode: { kind: "suit", suit: "clubs" } });
  });

  it("preserves V4 Coinche and Surcoinche decisions in the product route", () => {
    const defense = [card("J", "hearts"), card("9", "hearts"), card("A", "clubs"), card("10", "clubs"),
      card("A", "diamonds"), card("10", "diamonds"), card("A", "spades"), card("10", "spades")];
    const taker = [card("J", "hearts"), card("9", "hearts"), card("A", "hearts"), card("10", "hearts"),
      card("K", "hearts"), card("A", "clubs"), card("A", "diamonds"), card("A", "spades")];
    expect(chooseBotBid(opponentBid(defense, 140))).toEqual({ action: "coinche" });
    expect(chooseBotBid(coinchedOwnBid(taker))).toEqual({ action: "surcoinche" });
  });

  it("uses V4 card play for a defensive lead", () => {
    const hand = [card("J", "hearts"), card("9", "hearts"), card("A", "clubs"), card("7", "clubs"),
      card("K", "diamonds"), card("7", "diamonds"), card("8", "spades"), card("7", "spades")];
    const state = playingState(hand, 1);
    const choice = chooseBotCard(state);
    expect(choice).toEqual(chooseAdvancedRulesCard(state));
    expect(choice.suit).not.toBe("hearts");
  });

  it("assigns the stable V4 ID to newly created multiplayer bots", () => {
    const players = [roomPlayer(0, "human"), roomPlayer(1, "empty"), roomPlayer(2, "empty"), roomPlayer(3, "empty")];
    const filled = fillEmptySeatsWithOfficialBots(players, "2026-09-20T12:00:00.000Z");
    expect(filled.filter((player) => player.kind === "bot")).toHaveLength(3);
    expect(filled.filter((player) => player.kind === "bot").every(
      (player) => player.bot_profile_id === "advanced_rules_v4",
    )).toBe(true);
  });
});

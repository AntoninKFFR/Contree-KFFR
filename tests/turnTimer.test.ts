import { describe, expect, it } from "vitest";
import { createInitialGame, startNextRound } from "@/engine/game";
import { getLegalCards } from "@/engine/rules";
import type { Card, GameState } from "@/engine/types";
import {
  MULTIPLAYER_TICK_INTERVAL_MS, MULTIPLAYER_TURN_TIMEOUT_MS,
  isTurnDeadlineExpired, turnDeadlineForState,
} from "@/lib/multiplayerTurnTimer";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import {
  applyBotTurns, applyTimedOutTurn, applyTimedOutTurnIfExpired, requireVersion,
} from "@/lib/server/multiplayerGame";

const NOW_MS = Date.parse("2026-09-09T12:00:00.000Z");

function card(rank: Card["rank"], suit: Card["suit"]): Card { return { rank, suit }; }

function players(): RoomPlayerRow[] {
  return [0, 1, 2, 3].map((seat) => ({
    id: `seat-${seat}`, room_id: "room", seat_index: seat as 0 | 1 | 2 | 3,
    kind: "human", user_id: `user-${seat}`, bot_profile_id: null, display_name: `P${seat}`,
    is_ready: true, is_connected: true, bot_takeover: false, last_seen_at: null,
    joined_at: null, left_at: null, created_at: "", updated_at: "",
  }));
}

function room(deadline: string | null, version = 31): RoomRow {
  return {
    id: "room", code: "ABC123", status: "playing", host_user_id: "user-0",
    scoring_mode: "made-points", target_score: 1000, game_phase: "bidding",
    state_version: version, turn_deadline_at: deadline, created_at: "", updated_at: "",
    started_at: "", finished_at: null,
  };
}

function playingState(): GameState {
  return {
    ...createInitialGame(() => 0.1), phase: "playing", trump: "hearts", currentPlayerId: 0,
    hands: {
      0: [card("A", "clubs"), card("7", "hearts")], 1: [card("7", "clubs")],
      2: [card("8", "clubs")], 3: [card("9", "clubs")],
    },
    currentTrick: { leaderId: 1, cards: [{ playerId: 1, card: card("K", "clubs") }] },
    bids: [{ playerId: 1, action: "bid", value: 80, trump: "hearts" }],
    contract: { playerId: 1, teamId: 1, value: 80, trump: "hearts", status: "normal" },
  };
}

describe("server-authoritative multiplayer turn timer", () => {
  it("uses a centralized 45-second timeout and a four-second tick", () => {
    expect(MULTIPLAYER_TURN_TIMEOUT_MS).toBe(45_000);
    expect(MULTIPLAYER_TICK_INTERVAL_MS).toBe(4_000);
  });

  it("creates an absolute deadline when a human decision is expected", () => {
    expect(turnDeadlineForState(createInitialGame(() => 0.1), players(), NOW_MS))
      .toBe("2026-09-09T12:00:45.000Z");
  });

  it("does not create an intermediate bot deadline and targets the next human", () => {
    const currentPlayers = players();
    currentPlayers[0] = {
      ...currentPlayers[0], kind: "bot", user_id: null, bot_profile_id: "simple",
    };
    const initial = createInitialGame(() => 0.1);
    expect(turnDeadlineForState(initial, currentPlayers, NOW_MS)).toBeNull();
    const afterBots = applyBotTurns(initial, currentPlayers);
    expect(afterBots.currentPlayerId).toBe(1);
    expect(turnDeadlineForState(afterBots, currentPlayers, NOW_MS)).not.toBeNull();
  });

  it("passes automatically when a bidding deadline expires", () => {
    const next = applyTimedOutTurn(createInitialGame(() => 0.1), players());
    expect(next.bids[0]).toMatchObject({ playerId: 0, action: "pass" });
    expect(next.currentPlayerId).toBe(1);
  });

  it("plays a legal card when a playing deadline expires", () => {
    const initial = playingState();
    const legalCards = getLegalCards(initial.hands[0], initial.currentTrick, 0, "hearts");
    const next = applyTimedOutTurn(initial, players());
    const played = next.currentTrick.cards.find((entry) => entry.playerId === 0)?.card;
    expect(legalCards).toContainEqual(played);
    expect(next.hands[0]).toHaveLength(initial.hands[0].length - 1);
  });

  it("leaves the timed-out player a human with the same identity", () => {
    const currentPlayers = players();
    const originalPlayers = structuredClone(currentPlayers);
    applyTimedOutTurn(createInitialGame(() => 0.1), currentPlayers);
    expect(currentPlayers).toEqual(originalPlayers);
    expect(currentPlayers[0]).toMatchObject({
      kind: "human", user_id: "user-0", display_name: "P0", bot_takeover: false,
    });
  });

  it("calculates a fresh deadline for the next human after timeout", () => {
    const next = applyTimedOutTurn(createInitialGame(() => 0.1), players());
    expect(turnDeadlineForState(next, players(), NOW_MS + 45_000))
      .toBe("2026-09-09T12:01:30.000Z");
  });

  it("detects an early tick without mutating room version or game state", () => {
    const currentRoom = room("2026-09-09T12:00:01.000Z");
    const state = createInitialGame(() => 0.1);
    const originalState = structuredClone(state);
    expect(isTurnDeadlineExpired(currentRoom, NOW_MS)).toBe(false);
    expect(applyTimedOutTurnIfExpired(currentRoom, state, players(), NOW_MS)).toBeNull();
    expect(currentRoom.state_version).toBe(31);
    expect(state).toEqual(originalState);
  });

  it("uses the version gate to arbitrate a human action racing the timeout", () => {
    expect(isTurnDeadlineExpired(room("2026-09-09T11:59:59.000Z"), NOW_MS)).toBe(true);
    expect(() => requireVersion(room(null, 32), 31)).toThrow("La partie a changé");
  });

  it("rejects the stale version shared by a second concurrent tick", () => {
    expect(() => requireVersion(room(null, 32), 31)).toThrow("La partie a changé");
  });

  it("has no deadline at the end of a round or game", () => {
    const initial = createInitialGame(() => 0.1);
    expect(turnDeadlineForState({ ...initial, phase: "finished" }, players(), NOW_MS)).toBeNull();
    expect(turnDeadlineForState({ ...initial, phase: "game-over" }, players(), NOW_MS)).toBeNull();
  });

  it("creates a new deadline when the next round reaches a human", () => {
    const finished = { ...createInitialGame(() => 0.1), phase: "finished" as const };
    const next = startNextRound(finished, () => 0.1);
    expect(turnDeadlineForState(next, players(), NOW_MS)).not.toBeNull();
  });

  it("keeps takeover independent and resumes the timer at the next human", () => {
    const currentPlayers = players();
    currentPlayers[0] = { ...currentPlayers[0], bot_takeover: true };
    const initial = createInitialGame(() => 0.1);
    expect(turnDeadlineForState(initial, currentPlayers, NOW_MS)).toBeNull();
    const afterTakeover = applyBotTurns(initial, currentPlayers);
    expect(afterTakeover.currentPlayerId).toBe(1);
    expect(turnDeadlineForState(afterTakeover, currentPlayers, NOW_MS)).not.toBeNull();
  });
});

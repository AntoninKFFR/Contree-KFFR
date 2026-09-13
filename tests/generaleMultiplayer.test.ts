import { describe, expect, it, vi } from "vitest";
import { createInitialGame, makeBid } from "@/engine/game";
import { createTestRuleset } from "@/tests/helpers/rulesets";
import type { Card, GameState } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { applyAuthorizedAction, prepareRoomRulesUpdate } from "@/lib/server/multiplayerGame";
import { parseRoomIntent } from "@/lib/server/roomIntentValidation";
import { parseServerGameState } from "@/lib/server/gameStateValidation";
import { turnDeadlineForState } from "@/lib/multiplayerTurnTimer";
import { toPlayerGameView } from "@/engine/views";

vi.mock("server-only", () => ({}));

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });
const rules = createTestRuleset({ bidding: { allowGenerale: true } });
const room: RoomRow = { id: "room", code: "GEN001", status: "playing", host_user_id: "user-0", active_game_id: "game", scoring_mode: "ffb", target_score: 1000, game_phase: "playing", state_version: 4, turn_deadline_at: null, created_at: "", updated_at: "", started_at: "", finished_at: null };
const players: RoomPlayerRow[] = [0, 1, 2, 3].map((seat) => ({ id: `p${seat}`, room_id: "room", seat_index: seat as 0 | 1 | 2 | 3, kind: "human", user_id: `user-${seat}`, bot_profile_id: null, display_name: `P${seat}`, is_ready: true, is_connected: true, bot_takeover: false, last_seen_at: null, joined_at: "", left_at: null, created_at: "", updated_at: "" }));

function generaleState(): GameState {
  let state = createInitialGame(() => 0, { ruleset: rules });
  state = makeBid(state, 0, { action: "generale", trump: "clubs" });
  state = makeBid(state, 1, { action: "pass" });
  state = makeBid(state, 2, { action: "pass" });
  return makeBid(state, 3, { action: "pass" });
}

describe("server-authoritative multiplayer Générale", () => {
  it("accepts the explicit API action but rejects it from an OFF ruleset", () => {
    expect(parseRoomIntent({ type: "game-action", action: { type: "generale", trump: "clubs" } })).toEqual({ type: "game-action", action: { type: "generale", trump: "clubs" } });
    const biddingRoom = { ...room, game_phase: "bidding" as const };
    expect(() => applyAuthorizedAction({ room: biddingRoom, players, state: createInitialGame(() => 0), userId: "user-0", expectedVersion: 4, action: { type: "generale", trump: "clubs" } })).toThrow(/not allowed/);
  });

  it("accepts a valid Générale with a room snapshot that enables it", () => {
    const state = createInitialGame(() => 0, { ruleset: rules });
    const next = applyAuthorizedAction({ room: { ...room, game_phase: "bidding" }, players, state, userId: "user-0", expectedVersion: 4, action: { type: "generale", trump: "clubs" } });
    expect(next.bids[0]).toMatchObject({ action: "generale", playerId: 0, value: 500 });
  });

  it("rejects a forged play-card from the seated partner", () => {
    const state = { ...generaleState(), currentPlayerId: 2 as const };
    expect(() => applyAuthorizedAction({ room, players, state, userId: "user-2", expectedVersion: 4, action: { type: "play-card", card: state.hands[2][0] } })).toThrow(/inactive partner/);
  });

  it("advances from player 1 directly to player 3", () => {
    const base = generaleState();
    const state = { ...base, currentPlayerId: 1 as const, currentTrick: { leaderId: 0 as const, cards: [{ playerId: 0 as const, card: c("7", "clubs") }] }, hands: { ...base.hands, 0: base.hands[0].filter((card) => !(card.rank === "7" && card.suit === "clubs")) } };
    const card = state.hands[1].find((item) => item.suit === "clubs") ?? state.hands[1][0];
    const next = applyAuthorizedAction({ room, players, state, userId: "user-1", expectedVersion: 4, action: { type: "play-card", card } });
    expect(next.currentPlayerId).toBe(3);
  });

  it("never creates a deadline for the inactive partner", () => {
    expect(turnDeadlineForState({ ...generaleState(), currentPlayerId: 2 }, players, 0)).toBeNull();
  });

  it("reconstructs announcer, inactive seat and flow after reconnect", () => {
    const restored = parseServerGameState(structuredClone(generaleState()));
    expect(restored.contract).toMatchObject({ kind: "generale", playerId: 0 });
    expect(toPlayerGameView(restored, 1).inactivePlayerId).toBe(2);
    expect(restored.currentPlayerId).toBe(0);
  });

  it("keeps all other hands private in PlayerGameView", () => {
    const view = toPlayerGameView(generaleState(), 2);
    expect(view.inactivePlayerId).toBe(2);
    expect(view.hand).toHaveLength(8);
    expect("hands" in view).toBe(false);
  });

  it("saves Générale in custom room rules", () => {
    const prepared = prepareRoomRulesUpdate({ room: { ...room, status: "lobby", game_phase: null }, players, userId: "user-0", rules: { presetId: "contree-kffr", overrides: { bidding: { allowGenerale: true } } } });
    expect(prepared.ruleset.bidding.allowGenerale).toBe(true);
    expect(prepared.ruleset.scoring.generaleBasePoints).toBe(500);
  });
});

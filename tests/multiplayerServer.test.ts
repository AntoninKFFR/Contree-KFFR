import { describe, expect, it, vi } from "vitest";
import { createInitialGame, playCard } from "@/engine/game";
import { createGameSettings } from "@/engine/rulesets/resolve";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import type { Card, GameState } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import {
  applyAuthorizedAction, applyBotTurns, enableBotTakeover, joinLobbySeat, requireHost,
  requireLobbySeatChange, requireVersion, resetRoomPlayers, setLobbyReady, viewerSeatIndex,
} from "@/lib/server/multiplayerGame";
import { parseRoomIntent } from "@/lib/server/roomIntentValidation";
import {
  createTestRuleset,
  mustTrumpBehindPartnerVariant,
  relaxedFollowSuitVariant,
} from "@/tests/helpers/rulesets";

vi.mock("server-only", () => ({}));

function card(rank: Card["rank"], suit: Card["suit"]): Card { return { rank, suit }; }

const room: RoomRow = {
  id: "room", code: "ABC123", status: "playing", host_user_id: "host", active_game_id: "game-1",
  scoring_mode: "made-points", target_score: 1000, game_phase: "bidding", state_version: 8,
  turn_deadline_at: null,
  created_at: "", updated_at: "", started_at: "", finished_at: null,
};

function players(kinds: Array<"human" | "bot"> = ["human", "human", "human", "human"]): RoomPlayerRow[] {
  return kinds.map((kind, seat) => ({
    id: `seat-${seat}`, room_id: room.id, seat_index: seat as 0 | 1 | 2 | 3, kind,
    user_id: kind === "human" ? (seat === 0 ? "host" : `user-${seat}`) : null,
    bot_profile_id: kind === "bot" ? "simple" : null, display_name: `P${seat}`,
    is_ready: true, is_connected: true, bot_takeover: false, last_seen_at: null,
    joined_at: null, left_at: null,
    created_at: "", updated_at: "",
  }));
}

function lobbyPlayers(): RoomPlayerRow[] {
  return [0, 1, 2, 3].map((seat) => ({
    id: `seat-${seat}`, room_id: room.id, seat_index: seat as 0 | 1 | 2 | 3,
    kind: seat === 0 ? "human" : "empty", user_id: seat === 0 ? "host" : null,
    bot_profile_id: null, display_name: seat === 0 ? "Host" : null,
    is_ready: false, is_connected: seat === 0, bot_takeover: false, last_seen_at: null, joined_at: null,
    left_at: null, created_at: "", updated_at: "",
  }));
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

describe("server-authoritative multiplayer", () => {
  it("validates capot at the server boundary and rejects an invalid trump", () => {
    expect(parseRoomIntent({
      type: "game-action", action: { type: "capot", trump: "hearts" },
    })).toEqual({ type: "game-action", action: { type: "capot", trump: "hearts" } });
    expect(() => parseRoomIntent({
      type: "game-action", action: { type: "capot", trump: "stars" },
    })).toThrow("invalide");
  });

  it("accepts a legal capot action through the authoritative action path", () => {
    const next = applyAuthorizedAction({
      room,
      players: players(),
      state: createInitialGame(() => 0.1),
      userId: "host",
      expectedVersion: 8,
      action: { type: "capot", trump: "spades" },
    });
    expect(next.bids).toEqual([{ playerId: 0, action: "capot", trump: "spades" }]);
  });

  it("rejects a forged no-trump contract when the room rules disable it", () => {
    expect(() => applyAuthorizedAction({ room, players: players(), state: createInitialGame(() => 0.1), userId: "host", expectedVersion: 8, action: { type: "bid", value: 80, contractMode: { kind: "no-trump" } } })).toThrow("not allowed");
  });

  it("accepts no-trump through the authoritative path when enabled", () => {
    const special = createTestRuleset({ bidding: { ...CONTREE_KFFR_RULESET.bidding, allowNoTrump: true } });
    const state = createInitialGame(() => 0.1, { ruleset: special });
    expect(applyAuthorizedAction({ room, players: players(), state, userId: "host", expectedVersion: 8, action: { type: "bid", value: 80, contractMode: { kind: "no-trump" } } }).bids[0]).toMatchObject({ contractMode: { kind: "no-trump" } });
  });

  it("rejects a forged all-trump contract when the room rules disable it", () => {
    expect(() => applyAuthorizedAction({ room, players: players(), state: createInitialGame(() => 0.1), userId: "host", expectedVersion: 8, action: { type: "bid", value: 80, contractMode: { kind: "all-trump" } } })).toThrow("not allowed");
  });

  it("rejects an action from a seated player outside their turn", () => {
    const state = createInitialGame(() => 0.1);
    expect(() => applyAuthorizedAction({ room, players: players(), state, userId: "user-1", expectedVersion: 8, action: { type: "pass" } }))
      .toThrow("Ce n'est pas ton tour");
  });

  it("rejects a user who is not a room member", () => {
    expect(() => applyAuthorizedAction({ room, players: players(), state: createInitialGame(() => 0.1), userId: "intruder", expectedVersion: 8, action: { type: "pass" } }))
      .toThrow("Tu ne fais pas partie");
  });

  it("protects host-only start and reset operations", () => {
    expect(() => requireHost(room, "user-1")).toThrow("Seul l'hôte");
    expect(() => requireHost(room, "host")).not.toThrow();
  });

  it("rejects a forged card absent from the player's hand", () => {
    expect(() => applyAuthorizedAction({ room: { ...room, game_phase: "playing" }, players: players(), state: playingState(), userId: "host", expectedVersion: 8, action: { type: "play-card", card: card("A", "spades") } }))
      .toThrow("does not have");
  });

  it("rejects a card that violates follow-suit rules", () => {
    expect(() => applyAuthorizedAction({ room: { ...room, game_phase: "playing" }, players: players(), state: playingState(), userId: "host", expectedVersion: 8, action: { type: "play-card", card: card("7", "hearts") } }))
      .toThrow("not legal");
  });

  it("accepts through the server a discard made legal by the room snapshot", () => {
    const state = {
      ...playingState(),
      settings: createGameSettings({ ruleset: relaxedFollowSuitVariant }),
    };
    const next = applyAuthorizedAction({
      room: { ...room, game_phase: "playing" },
      players: players(),
      state,
      userId: "host",
      expectedVersion: 8,
      action: { type: "play-card", card: card("7", "hearts") },
    });

    expect(next.hands[0]).toEqual([card("A", "clubs")]);
    expect(next.settings.ruleset?.id).toBe(relaxedFollowSuitVariant.id);
  });

  it("rejects a forged discard when the snapshot requires trump behind the partner", () => {
    const state: GameState = {
      ...playingState(),
      settings: createGameSettings({ ruleset: mustTrumpBehindPartnerVariant }),
      hands: {
        ...playingState().hands,
        0: [card("7", "diamonds"), card("A", "hearts")],
      },
      currentTrick: {
        leaderId: 2,
        cards: [{ playerId: 2, card: card("A", "clubs") }],
      },
    };

    expect(() => applyAuthorizedAction({
      room: { ...room, game_phase: "playing" },
      players: players(),
      state,
      userId: "host",
      expectedVersion: 8,
      action: { type: "play-card", card: card("7", "diamonds") },
    })).toThrow("not legal");
  });

  it("uses the same no-card-announcement engine rules as solo play", () => {
    const state: GameState = {
      ...playingState(),
      announcements: {
        declarations: [{
          playerId: 0, teamId: 0, type: "tierce", value: 20, suit: "clubs", highestRank: "A",
        }],
        declaredPlayerIds: [0],
        winningTeam: 0,
        pointsByTeam: { 0: 20, 1: 0 },
      },
    };
    const selected = card("A", "clubs");
    const direct = playCard(state, 0, selected);
    const multiplayer = applyAuthorizedAction({
      room: { ...room, game_phase: "playing" },
      players: players(),
      state,
      userId: "host",
      expectedVersion: 8,
      action: { type: "play-card", card: selected },
    });

    expect(multiplayer).toEqual(direct);
    expect(multiplayer.announcements).toEqual({
      declarations: [], declaredPlayerIds: [], winningTeam: null, pointsByTeam: { 0: 0, 1: 0 },
    });
  });

  it("uses the GameState ruleset as the sole authority for multiplayer announcements", () => {
    const rules = createTestRuleset({ announcements: { enabled: true, tierce: true } });
    const state: GameState = {
      ...playingState(),
      settings: createGameSettings({ ruleset: rules }),
      hands: {
        ...playingState().hands,
        0: [card("7", "clubs"), card("8", "clubs"), card("9", "clubs")],
      },
    };
    const multiplayer = applyAuthorizedAction({
      room: { ...room, game_phase: "playing" },
      players: players(),
      state,
      userId: "host",
      expectedVersion: 8,
      action: { type: "play-card", card: card("7", "clubs") },
    });

    expect(multiplayer.settings.ruleset?.id).toBe(rules.id);
    expect(multiplayer.announcements).toMatchObject({
      declarations: [{ playerId: 0, teamId: 0, type: "tierce", value: 20 }],
      declaredPlayerIds: [0],
    });
  });

  it("rejects stale expectedVersion values as conflicts", () => {
    expect(() => requireVersion(room, 7)).toThrow("La partie a changé");
  });

  it("runs consecutive bot turns on the server after a human action", () => {
    const next = applyAuthorizedAction({ room, players: players(["human", "bot", "bot", "bot"]), state: createInitialGame(() => 0.1), userId: "host", expectedVersion: 8, action: { type: "pass" } });
    expect(next.bids.length).toBeGreaterThan(1);
    expect(next.phase === "finished" || next.currentPlayerId === 0).toBe(true);
  });

  it("lets the host enable takeover while preserving the human seat identity", () => {
    requireHost(room, "host");
    const current = players();
    current[2] = {
      ...current[2], is_connected: false, last_seen_at: "2026-09-08T23:58:00.000Z",
    };
    const next = enableBotTakeover(current, 2, Date.parse("2026-09-09T00:00:00.000Z"));
    expect(next[2]).toMatchObject({
      bot_takeover: true, kind: "human", user_id: "user-2", display_name: "P2", seat_index: 2,
    });
  });

  it("does not let a non-host authorize takeover", () => {
    expect(() => requireHost(room, "user-2")).toThrow("Seul l'hôte");
  });

  it("rejects takeover for a connected human", () => {
    const current = players();
    current[2] = { ...current[2], last_seen_at: "2026-09-08T23:59:30.000Z" };
    expect(() => enableBotTakeover(current, 2, Date.parse("2026-09-09T00:00:00.000Z")))
      .toThrow("encore en ligne");
  });

  it("automates a takeover seat immediately when it is already their turn", () => {
    const current = players();
    current[2] = { ...current[2], bot_takeover: true, is_connected: false };
    const initial = { ...createInitialGame(() => 0.1), currentPlayerId: 2 as const };
    const next = applyBotTurns(initial, current);
    expect(next.bids.length).toBeGreaterThan(0);
    expect(next.currentPlayerId).not.toBe(2);
  });

  it("uses the existing bot strategy when play reaches a takeover seat", () => {
    const current = players();
    current[1] = { ...current[1], bot_takeover: true, is_connected: false };
    const next = applyAuthorizedAction({
      room, players: current, state: createInitialGame(() => 0.1), userId: "host",
      expectedVersion: 8, action: { type: "pass" },
    });
    expect(next.bids).toHaveLength(2);
    expect(next.bids[1]?.playerId).toBe(1);
    expect(next.currentPlayerId).toBe(2);
  });

  it("rejects direct human actions while takeover is active", () => {
    const current = players();
    current[0] = { ...current[0], bot_takeover: true };
    expect(() => applyAuthorizedAction({
      room, players: current, state: createInitialGame(() => 0.1), userId: "host",
      expectedVersion: 8, action: { type: "pass" },
    })).toThrow("temporairement contrôlé");
  });

  it("clears every takeover when the room is reset", () => {
    const current = players(["human", "bot", "human", "bot"]);
    current[0] = { ...current[0], bot_takeover: true };
    current[2] = { ...current[2], bot_takeover: true };
    const reset = resetRoomPlayers(current);
    expect(reset.every((player) => !player.bot_takeover)).toBe(true);
    expect(reset[0]).toMatchObject({ kind: "human", user_id: "host" });
    expect(reset[1]).toMatchObject({ kind: "empty", user_id: null });
  });

  it("uses state_version to reject a concurrent stale takeover", () => {
    expect(() => requireVersion({ ...room, state_version: 9 }, 8)).toThrow("La partie a changé");
  });

  it("lets a non-seated user join a free seat and exposes their viewer seat", () => {
    const joined = joinLobbySeat({
      players: lobbyPlayers(), userId: "guest", seatIndex: 2, displayName: "Guest", now: "now",
    });
    expect(joined[2]).toMatchObject({ kind: "human", user_id: "guest", display_name: "Guest" });
    expect(viewerSeatIndex(joined, "guest")).toBe(2);
  });

  it("frees the previous seat when a user moves", () => {
    const seated = joinLobbySeat({
      players: lobbyPlayers(), userId: "guest", seatIndex: 1, displayName: "Guest", now: "first",
    });
    const moved = joinLobbySeat({
      players: seated, userId: "guest", seatIndex: 3, displayName: "Guest", now: "second",
    });
    expect(moved[1]).toMatchObject({ kind: "empty", user_id: null, display_name: null });
    expect(moved[3]).toMatchObject({ kind: "human", user_id: "guest" });
    expect(moved.filter((player) => player.user_id === "guest")).toHaveLength(1);
    expect(new Set(moved.map((player) => player.seat_index)).size).toBe(4);
    expect(viewerSeatIndex(moved, "guest")).toBe(3);
  });

  it("prevents two users from taking the same seat", () => {
    const first = joinLobbySeat({
      players: lobbyPlayers(), userId: "guest-a", seatIndex: 1, displayName: "A", now: "now",
    });
    expect(() => joinLobbySeat({
      players: first, userId: "guest-b", seatIndex: 1, displayName: "B", now: "now",
    })).toThrow("Cette place n'est plus libre");
  });

  it("allows a newly seated player to become ready", () => {
    const joined = joinLobbySeat({
      players: lobbyPlayers(), userId: "guest", seatIndex: 2, displayName: "Guest", now: "joined",
    });
    const ready = setLobbyReady(joined, "guest", true, "ready");
    expect(ready[2]).toMatchObject({ is_ready: true, last_seen_at: "ready" });
  });

  it("treats clicking the current user's own seat as an idempotent operation", () => {
    const joined = joinLobbySeat({
      players: lobbyPlayers(), userId: "guest", seatIndex: 2, displayName: "Guest", now: "joined",
    });
    expect(joinLobbySeat({
      players: joined, userId: "guest", seatIndex: 2, displayName: "Guest", now: "again",
    })).toBe(joined);
  });

  it("resets ready when a ready player moves to another free seat", () => {
    const joined = joinLobbySeat({
      players: lobbyPlayers(), userId: "guest", seatIndex: 1, displayName: "Guest", now: "joined",
    });
    const ready = setLobbyReady(joined, "guest", true, "ready");
    const moved = joinLobbySeat({
      players: ready, userId: "guest", seatIndex: 3, displayName: "Guest", now: "moved",
    });
    expect(moved[1]).toMatchObject({ kind: "empty", user_id: null, is_ready: false });
    expect(moved[3]).toMatchObject({ kind: "human", user_id: "guest", is_ready: false });
  });

  it("rejects seat changes once the game has started", () => {
    expect(() => requireLobbySeatChange({ ...room, status: "playing" })).toThrow(
      "n'accepte plus de joueurs",
    );
    expect(() => requireLobbySeatChange({ ...room, status: "lobby" })).not.toThrow();
  });
});

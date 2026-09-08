import { describe, expect, it } from "vitest";
import { createInitialGame } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { applyAuthorizedAction, requireHost, requireVersion } from "@/lib/server/multiplayerGame";

function card(rank: Card["rank"], suit: Card["suit"]): Card { return { rank, suit }; }

const room: RoomRow = {
  id: "room", code: "ABC123", status: "playing", host_user_id: "host",
  scoring_mode: "made-points", target_score: 1000, game_phase: "bidding", state_version: 8,
  created_at: "", updated_at: "", started_at: "", finished_at: null,
};

function players(kinds: Array<"human" | "bot"> = ["human", "human", "human", "human"]): RoomPlayerRow[] {
  return kinds.map((kind, seat) => ({
    id: `seat-${seat}`, room_id: room.id, seat_index: seat as 0 | 1 | 2 | 3, kind,
    user_id: kind === "human" ? (seat === 0 ? "host" : `user-${seat}`) : null,
    bot_profile_id: kind === "bot" ? "simple" : null, display_name: `P${seat}`,
    is_ready: true, is_connected: true, last_seen_at: null, joined_at: null, left_at: null,
    created_at: "", updated_at: "",
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

  it("rejects stale expectedVersion values as conflicts", () => {
    expect(() => requireVersion(room, 7)).toThrow("La partie a changé");
  });

  it("runs consecutive bot turns on the server after a human action", () => {
    const next = applyAuthorizedAction({ room, players: players(["human", "bot", "bot", "bot"]), state: createInitialGame(() => 0.1), userId: "host", expectedVersion: 8, action: { type: "pass" } });
    expect(next.bids.length).toBeGreaterThan(1);
    expect(next.phase === "finished" || next.currentPlayerId === 0).toBe(true);
  });
});

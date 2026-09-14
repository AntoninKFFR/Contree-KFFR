import { describe, expect, it, vi } from "vitest";
import { createInitialGame, makeBid } from "@/engine/game";
import type { GameState } from "@/engine/types";
import { parseServerGameState } from "@/lib/server/gameStateValidation";
import { createTestRuleset } from "@/tests/helpers/rulesets";

vi.mock("server-only", () => ({}));

function clone(state: GameState): GameState {
  return structuredClone(state);
}

describe("authoritative stored GameState validation", () => {
  it("rejects a card duplicated across hands", () => {
    const state = clone(createInitialGame(() => 0.1));
    state.hands[1][0] = { ...state.hands[0][0] };
    expect(() => parseServerGameState(state)).toThrow(/duplicated card/i);
  });

  it("rejects a malformed card inside the current trick", () => {
    const state = clone(createInitialGame(() => 0.1)) as unknown as Record<string, unknown>;
    state.currentTrick = { leaderId: 0, cards: [{ playerId: 0, card: { rank: "1", suit: "clubs" } }] };
    expect(() => parseServerGameState(state)).toThrow(/trick/i);
  });

  it("rejects negative or non-finite authoritative scores", () => {
    const negative = clone(createInitialGame(() => 0.1));
    negative.totalScore[0] = -1;
    expect(() => parseServerGameState(negative)).toThrow(/score/i);
    const infinite = clone(createInitialGame(() => 0.1));
    infinite.trickPoints[1] = Number.POSITIVE_INFINITY;
    expect(() => parseServerGameState(infinite)).toThrow(/score/i);
  });

  it("rejects a stored contract mode disabled by its frozen ruleset", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "bid", value: 80, trump: "clubs" });
    state = makeBid(state, 1, { action: "pass" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    const forged = clone(state);
    forged.contract = { ...forged.contract!, trump: undefined, contractMode: { kind: "no-trump" } };
    forged.contractMode = { kind: "no-trump" };
    forged.trump = undefined;
    expect(() => parseServerGameState(forged)).toThrow(/contract mode/i);
  });

  it.each([
    ["unknown kind", { kind: "slam" }],
    ["unknown status", { status: "doubled-again" }],
  ])("rejects a contract with an %s", (_label, mutation) => {
    const state = clone(createInitialGame(() => 0.1)) as unknown as Record<string, unknown>;
    state.contract = {
      playerId: 0,
      teamId: 0,
      kind: "points",
      value: 80,
      trump: "hearts",
      status: "normal",
      ...mutation,
    };
    expect(() => parseServerGameState(state)).toThrow(/contract/i);
  });

  it("rejects contradictory state and contract mode mirrors", () => {
    const rules = createTestRuleset({ bidding: { allowNoTrump: true, allowAllTrump: true } });
    let state = createInitialGame(() => 0.1, { ruleset: rules });
    state = makeBid(state, 0, { action: "bid", value: 80, contractMode: { kind: "no-trump" } });
    state = makeBid(state, 1, { action: "pass" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    const forged = clone(state);
    forged.contractMode = { kind: "all-trump" };
    expect(() => parseServerGameState(forged)).toThrow(/contract mode/i);
  });

  it("rejects a playing state whose current player does not follow the public trick order", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, 0, { action: "bid", value: 80, trump: "clubs" });
    state = makeBid(state, 1, { action: "pass" });
    state = makeBid(state, 2, { action: "pass" });
    state = makeBid(state, 3, { action: "pass" });
    const forged = clone(state);
    forged.currentPlayerId = 2;
    expect(() => parseServerGameState(forged)).toThrow(/current player/i);
  });

  it("continues to normalize a valid legacy state without a ruleset snapshot", () => {
    const legacy = clone(createInitialGame(() => 0.1)) as unknown as Record<string, unknown>;
    delete (legacy.settings as Record<string, unknown>).ruleset;
    expect(parseServerGameState(legacy).settings.ruleset?.id).toBe("contree-kffr");
  });
});

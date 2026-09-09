import { describe, expect, it } from "vitest";
import { createInitialGame, makeBid } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { chooseBiddingV2 } from "@/bots/strategy/biddingStrategyV2";

describe("bidding strategy V2", () => {
  it("returns a legal conservative opening capped at 100", () => {
    const state = createInitialGame(createSeededRandom(120));
    const decision = chooseBiddingV2(state);
    expect(["pass", "bid"]).toContain(decision.action);
    if (decision.action === "bid") expect(decision.value).toBeLessThanOrEqual(100);
  });

  it("does not inspect opponents' hidden hands", () => {
    const state = createInitialGame(createSeededRandom(121));
    const hidden = ([0, 1, 2, 3] as const).filter((id) => id !== state.currentPlayerId);
    const changed = {
      ...state,
      hands: {
        ...state.hands,
        [hidden[0]]: [...state.hands[hidden[1]]],
        [hidden[1]]: [...state.hands[hidden[0]]],
      },
    };
    expect(chooseBiddingV2(state)).toEqual(chooseBiddingV2(changed));
  });

  it("never undercalls an existing opponent contract", () => {
    let state = createInitialGame(createSeededRandom(122));
    state = makeBid(state, state.currentPlayerId, { action: "bid", value: 100, trump: "clubs" });
    const decision = chooseBiddingV2(state);
    expect(decision.action === "bid" ? decision.value! > 100 : true).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { createInitialGame } from "@/engine/game";
import { toPlayerGameView } from "@/engine/views";

describe("player game views", () => {
  it("projects only the viewer hand from the full server state", () => {
    const state = createInitialGame(() => 0.1);
    const view = toPlayerGameView(state, 0);

    expect(view.viewerPlayerId).toBe(0);
    expect(view.hand).toEqual(state.hands[0]);
    expect(view.handCounts).toEqual({
      0: state.hands[0].length,
      1: state.hands[1].length,
      2: state.hands[2].length,
      3: state.hands[3].length,
    });
    expect("hands" in view).toBe(false);
  });

  it("does not expose other players' cards", () => {
    const state = createInitialGame(() => 0.1);
    const view = toPlayerGameView(state, 1);

    expect(view.hand).toEqual(state.hands[1]);
    expect(view.hand).not.toEqual(state.hands[0]);
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.hands[0]));
  });

  it("returns copies instead of sharing mutable hand references", () => {
    const state = createInitialGame(() => 0.1);
    const view = toPlayerGameView(state, 0);

    view.hand.pop();

    expect(view.hand).toHaveLength(7);
    expect(state.hands[0]).toHaveLength(8);
  });
});

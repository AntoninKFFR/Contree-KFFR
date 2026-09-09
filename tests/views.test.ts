import { describe, expect, it } from "vitest";
import { createInitialGame } from "@/engine/game";
import { toPlayerGameView } from "@/engine/views";
import type { GameState } from "@/engine/types";

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
    const view = toPlayerGameView(state, 0);

    expect(view.hand).toEqual(state.hands[0]);
    for (const opponent of [1, 2, 3] as const) {
      expect(view.hand).not.toEqual(state.hands[opponent]);
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.hands[opponent]));
    }
  });

  it("returns copies instead of sharing mutable hand references", () => {
    const state = createInitialGame(() => 0.1);
    const view = toPlayerGameView(state, 0);

    view.hand.pop();

    expect(view.hand).toHaveLength(7);
    expect(state.hands[0]).toHaveLength(8);
  });

  it("exposes only public announcement information before resolution", () => {
    const state: GameState = {
      ...createInitialGame(() => 0.1),
      announcements: {
        declarations: [{
          playerId: 1,
          teamId: 1,
          type: "tierce",
          value: 20,
          suit: "spades",
          highestRank: "A",
        }],
        declaredPlayerIds: [1],
        winningTeam: null,
        pointsByTeam: { 0: 0, 1: 0 },
      },
    };
    const view = toPlayerGameView(state, 0);
    expect(view.announcements?.declarations).toEqual([{
      playerId: 1, teamId: 1, type: "tierce", value: 20,
    }]);
    expect(JSON.stringify(view.announcements)).not.toContain('"highestRank":"A"');
    expect(JSON.stringify(view.announcements)).not.toContain('"suit":"spades"');
  });

  it("reveals resolved winning meld details without exposing any complete hand", () => {
    const state: GameState = {
      ...createInitialGame(() => 0.1),
      announcements: {
        declarations: [
          { playerId: 0, teamId: 0, type: "fifty", value: 50, suit: "clubs", highestRank: "Q" },
          { playerId: 1, teamId: 1, type: "tierce", value: 20, suit: "spades", highestRank: "A" },
        ],
        declaredPlayerIds: [0, 1, 2, 3],
        winningTeam: 0,
        pointsByTeam: { 0: 50, 1: 0 },
      },
    };
    const view = toPlayerGameView(state, 2);
    expect(view.announcements?.declarations[0]).toMatchObject({ suit: "clubs", highestRank: "Q" });
    expect(view.announcements?.declarations[1]).toEqual({
      playerId: 1, teamId: 1, type: "tierce", value: 20,
    });
    expect("hands" in view).toBe(false);
  });
});

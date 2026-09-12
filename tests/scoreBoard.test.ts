import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoreBoard } from "@/components/ScoreBoard";
import { createInitialGame } from "@/engine/game";
import { scoreRound } from "@/engine/scoring";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScoreBoard card-announcement removal", () => {
  it("shows trick and belote points without rendering legacy card announcements", () => {
    vi.stubGlobal("React", React);
    const initial = createInitialGame(() => 0.1);
    const result = scoreRound({
      contract: { playerId: 0, teamId: 0, value: 90, trump: "hearts", status: "normal" },
      settings: initial.settings,
      trickPointsByTeam: { 0: 92, 1: 70 },
      belotePointsByTeam: { 0: 20, 1: 0 },
    });
    const state = {
      ...initial,
      phase: "finished" as const,
      trump: "hearts" as const,
      contract: result.contract,
      result: { ...result, announcementPointsByTeam: { 0: 20, 1: 0 } },
      announcements: {
        declarations: [{
          playerId: 0 as const,
          teamId: 0 as const,
          type: "tierce" as const,
          value: 20 as const,
          suit: "clubs" as const,
          highestRank: "9" as const,
        }],
        declaredPlayerIds: [0 as const],
        winningTeam: 0 as const,
        pointsByTeam: { 0: 20, 1: 0 },
      },
      belote: {
        declaration: { playerId: 0 as const, teamId: 0 as const, firstRank: "Q" as const, completed: true },
        pointsByTeam: { 0: 20, 1: 0 },
      },
    };

    const markup = renderToStaticMarkup(React.createElement(ScoreBoard, { state, showActions: false }));

    expect(markup).toContain("Plis: 92 - 70; belote: 20 - 0.");
    expect(markup).toContain("Belote et rebelote");
    expect(markup).not.toContain("Annonces de cartes");
    expect(markup).not.toContain("annonces:");
    expect(markup).not.toContain("tierce");
  });
});

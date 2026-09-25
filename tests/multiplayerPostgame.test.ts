import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinishedRoomCard } from "@/components/multiplayer/FinishedRoomCard";
import type { FinishedRatingState } from "@/components/multiplayer/useFinishedRatingResult";
import { createInitialGame } from "@/engine/game";
import { toPlayerGameView } from "@/engine/views";
import { finishedRoomPresentation } from "@/lib/multiplayerPostgame";
import type { RoomPlayerView } from "@/lib/roomTypes";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

const players: RoomPlayerView[] = (["Antonin", "Zazou", "Max", "Thomas"] as const).map((name, seat) => ({
  seat_index: seat as 0 | 1 | 2 | 3,
  kind: "human", display_name: name, is_ready: false, is_connected: true,
  bot_takeover: false, is_host: seat === 0, is_ranked: false, rating: null, rank: null,
}));

function presentation(viewer: 0 | 1 | 2 | 3 | null, endReason: "score" | "forfeit" = "score") {
  const state = createInitialGame(() => 0.1);
  state.playerNames = { 0: "Antonin", 1: "Zazou", 2: "Max", 3: "Thomas" };
  state.winnerTeam = 0;
  state.endReason = endReason;
  state.totalScore = { 0: 1040, 1: 820 };
  return finishedRoomPresentation(toPlayerGameView(state, 0), players, viewer);
}

function markup(viewer: 0 | 1 | 2 | 3 | null, rating: FinishedRatingState, isHost = false, endReason: "score" | "forfeit" = "score") {
  return renderToStaticMarkup(React.createElement(FinishedRoomCard, {
    isHost, isResettingRoom: false, onRematch: () => undefined,
    presentation: presentation(viewer, endReason), rating,
  }));
}

describe("multiplayer post-game result", () => {
  it("uses actual team players, scores and the winning team without numeric team placeholders", () => {
    const result = presentation(0);
    expect(result.teams.map((team) => [team.name, team.players, team.score, team.isWinner])).toEqual([
      ["Antonin et Max", ["Antonin", "Max"], 1040, true],
      ["Zazou et Thomas", ["Zazou", "Thomas"], 820, false],
    ]);
    const html = markup(0, { kind: "unrated" });
    expect(html).toContain("Antonin et Max");
    expect(html).toContain("Zazou et Thomas");
    expect(html).not.toContain("Score équipe 0");
    expect(html).not.toContain("Score équipe 1");
    expect(html).toContain("Équipe gagnante");
  });

  it("reports victory, defeat, forfeit and neutral spectator outcomes explicitly", () => {
    expect(presentation(0).title).toBe("Victoire");
    expect(presentation(1).title).toBe("Défaite");
    expect(presentation(0, "forfeit").title).toBe("Victoire par abandon");
    expect(presentation(1, "forfeit").title).toBe("Défaite par abandon");
    expect(presentation(null).title).toBe("Partie terminée");
  });

  it("shows the authoritative positive, negative and zero Elo outcomes", () => {
    const applied = (delta: number, before: number): FinishedRatingState => ({
      kind: "match", result: { status: "applied", ratingBefore: before, delta,
        ratingAfter: before + delta, forfeited: false },
    });
    expect(markup(0, applied(18, 1012))).toContain("+18");
    expect(markup(0, applied(18, 1012))).toContain("1012 → 1030");
    expect(markup(1, applied(-14, 1040))).toContain("-14");
    expect(markup(1, applied(-14, 1040))).toContain("1040 → 1026");
    expect(markup(1, applied(0, 1000))).not.toContain("+0");
  });

  it("keeps pending and ineligible Elo honest", () => {
    const pending = markup(0, { kind: "match", result: {
      status: "pending", ratingBefore: null, delta: null, ratingAfter: null, forfeited: false,
    } });
    expect(pending).toContain("Calcul Elo en cours");
    expect(pending).not.toContain("+0");
    const unrated = markup(0, { kind: "unrated" });
    expect(unrated).toContain("Partie non classée");
    expect(unrated).not.toContain("+0");
    expect(markup(0, { kind: "match", result: {
      status: "void", ratingBefore: null, delta: null, ratingAfter: null, forfeited: false,
    } })).toContain("Résultat Elo annulé");
  });

  it("lets only the host return the shared room to its lobby", () => {
    const nonHost = markup(1, { kind: "unrated" });
    expect(nonHost).toContain("En attente de l’hôte");
    expect(nonHost).not.toContain("Retour à la table");
    expect(nonHost).not.toContain("<button");
    const host = markup(0, { kind: "unrated" }, true);
    expect(host).toContain("Retour au lobby");
    expect(host).toContain("<button");
  });
});

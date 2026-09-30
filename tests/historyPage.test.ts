// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HistoryPage from "@/app/history/page";
import { formatDate, scoringModeLabel, type GameRow } from "@/lib/stats";
import type { MultiplayerHistoryGame } from "@/lib/multiplayerHistory";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { scoreRound } from "@/engine/scoring";

const mocks = vi.hoisted(() => ({ solo: vi.fn(), multiplayer: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "me" } } } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} }) }));
vi.mock("@/lib/stats", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/stats")>(), getUserGames: mocks.solo,
}));
vi.mock("@/lib/multiplayerHistory", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/multiplayerHistory")>(), getUserMultiplayerGames: mocks.multiplayer,
}));

const rules = buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowGenerale: true } } });
const generale = scoreRound({
  contract: { kind: "generale", value: 500, playerId: 0, teamId: 0, trump: "hearts", status: "normal" },
  settings: { scoringMode: "ffb", targetScore: 1000, ruleset: rules },
  trickPointsByTeam: { 0: 100, 1: 0 }, tricksWonByTeam: { 0: 8, 1: 0 },
  tricksWonByPlayer: { 0: 8, 1: 0, 2: 0, 3: 0 },
});
const soloGames: GameRow[] = [
  { id: "old-solo", created_at: "2026-09-28T10:00:00Z", won: true, player_score: 1030, bot_score: 790,
    scoring_mode: "ffb", target_score: 1000, bot_summary: "Bot Alpha, Bot Beta", ruleset_id: "custom", ruleset_snapshot: rules,
    round_history: [{ roundNumber: 1, result: generale, totalScoreAfterRound: { 0: 500, 1: 0 } }], player_names: { 0: "Antonin", 1: "Bot Alpha", 2: "Bot Partenaire", 3: "Bot Beta" } },
  { id: "new-solo", created_at: "2026-09-30T10:00:00Z", won: true, player_score: 1050, bot_score: 870,
    scoring_mode: "made-points", target_score: 1000, bot_summary: null },
];
const multiplayerGames: MultiplayerHistoryGame[] = [{
  id: "multi", started_at: "2026-09-29T09:00:00Z", finished_at: "2026-09-29T10:00:00Z",
  scoring_mode: "ffb", target_score: 1000, team_0_score: 1020, team_1_score: 780, winner_team: 0,
  viewer_seat_index: 1, end_reason: "forfeit", forfeiting_team: 1, round_count: 8,
  players: [
    { seat_index: 0, team_id: 0, kind: "human", display_name: "Ben", bot_profile_id: null },
    { seat_index: 1, team_id: 1, kind: "human", display_name: "Antonin", bot_profile_id: null },
    { seat_index: 2, team_id: 0, kind: "human", display_name: "Romain", bot_profile_id: null },
    { seat_index: 3, team_id: 1, kind: "human", display_name: "Koyora", bot_profile_id: null },
  ],
}];

beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.solo.mockResolvedValue({ data: soloGames, error: null });
  mocks.multiplayer.mockResolvedValue({ data: multiplayerGames, error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const rows = () => within(screen.getByRole("list", { name: "Parties enregistrées" })).getAllByRole("listitem");
const summary = () => screen.getByLabelText("Résumé du filtre");
function expectSummary(values: string[]) {
  expect([...summary().querySelectorAll("dd")].map((value) => value.textContent)).toEqual(values);
}

describe("unified history composition", () => {
  it("defaults to Toutes, keeps chronological order and updates rows and summary with each filter", async () => {
    render(React.createElement(HistoryPage));
    await screen.findByRole("list", { name: "Parties enregistrées" });
    expect(screen.getByRole("button", { name: "Toutes 3" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "← Profil" }).getAttribute("href")).toBe("/profile");
    expectSummary(["3", "2", "1", "67 %"]);
    const dates = [soloGames[1].created_at, multiplayerGames[0].finished_at, soloGames[0].created_at];
    rows().forEach((row, index) => expect(row.textContent).toContain(formatDate(dates[index])));

    fireEvent.click(screen.getByRole("button", { name: "Solo 2" }));
    expectSummary(["2", "2", "0", "100 %"]);
    expect(rows()).toHaveLength(2);
    rows().forEach((row) => { expect(row.textContent).toContain("Solo"); expect(row.textContent).not.toContain("Multijoueur"); });
    expect(rows()[0].textContent).toContain(formatDate(soloGames[1].created_at));

    fireEvent.click(screen.getByRole("button", { name: "Multijoueur 1" }));
    expectSummary(["1", "0", "1", "0 %"]);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("Multijoueur");
    expect(rows()[0].textContent).not.toContain("Solo");
    fireEvent.click(screen.getByRole("button", { name: "Toutes 3" }));
    expectSummary(["3", "2", "1", "67 %"]);
    expect(rows()).toHaveLength(3);
  });

  it("keeps scores, results and multiplayer names visible while rules and Générale remain accessible in details", async () => {
    render(React.createElement(HistoryPage));
    await screen.findByRole("list", { name: "Parties enregistrées" });
    const [newSolo, multi, oldSolo] = rows();
    expect(newSolo.textContent).toContain("1050 — 870");
    expect(newSolo.textContent).toContain(scoringModeLabel("made-points"));
    expect(within(newSolo).getByText("Victoire")).toBeDefined();
    expect(multi.textContent).toContain("780 — 1020");
    expect(within(multi).getByText("Défaite")).toBeDefined();
    expect(within(multi).getByText("Partenaire : Koyora").closest("details")).toBeNull();
    expect(within(multi).getByText("Adversaires : Ben, Romain").closest("details")).toBeNull();

    for (const row of [oldSolo, multi]) {
      const details = row.querySelector("details")!;
      expect(details.open).toBe(false);
      fireEvent.click(within(row).getByText("Voir les détails"));
      expect(details.open).toBe(true);
      expect(details.textContent).toContain("Cible : 1000");
    }
    expect(oldSolo.querySelector("details")!.textContent).toContain("Bots affrontés : Bot Alpha, Bot Beta");
    expect(oldSolo.querySelector("details")!.textContent).toContain("Générale");
    expect(oldSolo.querySelector("details")!.textContent).toContain("par Antonin · réussie");
    expect(oldSolo.querySelector("details")!.textContent).toContain("Manches : 1");
    const rulesDetails = oldSolo.querySelector("details details")! as HTMLDetailsElement;
    fireEvent.click(within(oldSolo).getByText("Variante personnalisée · Voir les règles"));
    expect(rulesDetails.open).toBe(true);
    expect(within(oldSolo).getByRole("region", { name: "Résumé des règles" })).toBeDefined();
    expect(multi.querySelector("details")!.textContent).toContain("Fin : abandon");
    expect(multi.querySelector("details")!.textContent).toContain("Manches : 8");
  });
});

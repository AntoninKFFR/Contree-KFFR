import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RatingCard } from "@/components/rating/RatingCard";
import { LeaderboardView } from "@/components/rating/LeaderboardView";
import type { RatingSummary } from "@/lib/rating/queries";

vi.stubGlobal("React", React);

const base: RatingSummary = {
  rating: 1000, ratedGames: 0, wins: 0, losses: 0, forfeits: 0,
  peakRating: 1000, rank: null, position: null, placementGames: 0,
  isRanked: false, pendingMatches: 0,
};
const card = (summary: RatingSummary) => renderToStaticMarkup(React.createElement(RatingCard, { state: "ready", summary }));
const noop = () => undefined;
const board = (entries: React.ComponentProps<typeof LeaderboardView>["entries"], page = 0, hasNext = false) =>
  renderToStaticMarkup(React.createElement(LeaderboardView, {
    state: "ready", entries, page, hasNext, onNext: noop, onPrevious: noop, onRetry: noop,
  }));

describe("rating UI", () => {
  it("shows 0/5 placement without an official rank", () => {
    const html = card(base);
    expect(html).toContain("0/5");
    expect(html).toContain("Joue 5 parties de Contrée classique");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).not.toContain("au classement");
  });

  it("shows 4/5 placement and remaining matches", () => {
    const html = card({ ...base, rating: 1050, peakRating: 1050, ratedGames: 4, wins: 2, losses: 2, placementGames: 4 });
    expect(html).toContain("4/5");
    expect(html).toContain("Encore 1 partie classée");
    expect(html).toContain('aria-valuenow="4"');
  });

  it("shows a ranked player, next threshold and pending state", () => {
    const html = card({ ...base, rating: 1412, peakRating: 1463, ratedGames: 5, wins: 3, losses: 2,
      placementGames: 5, isRanked: true, rank: "Sait jouer III", position: 27, pendingMatches: 1 });
    expect(html).toContain("Sait jouer III");
    expect(html).toContain("#27 au classement");
    expect(html).toContain("12 / 50 Elo");
    expect(html).toContain('aria-valuenow="12"');
    expect(html).toContain("Mise à jour du classement en cours");
    expect(html).toContain('role="status"');
  });

  it("keeps true Elo for a player without a public username", () => {
    const html = card({ ...base, rating: 1600, peakRating: 1600, ratedGames: 5, wins: 3, losses: 2, placementGames: 5 });
    expect(html).toContain("1 600 Elo");
    expect(html).toContain("Ajoute un pseudo pour apparaître dans le classement.");
    expect(html).toContain('href="#profile-username"');
    expect(html).not.toContain("Placement");
  });

  it("preserves dense-rank ties and renders only public fields", () => {
    const html = board([
      { username: "Alice", rating: 1600, rank: "Capot de Capi IV", position: 1 },
      { username: "Bob", rating: 1600, rank: "Capot de Capi IV", position: 1 },
      { username: "Claire", rating: 1500, rank: "Sait jouer I", position: 2 },
    ]);
    expect(html.match(/#1/g)).toHaveLength(2);
    expect(html.match(/#2/g)).toHaveLength(1);
    expect(html).not.toContain("user_id");
    expect(html).not.toContain("email");
    expect(html).not.toContain("Victoires");
  });

  it("shows empty state and usable pagination controls", () => {
    expect(board([])).toContain("Aucun joueur classé pour le moment.");
    const first = board([{ username: "Alice", rating: 1500, rank: "Sait jouer I", position: 1 }], 0, true);
    expect(first).toContain('aria-label="Page précédente du classement"');
    expect(first).toContain('aria-label="Page suivante du classement"');
    expect(first).toMatch(/disabled=""[^>]*>Précédent/);
    const second = board([{ username: "Bob", rating: 1400, rank: "Sait jouer III", position: 2 }], 1, false);
    expect(second).toContain("Page 2");
    expect(second).toMatch(/disabled=""[^>]*>Suivant/);
  });
});

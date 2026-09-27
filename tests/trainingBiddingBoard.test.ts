// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BiddingExerciseBoard } from "@/components/training/BiddingExerciseBoard";
import { generateBiddingSeries } from "@/engine/training/bidding";
import { generatorVersion } from "@/engine/training/generator";
import type { PlayerId } from "@/engine/types";

afterEach(cleanup);
vi.stubGlobal("React", React);

it("presents each public bidder on the same side as the seat-0 game table", () => {
  const base = generateBiddingSeries({ seed: 7_010_000_000, level: 1, generatorVersion, axisVersion: 1 })[0];
  const bids = ([1, 3, 2, 0] as PlayerId[]).map((playerId) => ({ playerId, action: "pass" as const }));
  render(React.createElement(BiddingExerciseBoard, { exercise: {
    ...base,
    playerNames: { 0: "Joueur 0", 1: "Joueur 1", 2: "Joueur 2", 3: "Joueur 3" },
    publicBids: bids,
  } }));

  const history = screen.getByRole("region", { name: "Historique public des enchères" });
  const rows = within(history).getAllByRole("listitem");
  for (const [index, role] of ["Adversaire droite", "Adversaire gauche", "Partenaire", "Toi"].entries()) {
    expect(within(rows[index]).getByText(role)).toBeTruthy();
    expect(rows[index].textContent).toContain(`Joueur ${bids[index].playerId}`);
  }
});

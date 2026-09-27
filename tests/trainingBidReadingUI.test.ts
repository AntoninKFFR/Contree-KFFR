// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrainingBidReadingPuzzleClient } from "@/components/training/TrainingBidReadingPuzzleClient";
import { TRAINING_PROGRESS_KEY } from "@/components/training/progress";

vi.stubGlobal("React", React);
beforeEach(() => localStorage.removeItem(TRAINING_PROGRESS_KEY));
afterEach(cleanup);

it("hides the example hand until grading, separates guarantees from possibilities, and focuses next", async () => {
  render(React.createElement(TrainingBidReadingPuzzleClient, { level: 1 }));
  expect(await screen.findByRole("heading", { name: "Lire les enchères" })).toBeTruthy();
  const history = screen.getByRole("region", { name: "Historique public des enchères" });
  const target = within(history).getByRole("listitem", { current: "step" });
  expect(target.textContent).toContain("Partenaire");
  expect(screen.queryByRole("region", { name: "Exemple de main compatible" })).toBeNull();
  expect(screen.getAllByRole("checkbox").length).toBeGreaterThanOrEqual(5);
  fireEvent.click(screen.getByRole("button", { name: "Valider" }));
  const correction = screen.getByRole("region", { name: "Correction de la lecture" });
  expect(within(correction).getByText("Selon la doctrine de l’application")).toBeTruthy();
  expect(within(correction).getByText("Tu peux affirmer :")).toBeTruthy();
  expect(within(correction).getByText("Cette enchère peut correspondre à :")).toBeTruthy();
  const hand = within(correction).getByRole("region", { name: "Exemple de main compatible" });
  expect(within(hand).getByText("Une main compatible parmi d’autres")).toBeTruthy();
  expect(hand.querySelectorAll("span[aria-label]")).toHaveLength(8);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Exercice suivant" }));
  expect(correction.textContent).not.toContain("Il avait donc forcément");
  fireEvent.click(screen.getByRole("button", { name: "Exercice suivant" }));
  expect(within(screen.getByRole("region", { name: "Historique public des enchères" }))
    .getByRole("listitem", { current: "step" }).textContent).toContain("Adversaire droite");
  fireEvent.click(screen.getByRole("button", { name: "Valider" }));
  fireEvent.click(screen.getByRole("button", { name: "Exercice suivant" }));
  expect(within(screen.getByRole("region", { name: "Historique public des enchères" }))
    .getByRole("listitem", { current: "step" }).textContent).toContain("Adversaire gauche");
});

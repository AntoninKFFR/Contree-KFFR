// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TrainingDuoSessionView } from "@/components/training/TrainingDuoSessionClient";
import { duoFixture, revealedFixture } from "@/tests/trainingDuoClientFixtures";
import type { TrainingDuoView, TrainingDuoIntent } from "@/lib/trainingDuoTypes";

vi.stubGlobal("React", React);
afterEach(cleanup);
const element = (view: TrainingDuoView, onAction: (intent: TrainingDuoIntent) => void) =>
  React.createElement(TrainingDuoSessionView, { view, pending: false, onAction });
it("shows both seats, distinguishes host and viewer, and enforces ready plus online before start", () => {
  const action = vi.fn(); const view = duoFixture();
  const { rerender } = render(element(view, action));
  expect(screen.getByText(/Alice · Toi/)).toBeTruthy();
  expect(screen.getByText(/Hôte · Pas prêt · En ligne/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Démarrer" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Je suis prêt" }));
  expect(action).toHaveBeenCalledWith({ type: "set-ready", ready: true });
  view.participants.forEach((participant) => { participant.isReady = true; });
  view.participants[1].isConnected = false;
  rerender(element({ ...view }, action));
  expect(screen.getByRole("button", { name: "Démarrer" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByText("Ton partenaire doit être connecté pour démarrer.")).toBeTruthy();
  view.participants[1].isConnected = true;
  rerender(element({ ...view }, action));
  fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));
  fireEvent.click(screen.getByRole("button", { name: "Annuler le duo" }));
  expect(action).toHaveBeenCalledWith({ type: "start" });
  expect(action).toHaveBeenCalledWith({ type: "cancel" });
});
it("offers guest leave, but no host controls", () => {
  const action = vi.fn(); render(element(duoFixture("lobby", 1), action));
  expect(screen.getByText(/Bob · Toi/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Démarrer" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
  expect(action).toHaveBeenCalledWith({ type: "leave" });
});
it("shows only public question before answer, then waiting without correction", () => {
  const action = vi.fn(); const view = duoFixture("active");
  const { rerender } = render(element(view, action));
  expect(screen.getByRole("region", { name: "Historique public des enchères" })).toBeTruthy();
  expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  expect(screen.queryByRole("region", { name: "Exemple de main compatible" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Valider" }));
  expect(action.mock.calls[0][0].type).toBe("submit-answer");
  view.participants[0].hasAnswered = true; view.participants[1].isConnected = false;
  rerender(element({ ...view }, action));
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByText("Réponse enregistrée")).toBeTruthy();
  expect(screen.getByText(/partenaire est hors ligne/)).toBeTruthy();
  expect(screen.queryByText("Selon la doctrine de l’application")).toBeNull();
});
it("reveals both answers and doctrine, then waits for ready-next", () => {
  const action = vi.fn(); const view = revealedFixture();
  const { rerender } = render(element(view, action));
  const correction = screen.getByRole("region", { name: "Correction de la lecture" });
  expect(within(correction).getByText("Toi")).toBeTruthy();
  expect(within(correction).getByText("Bob")).toBeTruthy();
  expect(within(correction).getByText(/Mauvaise réponse · 0 \/ 1/)).toBeTruthy();
  expect(within(correction).getByText(/Bonne réponse · 1 \/ 1/)).toBeTruthy();
  expect(within(correction).getByText("Selon la doctrine de l’application")).toBeTruthy();
  expect(within(correction).getByText("Une main compatible parmi d’autres")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Prêt pour la question suivante" }));
  expect(action).toHaveBeenCalledWith({ type: "ready-next" });
  view.participants[0].readyForNext = true;
  rerender(element({ ...view }, action));
  expect(screen.getByText("Ton partenaire regarde encore la correction.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Prêt pour la question suivante" })).toBeNull();
});
it("maps final scores to the viewer and hides pending correction on cancellation", () => {
  const { rerender } = render(element(duoFixture("completed", 1), vi.fn()));
  expect(screen.getByText("Ton score").parentElement?.textContent).toContain("6 / 10");
  expect(screen.getByText("Score de Alice").parentElement?.textContent).toContain("8 / 10");
  expect(screen.getByText("Réussites communes").parentElement?.textContent).toContain("5 / 10");
  expect(screen.getByText("Cette session duo ne modifie pas ta progression ni tes records.")).toBeTruthy();
  rerender(element(duoFixture("cancelled"), vi.fn()));
  expect(screen.getByRole("heading", { name: "Session interrompue" })).toBeTruthy();
  expect(screen.queryByText("Selon la doctrine de l’application")).toBeNull();
});

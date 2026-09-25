// @vitest-environment jsdom
import React, { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingInGameOverlay } from "@/components/training/TrainingInGameOverlay";
import { NumberPad } from "@/components/training/NumberPad";
import { gradeInGameExercise, type InGameAnswer, type InGameGrade } from "@/engine/training/inGame";
import type { MemoryExercise } from "@/engine/training/memory";
import type { OpponentVoidsExercise } from "@/engine/training/opponentVoids";
import type { ScheduledInGameQuestion } from "@/lib/training/inGameScheduler";

afterEach(cleanup);
vi.stubGlobal("React", React);

const numberQuestion: ScheduledInGameQuestion = {
  eventKey: "number", axisId: "trick-value", level: 1, moment: "trick-end",
  exercise: { kind: "number", axisId: "trick-value", data: {
    seed: 1, generatorVersion: 1, contractMode: { kind: "suit", suit: "hearts" },
    trickNumber: 1, isLastTrick: false, isCapot: false, bonusPoints: 0, answer: 10,
    cards: ["7", "8", "9", "10"].map((rank, playerId) => ({
      playerId: playerId as 0 | 1 | 2 | 3, card: { rank: rank as "7" | "8" | "9" | "10", suit: "clubs" as const },
    })),
  } },
};

function voidQuestion(level: 1 | 2 | 3, proven: boolean): ScheduledInGameQuestion {
  const key = "1:hearts";
  const data: OpponentVoidsExercise = {
    axisId: "opponent-voids", level, seed: 1, generatorVersion: 1,
    players: level === 1 ? [1] : [1, 2, 3],
    suits: level === 1 ? ["hearts"] : ["clubs", "diamonds", "hearts", "spades"],
    expectedCells: proven ? [key] : [], expectedTrumpCount: level === 3 ? 0 : null,
    proofs: proven ? { [key]: { trickNumber: 3, playerId: 1, suit: "hearts" } } : {},
    trump: "spades", observation: { completedTricks: [], currentCards: [] },
    playerNames: { 0: "Moi", 1: "Sian", 2: "Partenaire", 3: "Bot" },
  };
  return { eventKey: `void-${level}-${proven}`, axisId: "opponent-voids", level,
    moment: "trick-start", exercise: { kind: "voids", axisId: "opponent-voids", data } };
}

function Harness({ question }: { question: ScheduledInGameQuestion }) {
  const [grade, setGrade] = useState<InGameGrade | null>(null);
  const onGrade = (answer: InGameAnswer) => setGrade(gradeInGameExercise(question.exercise, answer));
  return createElement(TrainingInGameOverlay, { question, grade, onGrade, onResume: () => {} });
}

function memoryQuestion(axisId: "master-in-hand" | "played-cards" | "trick-recall", expectedIds: string[]): ScheduledInGameQuestion {
  const candidates = ["A", "10", "K", "Q"].map((rank) => ({ suit: "clubs" as const, rank: rank as "A" | "10" | "K" | "Q" }));
  const data: MemoryExercise = {
    axisId, level: 1, seed: 1, generatorVersion: 1,
    question: axisId === "master-in-hand" ? "As-tu la maîtrise à trèfle ?" : "Retrouve les cartes.",
    candidates, expectedIds, expectedPlayers: {}, requiresPlayers: false, trump: "hearts",
    observation: { completedTricks: [], currentCards: [] },
    playerNames: { 0: "Moi", 1: "Sian", 2: "Partenaire", 3: "Bot" },
  };
  return { eventKey: axisId, axisId, level: 1, moment: "trick-start",
    exercise: { kind: axisId === "master-in-hand" ? "boolean" : "cards", axisId, data } as ScheduledInGameQuestion["exercise"] };
}

describe("in-game question presentation", () => {
  it("places zero before adjacent erase controls in the compact keypad only", () => {
    const { unmount } = render(createElement(NumberPad, { value: "12", onChange: () => {}, onSubmit: () => {}, compact: true }));
    expect(within(screen.getByLabelText("Pavé numérique")).getAllByRole("button").map((button) => button.textContent))
      .toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "Effacer", "⌫"]);
    unmount();
    render(createElement(NumberPad, { value: "12", onChange: () => {}, onSubmit: () => {} }));
    expect(within(screen.getByLabelText("Pavé numérique")).getAllByRole("button").map((button) => button.textContent).slice(-3))
      .toEqual(["Effacer", "0", "⌫"]);
  });

  it.each([true, false])("asks mastery as a binary question and explains the answer (%s)", (isMaster) => {
    render(createElement(Harness, { question: memoryQuestion("master-in-hand", isMaster ? ["A-clubs"] : []) }));
    expect(screen.getByText("As-tu la maîtrise à trèfle ?")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /cartes/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: isMaster ? "Oui, je suis maître" : "Non, je ne suis pas maître" }));
    const correction = screen.getByRole("button", { name: "Reprendre la partie" }).closest("section")!;
    expect(correction.textContent).toContain(isMaster ? "te donne la maîtrise" : "Une carte plus forte est encore en jeu");
    expect(correction.textContent).toContain("Bonne réponse !");
  });

  it.each(["played-cards", "trick-recall"] as const)("keeps the %s correction concise", (axisId) => {
    render(createElement(Harness, { question: memoryQuestion(axisId, ["A-clubs"]) }));
    if (axisId === "trick-recall") {
      for (const button of screen.getAllByRole("button").filter((item) => item.getAttribute("aria-pressed") === "false")) fireEvent.click(button);
    }
    fireEvent.click(screen.getByRole("button", { name: "Valider la réponse" }));
    const correction = screen.getByRole("button", { name: "Reprendre la partie" }).closest("section")!;
    expect(correction.textContent).toContain(axisId === "played-cards" ? "Encore en jeu" : "Le pli à retrouver");
    expect(correction.textContent).not.toContain("Bonnes sélections");
    expect(correction.textContent).not.toContain("Cartes oubliées");
  });
  it.each(["input", "button"] as const)("moves focus from the %s to the trick-value correction action", (submitFrom) => {
    render(createElement(Harness, { question: numberQuestion }));
    expect(screen.getAllByText("Combien vaut ce pli ?")).toHaveLength(1);
    expect(screen.getByLabelText("Pavé numérique")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Ta réponse en points" });
    fireEvent.change(input, { target: { value: "0" } });
    if (submitFrom === "input") {
      input.focus();
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: "Enter" });
    } else {
      const submitButton = screen.getByRole("button", { name: "Valider" });
      submitButton.focus();
      expect(document.activeElement).toBe(submitButton);
      fireEvent.click(submitButton);
    }
    expect(screen.queryByLabelText("Pavé numérique")).toBeNull();
    expect(screen.getByText(/Ta réponse :/)).toBeTruthy();
    expect(screen.getByText(/Ce pli vaut/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reprendre la partie" }));
  });

  it.each([true, false])("uses exactly two proof choices at level 1 (proven: %s)", (proven) => {
    render(createElement(Harness, { question: voidQuestion(1, proven) }));
    expect(screen.getByText("Couleurs prouvées")).toBeTruthy();
    expect(screen.getByText("Peut-on prouver que Sian n’a plus de cœur ?")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Grille des coupures" })).toBeNull();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Oui, c’est prouvé", "Non, on ne peut pas l’affirmer",
    ]);
    fireEvent.click(screen.getByRole("button", { name: proven ? "Oui, c’est prouvé" : "Non, on ne peut pas l’affirmer" }));
    expect(screen.queryByRole("button", { name: "Oui, c’est prouvé" })).toBeNull();
    const correction = screen.getByRole("button", { name: "Reprendre la partie" }).closest("section")!;
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Reprendre la partie" }));
    expect(within(correction).getByText(/Bonne réponse !/)).toBeTruthy();
    expect(within(correction).getByText(proven ? "Oui, c’était prouvé :" : "On ne pouvait pas l’affirmer :")).toBeTruthy();
    expect(correction.textContent).not.toMatch(/il n’est pas coupé/i);
    if (proven) expect(correction.textContent).toContain("au pli 3, Sian n’a pas fourni cœur alors que cœur était demandé.");
    else expect(correction.textContent).toContain("aucun pli joué ne prouve que Sian n’a plus de cœur.");
    expect(correction.textContent).not.toContain("Coupures prouvées trouvées");
  });

  it("explains an unproved cell without claiming the player still holds that suit", () => {
    render(createElement(Harness, { question: voidQuestion(1, false) }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, c’est prouvé" }));
    const correction = screen.getByRole("button", { name: "Reprendre la partie" }).closest("section")!;
    expect(within(correction).getByText(/Correction/)).toBeTruthy();
    expect(correction.textContent).toContain("On ne pouvait pas l’affirmer :");
    expect(correction.textContent).not.toMatch(/il n’est pas coupé/i);
  });

  it.each([2, 3] as const)("retains the deduction grid at level %s", (level) => {
    render(createElement(Harness, { question: voidQuestion(level, true) }));
    expect(screen.getByRole("group", { name: "Grille des coupures" })).toBeTruthy();
    expect(screen.getByText("Quelles absences de couleur sont prouvées ?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Oui, c’est prouvé" })).toBeNull();
  });
});

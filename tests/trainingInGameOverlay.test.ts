// @vitest-environment jsdom
import React, { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingInGameOverlay } from "@/components/training/TrainingInGameOverlay";
import { gradeInGameExercise, type InGameAnswer, type InGameGrade } from "@/engine/training/inGame";
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

describe("in-game question presentation", () => {
  it("shows one trick-value question and replaces the number pad with correction", () => {
    render(createElement(Harness, { question: numberQuestion }));
    expect(screen.getAllByText("Combien vaut ce pli ?")).toHaveLength(1);
    expect(screen.getByLabelText("Pavé numérique")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Ta réponse en points" }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(screen.queryByLabelText("Pavé numérique")).toBeNull();
    expect(screen.getByText(/Ta réponse :/)).toBeTruthy();
    expect(screen.getByText(/Ce pli vaut/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reprendre la partie" })).toBeTruthy();
  });

  it.each([true, false])("uses exactly two proof choices at level 1 (proven: %s)", (proven) => {
    render(createElement(Harness, { question: voidQuestion(1, proven) }));
    expect(screen.queryByRole("group", { name: "Grille des coupures" })).toBeNull();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Oui, c’est prouvé", "Non, on ne peut pas l’affirmer",
    ]);
    fireEvent.click(screen.getByRole("button", { name: proven ? "Oui, c’est prouvé" : "Non, on ne peut pas l’affirmer" }));
    expect(screen.queryByRole("button", { name: "Oui, c’est prouvé" })).toBeNull();
    const correction = screen.getByRole("button", { name: "Reprendre la partie" }).closest("section")!;
    expect(within(correction).getByText(/Bonne réponse !/)).toBeTruthy();
    expect(within(correction).getByText(proven ? "Oui, c’était prouvé." : "On ne pouvait pas l’affirmer.")).toBeTruthy();
    expect(correction.textContent).not.toMatch(/il n’est pas coupé/i);
    if (proven) expect(correction.textContent).toContain("Au pli 3, Sian n’a pas fourni cœur alors que cœur était demandé.");
    else expect(correction.textContent).toContain("Aucun pli joué ne prouve que Sian n’a plus de cœur.");
    expect(correction.textContent).not.toContain("Coupures prouvées trouvées");
  });

  it("explains an unproved cell without claiming the player still holds that suit", () => {
    render(createElement(Harness, { question: voidQuestion(1, false) }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, c’est prouvé" }));
    const correction = screen.getByRole("button", { name: "Reprendre la partie" }).closest("section")!;
    expect(within(correction).getByText(/Correction/)).toBeTruthy();
    expect(correction.textContent).toContain("On ne pouvait pas l’affirmer.");
    expect(correction.textContent).not.toMatch(/il n’est pas coupé/i);
  });

  it.each([2, 3] as const)("retains the deduction grid at level %s", (level) => {
    render(createElement(Harness, { question: voidQuestion(level, true) }));
    expect(screen.getByRole("group", { name: "Grille des coupures" })).toBeTruthy();
    expect(screen.getByText("Quelles coupures sont certaines ?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Oui, c’est prouvé" })).toBeNull();
  });
});

// @vitest-environment jsdom
import React, { createRef } from "react";
import Link from "next/link";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TrainingLevelTrack, TrainingModeCard, TrainingResultSummary, TrainingSessionHeader } from "@/components/training/TrainingUI";

afterEach(cleanup);
const longName = "Lire les enchères, les soutiens et toutes les surenchères du partenaire";
const longRecord = "Record compte : 10 / 10 · Meilleur temps : 123,4 s · Niveau 4";

describe("TrainingUI information and accessibility", () => {
  it("preserves level names, current level and locked spans at level one", () => {
    render(<TrainingLevelTrack title={longName} current={1} total={4} href={(level) => `/training/puzzle/bid-reading?level=${level}`} names={{ 1: "Lire une ouverture" }} />);
    expect(screen.getByRole("link", { name: "Niveau 1 · Lire une ouverture" }).getAttribute("aria-current")).toBe("step");
    for (let level = 2; level <= 4; level++) {
      const locked = screen.getByLabelText(`Niveau ${level} verrouillé`);
      expect(locked.tagName).toBe("SPAN"); expect(locked.hasAttribute("href")).toBe(false);
    }
    expect(screen.getByText("Niveau 2 verrouillé · Réussis 8/10 au niveau précédent.")).toBeTruthy();
  });
  it("keeps all earlier levels navigable and only level three current", () => {
    render(<TrainingLevelTrack title="Mémoire" current={3} total={5} href={(level) => `?level=${level}`} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Niveau 3" }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("link", { name: "Niveau 1" }).hasAttribute("aria-current")).toBe(false);
    expect(screen.getByLabelText("Niveau 4 verrouillé").tagName).toBe("SPAN");
    expect(screen.getByText("Niveau 4 verrouillé · Réussis 8/10 au niveau précédent.")).toBeTruthy();
  });
  it("retains featured styling, full descriptions, distinct records and the real CTA", () => {
    render(<TrainingModeCard title={longName} description="Toutes les informations pédagogiques restent présentes, y compris les cas complexes." level={4} levelName={longName} record="Record local · 9 / 10" accountRecord={longRecord} href="/training/puzzle/bid-reading?level=4" action="Jouer en solo" featured>
      <Link href="/training/duo">Jouer à deux</Link>
    </TrainingModeCard>);
    const article = screen.getByRole("article"); expect(article.classList.contains("training-mode-card-featured")).toBe(true);
    expect(within(article).getByRole("heading", { level: 3 }).textContent).toBe(longName);
    expect(screen.getByText("Record local · 9 / 10")).toBeTruthy();
    expect(screen.getByText(`Compte · ${longRecord}`)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Jouer en solo" }).getAttribute("href")).toBe("/training/puzzle/bid-reading?level=4");
    expect(screen.getByRole("link", { name: "Jouer à deux" }).getAttribute("href")).toBe("/training/duo");
  });
  it("keeps locked mode copy without creating a play link", () => {
    render(<TrainingModeCard title="Survie" description="3 vies. Le temps diminue à mesure que tu progresses."><p>Réussis 8/10 en Confirmé pour débloquer ce mode.</p></TrainingModeCard>);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Réussis 8/10 en Confirmé pour débloquer ce mode.")).toBeTruthy();
  });
  it("retains score, complete long level name, exercise index and progress semantics", () => {
    render(<TrainingSessionHeader title={longName} level={3} levelName={longName} index={3} total={10} score={4} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(longName);
    expect(screen.getByText(`Niveau 3 · ${longName}`)).toBeTruthy();
    expect(screen.getByText("4").closest("p")?.textContent).toBe("Score 4");
    const progress = screen.getByRole("progressbar", { name: "Progression de la série" });
    expect(["aria-valuemin", "aria-valuemax", "aria-valuenow"].map((key) => progress.getAttribute(key))).toEqual(["0", "10", "3"]);
    expect(screen.getByLabelText("Exercice 3 sur 10")).toBeTruthy(); expect(screen.getByText("30 %")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Retour à l’entraînement/ }).getAttribute("href")).toBe("/training");
  });
  it("preserves the heading focus target used by shared sessions", () => {
    const headingRef = createRef<HTMLHeadingElement>();
    render(<TrainingSessionHeader title="Lire les enchères à deux" heading="Question 2" headingRef={headingRef} index={2} total={10} />);
    headingRef.current?.focus(); expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Question 2" }));
    expect(headingRef.current?.tabIndex).toBe(-1);
  });
  it("keeps result percentage, best record, unlock status and actionable children", () => {
    render(<TrainingResultSummary title={longName} level={3} levelName={longName} score={8} total={10} best={longRecord} unlocked="Niveau 4 débloqué !">
      <button>Rejouer</button><Link href="?level=4">Niveau suivant</Link><Link href="/training">Retour entraînement</Link>
    </TrainingResultSummary>);
    expect(screen.getByRole("region", { name: "Résultat de la série" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Résultat", level: 1 })).toBeTruthy();
    expect(screen.getByText("80 % de bonnes réponses")).toBeTruthy(); expect(screen.getByText(longRecord)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Niveau 4 débloqué !");
    expect(screen.getByRole("button", { name: "Rejouer" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Niveau suivant" }).getAttribute("href")).toBe("?level=4");
  });
  it("does not announce an unlock when no new level was unlocked", () => {
    render(<TrainingResultSummary title="Mémoire" score={2} total={10}><button>Rejouer</button></TrainingResultSummary>);
    expect(screen.queryByRole("status")).toBeNull(); expect(screen.getByText("20 % de bonnes réponses")).toBeTruthy();
  });
});

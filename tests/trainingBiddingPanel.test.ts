// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BiddingPanel } from "@/components/BiddingPanel";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import type { Contract } from "@/engine/types";

vi.mock("@/components/settings/PlayerPreferencesProvider", () => ({
  usePlayerPreferences: () => ({ preferences: { gameplay: {
    confirmCoinche: true, confirmSurcoinche: true, confirmCapot: true, confirmGenerale: true,
  } } }),
}));
afterEach(cleanup);

const enemyContract: Contract = {
  kind: "points", value: 140, playerId: 3, teamId: 1, trump: "hearts",
  contractMode: { kind: "suit", suit: "hearts" }, status: "normal",
};
const ownDoubled: Contract = {
  ...enemyContract, playerId: 0, teamId: 0, status: "coinched", coinchedBy: 1,
};

function panel(exerciseMode: boolean, contract: Contract | null, canCoinche = false, canSurcoinche = false) {
  const callbacks = { onBid: vi.fn(), onCapot: vi.fn(), onGenerale: vi.fn(),
    onCoinche: vi.fn(), onPass: vi.fn(), onSurcoinche: vi.fn() };
  render(React.createElement(BiddingPanel, { ...(exerciseMode ? { exerciseMode: true } : {}), canBid: true, canCoinche, canSurcoinche,
    currentContract: contract, biddingRules: CONTREE_KFFR_RULESET.bidding, playerId: 0, ...callbacks }));
  return callbacks;
}

describe("BiddingPanel exercise mode", () => {
  it("preserves normal Coinche confirmation but submits directly in an exercise", () => {
    const normal = panel(false, enemyContract, true);
    fireEvent.click(screen.getByRole("button", { name: "Contrer" }));
    expect(screen.getByRole("alertdialog", { name: "Confirmation d'enchère" })).toBeTruthy();
    expect(normal.onCoinche).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(normal.onCoinche).toHaveBeenCalledTimes(1);
    cleanup();
    const exercise = panel(true, enemyContract, true);
    expect(screen.getByRole("heading", { name: "Quelle annonce fais-tu ?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Contrer" }));
    expect(exercise.onCoinche).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("bypasses Capot and Surcoinche confirmations only in exercise mode", () => {
    const normalCapot = panel(false, null);
    fireEvent.click(screen.getByRole("button", { name: "Capot" }));
    expect(normalCapot.onCapot).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Confirmation d'enchère" })).toBeTruthy();
    cleanup();
    const capot = panel(true, null);
    fireEvent.click(screen.getByRole("button", { name: "Capot" }));
    expect(capot.onCapot).toHaveBeenCalledWith({ kind: "suit", suit: "hearts" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    cleanup();
    const normalSurcoinche = panel(false, ownDoubled, false, true);
    fireEvent.click(screen.getByRole("button", { name: "Surcontrer" }));
    expect(normalSurcoinche.onSurcoinche).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Confirmation d'enchère" })).toBeTruthy();
    cleanup();
    const surcoinche = panel(true, ownDoubled, false, true);
    fireEvent.click(screen.getByRole("button", { name: "Surcontrer" }));
    expect(surcoinche.onSurcoinche).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps illegal actions unavailable under the preset", () => {
    const callbacks = panel(true, ownDoubled);
    expect(screen.getByRole("button", { name: "Annoncer" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Capot" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Contrer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Surcontrer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Atout Sans Atout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Atout Tout Atout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Générale" })).toBeNull();
    expect(callbacks.onBid).not.toHaveBeenCalled();
  });
});

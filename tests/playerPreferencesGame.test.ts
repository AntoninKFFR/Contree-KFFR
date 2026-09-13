import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { getContractProgress, getPublicRoundPoints } from "@/engine/contractProgress";
import { createInitialGame, playCard } from "@/engine/game";
import { explainIllegalCard } from "@/engine/illegalCardExplanation";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import type { Card, CompletedTrick, Contract, GameState, PlayerId, Trick } from "@/engine/types";
import { toPlayerGameView } from "@/engine/views";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";
import { isPreferenceAnimationEnabled } from "@/lib/preferences/presentation";
import { observeCompletedTricks } from "@/lib/trickPresentation";
import { createTestRuleset } from "@/tests/helpers/rulesets";

afterEach(() => vi.unstubAllGlobals());

const cards: Card[] = [{ rank: "7", suit: "clubs" }, { rank: "8", suit: "diamonds" }];
const trick: Trick = { leaderId: 1, cards: [{ playerId: 1, card: { rank: "K", suit: "clubs" } }] };

function renderWithPreferences(node: React.ReactNode, configure?: (value: ReturnType<typeof clonePlayerPreferences>) => void) {
  vi.stubGlobal("React", React);
  const preferences = clonePlayerPreferences();
  configure?.(preferences);
  return renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, { initialPreferences: preferences }, node));
}

function renderHand(configure?: (value: ReturnType<typeof clonePlayerPreferences>) => void) {
  return renderWithPreferences(React.createElement(HumanHand, { cards, legalCards: [cards[0]], canPlay: true, onPlayCard: () => undefined }), configure);
}

function playingState(rules = CONTREE_KFFR_RULESET): GameState {
  const contract: Contract = { kind: "points", value: 100, playerId: 0, teamId: 0, trump: "hearts", contractMode: { kind: "suit", suit: "hearts" }, status: "normal" };
  return { ...createInitialGame(() => 0, { ruleset: rules }), phase: "playing", contract, trump: "hearts", contractMode: { kind: "suit", suit: "hearts" }, currentPlayerId: 0, currentTrick: trick, hands: { 0: cards, 1: [], 2: [], 3: [] } };
}

describe("legal-card presentation preferences", () => {
  it("highlights legal cards when enabled", () => expect(renderHand()).toContain("data-highlighted=\"true\""));
  it("does not highlight legal cards when disabled", () => expect(renderHand((value) => { value.assistance.highlightLegalCards = false; })).not.toContain("data-highlighted=\"true\""));
  it("dims illegal cards when enabled", () => expect(renderHand()).toContain("data-dimmed=\"true\""));
  it("does not dim illegal cards when disabled", () => expect(renderHand((value) => { value.assistance.dimIllegalCards = false; })).not.toContain("data-dimmed=\"true\""));
  it("blocks an illegal click by default", () => expect(renderHand()).toMatch(/data-playable="false"[^>]*disabled/));
  it("allows the UX click when configured without changing legality", () => expect(renderHand((value) => { value.assistance.disableIllegalCardClicks = false; })).not.toMatch(/data-playable="false"[^>]*disabled/));
  it("the engine still refuses the illegal card when UX blocking is off", () => expect(() => playCard(playingState(), 0, cards[1])).toThrow(/legal|jouable|cannot/i));
  it.each([
    ["follow suit", { hand: cards, trick, card: cards[1], mode: { kind: "suit", suit: "hearts" } as const }, "fournir à Trèfle"],
    ["raise trump", { hand: [{ rank: "7", suit: "hearts" }, { rank: "J", suit: "hearts" }] as Card[], trick: { leaderId: 1 as PlayerId, cards: [{ playerId: 1 as PlayerId, card: { rank: "9", suit: "hearts" } }] }, card: { rank: "7", suit: "hearts" } as Card, mode: { kind: "suit", suit: "hearts" } as const }, "monter à l'atout"],
    ["cut", { hand: [{ rank: "7", suit: "hearts" }, { rank: "8", suit: "diamonds" }] as Card[], trick, card: { rank: "8", suit: "diamonds" } as Card, mode: { kind: "suit", suit: "hearts" } as const }, "couper"],
    ["overtrump", { hand: [{ rank: "J", suit: "hearts" }, { rank: "7", suit: "hearts" }, { rank: "8", suit: "diamonds" }] as Card[], trick: { leaderId: 1 as PlayerId, cards: [{ playerId: 1 as PlayerId, card: { rank: "K", suit: "clubs" } }, { playerId: 3 as PlayerId, card: { rank: "9", suit: "hearts" } }] }, card: { rank: "7", suit: "hearts" } as Card, mode: { kind: "suit", suit: "hearts" } as const }, "surcouper"],
  ])("explains the %s obligation from legal-card rules", (_label, input, expected) => expect(explainIllegalCard({ ...input, playerId: 0, rules: CONTREE_KFFR_RULESET.cardPlay } as Parameters<typeof explainIllegalCard>[0])).toContain(expected));
});

describe("public live score and contract progress", () => {
  it("shows public round points when enabled", () => expect(renderWithPreferences(React.createElement(GameTable, { state: playingState(), showLiveScore: true }))).toContain("Points en direct"));
  it("hides public round points when disabled", () => expect(renderWithPreferences(React.createElement(GameTable, { state: playingState(), showLiveScore: true }), (value) => { value.assistance.showLivePoints = false; })).not.toContain("Points en direct"));
  it("does not depend on hidden hands", () => { const state = playingState(); state.trickPoints = { 0: 44, 1: 33 }; const first = toPlayerGameView(state, 1); state.hands[2] = [{ rank: "A", suit: "spades" }]; const second = toPlayerGameView(state, 1); expect(getPublicRoundPoints(first)).toEqual(getPublicRoundPoints(second)); expect("hands" in first).toBe(false); });
  it("does not reveal announcement points before every declaration is public", () => { const rules = createTestRuleset({ announcements: { enabled: true } }); const state = playingState(rules); state.trickPoints = { 0: 10, 1: 20 }; state.announcements = { declarations: [], declaredPlayerIds: [0], winningTeam: 0, pointsByTeam: { 0: 100, 1: 0 } }; expect(getPublicRoundPoints(state)).toEqual({ 0: 10, 1: 20 }); });
  it("computes point-contract progress", () => { const state = playingState(); state.trickPoints = { 0: 74, 1: 54 }; expect(getContractProgress(state)).toMatchObject({ takerPoints: 74, defenderPoints: 54, pointsNeeded: 26 }); });
  it("uses the defense race when the rules require it", () => { const rules = createTestRuleset({ contractSuccess: { mustReachBid: false, mustBeatDefense: true } }); const state = playingState(rules); state.trickPoints = { 0: 70, 1: 75 }; expect(getContractProgress(state)).toMatchObject({ takerPoints: 70, defenderPoints: 75, pointsNeeded: 6 }); });
  it("counts only eligible public announcements and Belote", () => { const rules = createTestRuleset({ announcements: { enabled: true }, belote: { enabled: true, countsForContractSuccess: true }, contractSuccess: { announcementsCount: true } }); const state = playingState(rules); state.trickPoints = { 0: 60, 1: 40 }; state.announcements = { declarations: [], declaredPlayerIds: [0, 1, 2, 3], winningTeam: 0, pointsByTeam: { 0: 20, 1: 0 } }; state.belote = { declaration: null, pointsByTeam: { 0: 20, 1: 0 } }; expect(getContractProgress(state)).toMatchObject({ takerPoints: 100, pointsNeeded: 0 }); });
});

describe("animations and three-card tricks", () => {
  it("disables every animation through the global switch", () => { const value = clonePlayerPreferences(); value.visual.animations = false; expect(["deal", "card-play", "trick", "bidding"].every((kind) => !isPreferenceAnimationEnabled(value, kind as "deal"))).toBe(true); });
  it("honors individual animation switches", () => { const value = clonePlayerPreferences(); value.visual.trickAnimation = false; expect(isPreferenceAnimationEnabled(value, "trick")).toBe(false); expect(isPreferenceAnimationEnabled(value, "bidding")).toBe(true); });
  it("honors browser reduced motion", () => expect(isPreferenceAnimationEnabled(clonePlayerPreferences(), "trick", true)).toBe(false));
  it("presents a completed Générale trick with three cards", () => { const completed: CompletedTrick = { leaderId: 0, cards: [{ playerId: 0, card: { rank: "A", suit: "clubs" } }, { playerId: 1, card: { rank: "7", suit: "clubs" } }, { playerId: 3, card: { rank: "8", suit: "clubs" } }], winnerId: 0, points: 11 }; const initial = observeCompletedTricks(null, { completedTricks: [], roundNumber: 1, scope: "general" }); const update = observeCompletedTricks(initial.observation, { completedTricks: [completed], roundNumber: 1, scope: "general" }); expect(update.additions[0].trick.cards).toHaveLength(3); });
});

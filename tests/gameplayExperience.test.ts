import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BiddingPanel } from "@/components/BiddingPanel";
import { GameTable, tableSeatsFor } from "@/components/GameTable";
import { GameMenuPanel } from "@/components/GameMenuPopover";
import { RoundCompletionCard } from "@/components/RoundCompletionCard";
import { HumanHand } from "@/components/HumanHand";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { createInitialGame, makeBid } from "@/engine/game";
import { scoreRound } from "@/engine/scoring";
import { toPlayerGameView } from "@/engine/views";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";
import { handWithoutPendingCard } from "@/lib/multiplayerOptimisticPlay";
import type { RoomPlayerView } from "@/lib/roomTypes";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllGlobals());

function withPreferences(element: React.ReactElement): string {
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, null, element));
}

describe("premium gameplay shell", () => {
  it("keeps only game controls in a compact popover and separates dangerous actions", () => {
    vi.stubGlobal("React", React);
    const markup = renderToStaticMarkup(React.createElement(GameMenuPanel, {
      focusMode: false,
      onOpenPreferences: () => undefined,
      onSelect: (action) => action(),
      onToggleFocusMode: () => undefined,
      preferencesLabel: "Paramètres",
      menuActions: [{ label: "Abandonner la partie", tone: "danger", onSelect: () => undefined }],
    }));
    expect(markup).toContain("Scores en direct");
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain("Abandonner la partie");
    expect(markup).not.toContain("Accueil");
    expect(markup).not.toContain("Multijoueur");
    expect(markup).not.toContain("coinche-global-header");
    expect(markup).not.toContain(">Infos<");
    expect(markup).not.toContain("Mode épuré");
  });

  it("maps the existing hidden-HUD state to the live-score switch", () => {
    vi.stubGlobal("React", React);
    const markup = renderToStaticMarkup(React.createElement(GameMenuPanel, {
      focusMode: true,
      onOpenPreferences: () => undefined,
      onSelect: (action) => action(),
      onToggleFocusMode: () => undefined,
    }));
    expect(markup).toContain('aria-checked="false"');
  });

  it("renders a compact shared round result with reachable action and folded details", () => {
    const initial = createInitialGame(() => 0.1);
    const result = scoreRound({
      contract: { playerId: 0, teamId: 0, value: 90, trump: "diamonds", status: "normal" },
      settings: initial.settings,
      trickPointsByTeam: { 0: 112, 1: 50 },
    });
    const state = { ...initial, phase: "finished" as const, contract: result.contract, result, roundScore: result.roundScore, totalScore: { 0: 200, 1: 50 } };
    const markup = withPreferences(React.createElement(RoundCompletionCard, {
      actionLabel: "Manche suivante", onAction: () => undefined, state,
    }));
    expect(markup).toContain("fixed");
    expect(markup).toContain("safe-area-inset-bottom");
    expect(markup).toContain("Manche suivante");
    expect(markup).toContain("Contrat réussi");
    expect(markup).toContain("90 ♦");
    expect(markup).toContain("Partie : 200 — 50");
    expect(markup).toContain("Détails");
    expect(markup).not.toContain("open=\"\"");
    expect(markup).not.toContain(initial.message);
  });

  it("disables the round-result entrance animation with reduced motion", () => {
    vi.stubGlobal("React", React);
    const initial = createInitialGame(() => 0.1);
    const result = scoreRound({
      contract: { playerId: 0, teamId: 0, value: 90, trump: "clubs", status: "normal" },
      settings: initial.settings,
      trickPointsByTeam: { 0: 100, 1: 62 },
    });
    const preferences = clonePlayerPreferences();
    preferences.visual.reducedMotion = true;
    const state = { ...initial, phase: "finished" as const, contract: result.contract, result, roundScore: result.roundScore };
    const markup = renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, { initialPreferences: preferences }, React.createElement(RoundCompletionCard, {
      actionLabel: "Manche suivante", onAction: () => undefined, state,
    })));
    expect(markup).not.toContain("coinche-card-enter");
  });

  it("uses direct, keyboard-accessible bid and trump targets instead of form selects", () => {
    const markup = withPreferences(React.createElement(BiddingPanel, {
      canBid: true, canCoinche: false, canSurcoinche: false, currentContract: null,
      onBid: () => undefined, onCapot: () => undefined, onGenerale: () => undefined,
      onCoinche: () => undefined, onPass: () => undefined, onSurcoinche: () => undefined,
    }));
    expect(markup).toContain('aria-label="Valeur 80"');
    expect(markup).toContain('aria-label="Atout Coeur"');
    expect(markup).not.toContain("<select");
  });

  it("keeps essential score and contract data while hiding redundant turn and card counts", () => {
    const state = createInitialGame(() => 0.1);
    const players: RoomPlayerView[] = [0, 1, 2, 3].map((seat) => ({
      seat_index: seat as 0 | 1 | 2 | 3,
      kind: "human", display_name: `P${seat}`, is_ready: true,
      is_connected: true, bot_takeover: false, is_host: seat === 0,
      is_ranked: false, rating: null, rank: null,
    }));
    const markup = withPreferences(React.createElement(GameTable, {
      state, players, minimalHud: true, showLiveScore: true,
    }));
    expect(markup).toContain("Annonces");
    expect(markup).toContain("Hôte");
    expect(markup).toContain("En ligne");
    expect(markup).not.toContain("Tour ·");
    expect(markup).not.toMatch(/\d+ cartes?/);
    expect(markup).not.toContain("Points en direct");
  });

  it("keeps human rank identity on the multiplayer table without ranking bots", () => {
    const state = createInitialGame(() => 0.1);
    const players: RoomPlayerView[] = [
      { seat_index: 0, kind: "human", display_name: "Classé", is_ready: true, is_connected: true,
        bot_takeover: false, is_host: true, is_ranked: true, rating: 1450, rank: "Sait jouer II" },
      { seat_index: 1, kind: "bot", display_name: "Bot", is_ready: true, is_connected: true,
        bot_takeover: false, is_host: false, is_ranked: false, rating: null, rank: null },
      { seat_index: 2, kind: "human", display_name: "Placement", is_ready: true, is_connected: true,
        bot_takeover: false, is_host: false, is_ranked: false, rating: null, rank: null },
      { seat_index: 3, kind: "human", display_name: "Reprise", is_ready: true, is_connected: false,
        bot_takeover: true, is_host: false, is_ranked: true, rating: 1600, rank: "Capot de Capi IV" },
    ];
    const markup = withPreferences(React.createElement(GameTable, { state, players }));
    expect(markup.match(/data-rank-family=/g)).toHaveLength(2);
    expect(markup).toContain("Sait jouer II");
    expect(markup).toContain("Capot de Capi IV");
    expect(markup).toContain("Placement");
    expect(markup).toContain("Bot temporaire");
  });

  it("keeps only the contract-progress title and primary value", () => {
    let state = createInitialGame(() => 0.1);
    state = makeBid(state, state.currentPlayerId, { action: "bid", value: 110, trump: "hearts" });
    for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
    state = { ...state, trickPoints: { 0: 67, 1: 95 } };
    const markup = withPreferences(React.createElement(GameTable, { state, showLiveScore: true }));
    expect(markup).toContain("Progression du contrat");
    expect(markup).toMatch(/67\s*\/\s*110/);
    expect(markup).not.toContain("points manquants");
    expect(markup).not.toContain("plis manquants");
    expect(markup).not.toContain("Objectif atteint provisoirement");
    expect(markup).not.toContain("battre la défense");
  });

  it("rotates multiplayer seats so the viewer is always at the bottom", () => {
    const state = createInitialGame(() => 0.1);
    expect(tableSeatsFor(toPlayerGameView(state, 1))).toEqual({ bottom: 1, right: 2, top: 3, left: 0 });
    expect(tableSeatsFor(toPlayerGameView(state, 3))).toEqual({ bottom: 3, right: 0, top: 1, left: 2 });
  });

  it("renders the same integrated controls with a filtered multiplayer view", () => {
    const state = createInitialGame(() => 0.1);
    const view = {
      ...toPlayerGameView(state, 2),
      currentTrick: { ...state.currentTrick, cards: [{ playerId: 1 as const, card: state.hands[1][0] }] },
    };
    const hand = React.createElement(HumanHand, {
      cards: view.hand, legalCards: [], canPlay: false,
      onPlayCard: () => undefined, inScene: true,
    });
    const markup = withPreferences(React.createElement(GameTable, {
      state: view, hand, biddingControls: React.createElement("button", null, "Passer"),
    }));
    expect(markup).toContain("coinche-game-scene");
    expect(markup).toContain("coinche-scene-hand");
    expect(markup).toContain("coinche-scene-bidding");
    expect(markup).toContain("Passer");
    expect(markup.match(/class="coinche-scene-hand-card"/g)).toHaveLength(8);
    expect(markup).toContain('data-player-id="1"');
    expect(markup).toContain("coinche-trick-card--left");
  });

  it("shows a pending multiplayer card once at the table and removes it from the visual hand", () => {
    const state = createInitialGame(() => 0.1);
    const view = toPlayerGameView(state, 2);
    const card = view.hand[0];
    const hand = React.createElement(HumanHand, {
      cards: handWithoutPendingCard(view.hand, card), legalCards: [], canPlay: false,
      onPlayCard: () => undefined, inScene: true,
    });
    const markup = withPreferences(React.createElement(GameTable, {
      state: view, hand, optimisticCard: { playerId: 2, card },
    }));
    expect(markup.match(/class="coinche-scene-hand-card"/g)).toHaveLength(7);
    expect(markup.match(/data-player-id="2"/g)).toHaveLength(1);
    expect(markup).toContain("coinche-card-play-from-bottom");
  });
});

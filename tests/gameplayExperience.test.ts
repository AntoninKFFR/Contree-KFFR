import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BiddingPanel } from "@/components/BiddingPanel";
import { GameTable, tableSeatsFor } from "@/components/GameTable";
import { GameTopBar } from "@/components/GameTopBar";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { createInitialGame } from "@/engine/game";
import { toPlayerGameView } from "@/engine/views";
import type { RoomPlayerView } from "@/lib/roomTypes";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllGlobals());

function withPreferences(element: React.ReactElement): string {
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(React.createElement(PlayerPreferencesProvider, null, element));
}

describe("premium gameplay shell", () => {
  it("keeps essential controls in a compact shared game bar and separates dangerous actions", () => {
    vi.stubGlobal("React", React);
    const markup = renderToStaticMarkup(React.createElement(GameTopBar, {
      contextLabel: "Solo", focusMode: false, infoOpen: true,
      onOpenPreferences: () => undefined,
      onToggleFocusMode: () => undefined,
      onToggleInfo: () => undefined,
      menuActions: [{ label: "Abandonner la partie", tone: "danger", onSelect: () => undefined }],
    }));
    expect(markup).toContain("CONTRÉE KFFR");
    expect(markup).toContain("Mode épuré");
    expect(markup).toContain("Ouvrir le menu de partie");
    expect(markup).toContain("Accueil");
    expect(markup).toContain("Abandonner la partie");
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

  it("always retains score, contract, players, turn and card counts in minimal mode", () => {
    const state = createInitialGame(() => 0.1);
    const players: RoomPlayerView[] = [0, 1, 2, 3].map((seat) => ({
      seat_index: seat as 0 | 1 | 2 | 3,
      kind: "human", display_name: `P${seat}`, is_ready: true,
      is_connected: true, bot_takeover: false, is_host: seat === 0,
    }));
    const markup = withPreferences(React.createElement(GameTable, {
      state, players, minimalHud: true, showLiveScore: true,
    }));
    expect(markup).toContain("Tour ·");
    expect(markup).toContain("Annonces");
    expect(markup).toContain("8 cartes · Hôte");
    expect(markup).not.toContain("Points en direct");
  });

  it("rotates multiplayer seats so the viewer is always at the bottom", () => {
    const state = createInitialGame(() => 0.1);
    expect(tableSeatsFor(toPlayerGameView(state, 1))).toEqual({ bottom: 1, right: 2, top: 3, left: 0 });
    expect(tableSeatsFor(toPlayerGameView(state, 3))).toEqual({ bottom: 3, right: 0, top: 1, left: 2 });
  });
});

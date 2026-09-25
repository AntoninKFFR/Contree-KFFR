import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinishedRoomCard } from "@/components/multiplayer/FinishedRoomCard";
import { canInviteFriendsFromRoom, LobbyHeader, LobbyRulesDialog, LobbyTable, WaitingArea } from "@/components/multiplayer/RoomLobby";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import { rulesetToCustomInput } from "@/engine/rulesets/custom";
import type { MultiplayerRoomView, RoomPlayerView } from "@/lib/roomTypes";

vi.mock("server-only", () => ({}));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

const players: RoomPlayerView[] = [0, 1, 2, 3].map((seat) => ({
  seat_index: seat as 0 | 1 | 2 | 3,
  kind: seat === 0 ? "human" : "empty",
  display_name: seat === 0 ? "Koyora" : null,
  is_ready: false, is_connected: seat === 0, bot_takeover: false, is_host: seat === 0,
  is_ranked: false, rating: null, rank: null,
}));

function header(isHost: boolean) {
  return renderToStaticMarkup(React.createElement(LobbyHeader, {
    canInviteFriends: true, canStartGame: true, canTransferHost: true, code: "BTFTHZ", currentSeat: players[0],
    isHost, isStartingGame: false, isUpdatingReady: false,
    onInviteFriends: () => undefined, onOpenPreferences: () => undefined, onOpenRules: () => undefined,
    onReady: () => undefined, onRefresh: () => undefined,
    onStartGame: () => undefined, onTransferHost: () => undefined,
    scoringMode: "ffb", status: "lobby", targetScore: 1000,
  }));
}

describe("compact multiplayer lobby and finish", () => {
  it("shows an emblem for a ranked human, Placement for an unranked human and no bot rating", () => {
    const seats: RoomPlayerView[] = [
      { ...players[0], is_ranked: true, rating: 1450, rank: "Sait jouer II" },
      { ...players[1], kind: "human", display_name: "Placement", is_connected: true },
      { ...players[2], kind: "bot", display_name: "Bot", is_connected: true },
      players[3],
    ];
    const html = renderToStaticMarkup(React.createElement(LobbyTable, {
      canJoinSeat: false, currentSeatIndex: 0, onJoinSeat: () => undefined, players: seats,
    }));
    expect(html).toContain("%2Franks%2Fsait-jouer.png");
    expect(html).toContain("Sait jouer II");
    expect(html).toContain("Placement");
    expect(html).not.toContain("advanced_rules_v4");
  });
  it("places Rules beside Preferences for host and non-host without a permanent rules summary", () => {
    const host = header(true);
    expect(host).toContain("BTFTHZ");
    expect(host).toContain("1000 pts");
    expect(host.indexOf("Préférences")).toBeLessThan(host.indexOf("Règles"));
    expect(host.indexOf("Règles")).toBeLessThan(host.indexOf("Rafraîchir"));
    expect(host).toContain("Lancer la partie");
    expect(host).toContain("Inviter des amis");
    expect(host).not.toContain("Règles de la table");
    const guest = header(false);
    expect(guest).toContain(">Règles</button>");
    expect(guest).not.toContain("Transférer l");
  });

  it("offers invitations only to a seated human in a lobby with a free seat", () => {
    const room = { room: { status: "lobby" }, viewerSeatIndex: 0, players } as MultiplayerRoomView;
    expect(canInviteFriendsFromRoom(room)).toBe(true);
    expect(canInviteFriendsFromRoom({ ...room, viewerSeatIndex: null })).toBe(false);
    expect(canInviteFriendsFromRoom({ ...room, room: { ...room.room, status: "playing" } })).toBe(false);
    expect(canInviteFriendsFromRoom({ ...room, players: players.map((player) => ({ ...player, kind: "human" })) })).toBe(false);
  });

  it("lets the felt fill the available lobby space and keeps all four seats", () => {
    const markup = renderToStaticMarkup(React.createElement(LobbyTable, {
      canJoinSeat: true, currentSeatIndex: 0, onJoinSeat: () => undefined, players,
    }));
    expect(markup).toContain("coinche-lobby-table flex min-h-0 flex-1 flex-col");
    expect(markup).toContain("coinche-lobby-felt relative min-h-0 flex-1");
    expect(markup).not.toContain("min-h-[360px]");
    for (const position of ["Bas", "Droite", "Haut", "Gauche"]) expect(markup).toContain(`Place ${position}`);
  });

  it("opens the existing configurator for hosts and a read-only rules view for guests", () => {
    const props = {
      isUpdatingRules: false, onClose: () => undefined,
      onRulesDraftChange: () => undefined, onSave: () => undefined,
      rulesDraft: rulesetToCustomInput(CONTREE_KFFR_RULESET), ruleset: CONTREE_KFFR_RULESET,
    };
    const host = renderToStaticMarkup(React.createElement(LobbyRulesDialog, { ...props, isHost: true }));
    expect(host).toContain("coinche-rules-configurator");
    expect(host).toContain("Enregistrer les règles");
    const guest = renderToStaticMarkup(React.createElement(LobbyRulesDialog, { ...props, isHost: false }));
    expect(guest).toContain("Résumé des règles");
    expect(guest).not.toContain("coinche-rules-configurator");
    expect(guest).not.toContain("Enregistrer les règles");
  });

  it("keeps the waiting bar on one compact row", () => {
    const markup = renderToStaticMarkup(React.createElement(WaitingArea, {
      currentSeat: players[0], displayName: "Koyora", firstFreeSeat: 1,
      hasFreeSeat: true, isJoiningSeat: false, isLeavingSeat: false,
      profileUsername: "Koyora", onJoinSeat: () => undefined, onLeaveSeat: () => undefined,
    }));
    expect(markup).toContain("shrink-0");
    expect(markup).toContain("En attente");
    expect(markup).toContain("Koyora (toi)");
    expect(markup).toContain("Quitter la place");
    expect(markup).not.toContain("Tu es assis.");
  });

  it("uses theme text, surface and border tokens for the finished scores", () => {
    const markup = renderToStaticMarkup(React.createElement(FinishedRoomCard, {
      isHost: true, isResettingRoom: false, onRematch: () => undefined,
      presentation: {
        title: "Victoire",
        teams: [
          { id: 0, name: "Koyora et Max", players: ["Koyora", "Max"], score: 720, isWinner: true },
          { id: 1, name: "Zazou et Thomas", players: ["Zazou", "Thomas"], score: 640, isWinner: false },
        ],
      },
      rating: { kind: "unrated" },
    }));
    expect(markup).toContain("Partie terminée");
    expect(markup).toContain("Koyora et Max");
    expect(markup).toContain("Zazou et Thomas");
    expect(markup).not.toContain("Score équipe 0");
    expect(markup).not.toContain("Score équipe 1");
    expect(markup).toContain("text-[color:var(--text-primary)]");
    expect(markup).toContain("text-[color:var(--text-secondary)]");
    expect(markup).not.toContain("text-stone-800");
    expect(markup).toContain("Retour au lobby");
    expect(markup).not.toContain("Retour à la table");
  });
});

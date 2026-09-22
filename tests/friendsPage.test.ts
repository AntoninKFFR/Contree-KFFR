import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FriendsView } from "@/components/friends/FriendsView";
import type { GameInvitationsSnapshot, SocialSnapshot } from "@/lib/socialApi";

vi.stubGlobal("React", React);
const noop = () => undefined;
const emptySnapshot: SocialSnapshot = {
  friends: [], received: [], sent: [], counts: { friends: 0, received: 0, sent: 0 },
};

function render(state: React.ComponentProps<typeof FriendsView>["state"], snapshot: SocialSnapshot | null = null) {
  return renderToStaticMarkup(React.createElement(FriendsView, {
    state,
    snapshot,
    query: "",
    searchResults: [],
    searchState: "idle",
    onQueryChange: noop,
  }));
}

describe("friends page", () => {
  it("offers the dedicated login return path to signed-out visitors", () => {
    const markup = render("signed-out");
    expect(markup).toContain("Non connecté");
    expect(markup).toContain('/login?next=%2Ffriends');
  });

  it("directs an authenticated account without a username to its profile", () => {
    const markup = render("username-required");
    expect(markup).toContain("Choisis d’abord ton pseudo");
    expect(markup).toContain('href="/profile"');
  });

  it("renders empty friends, received requests and sent requests sections", () => {
    const markup = render("ready", emptySnapshot);
    expect(markup).toContain("Mes amis");
    expect(markup).toContain("Tu n&#x27;as pas encore d&#x27;amis ajoutés.");
    expect(markup).toContain("Demandes reçues");
    expect(markup).toContain("Demandes envoyées");
    expect(markup).toContain("Rechercher un joueur");
  });

  it("shows received and sent actions plus an existing friendship state", () => {
    const snapshot: SocialSnapshot = {
      friends: [{ userId: "alice", username: "Alice", createdAt: "now" }],
      received: [{ id: "r1", userId: "bob", username: "Bob", createdAt: "now" }],
      sent: [{ id: "r2", userId: "carol", username: "Carol", createdAt: "now" }],
      counts: { friends: 1, received: 1, sent: 1 },
    };
    const markup = renderToStaticMarkup(React.createElement(FriendsView, {
      state: "ready",
      snapshot,
      query: "Ali",
      searchResults: [
        { userId: "alice", username: "Alice" },
        { userId: "bob", username: "Bob" },
        { userId: "carol", username: "Carol" },
        { userId: "dave", username: "Dave" },
      ],
      searchState: "ready",
      onQueryChange: noop,
    }));
    expect(markup).toContain("Accepter");
    expect(markup).toContain("Refuser");
    expect(markup).toContain("Annuler");
    expect(markup).toContain("Supprimer");
    expect(markup).toContain("Déjà ami");
    expect(markup).toContain("Répondre à la demande");
    expect(markup).toContain("Demande envoyée");
    expect(markup).toContain("Ajouter");
  });

  it("debounces searches, refetches conflicts and confirms friend deletion", () => {
    const client = readFileSync("app/friends/FriendsPageClient.tsx", "utf8");
    expect(client).toContain("}, 350)");
    expect(client).toContain("error.status === 409");
    expect(client).toContain("await refreshSnapshot(session)");
    expect(client).toContain("window.confirm");
    expect(client).toContain("30_000");
  });

  it("shows received and sent game invitations with join, decline and cancel actions", () => {
    const invitations: GameInvitationsSnapshot = {
      invitations: [
        { id: "g1", roomId: "room-1", roomCode: "ABCDEF", inviterId: "alice", inviteeId: "viewer", otherUsername: "Alice", status: "pending", createdAt: "2026-09-21T10:00:00Z", expiresAt: "2026-09-21T10:30:00Z", resolvedAt: null },
        { id: "g2", roomId: "room-2", roomCode: "GHIJKL", inviterId: "viewer", inviteeId: "bob", otherUsername: "Bob", status: "pending", createdAt: "2026-09-21T10:00:00Z", expiresAt: "2026-09-21T10:30:00Z", resolvedAt: null },
      ],
      counts: { receivedPending: 1, sentPending: 1 },
    };
    const markup = renderToStaticMarkup(React.createElement(FriendsView, {
      state: "ready",
      snapshot: emptySnapshot,
      gameInvitations: invitations,
      currentUserId: "viewer",
      query: "",
      searchResults: [],
      searchState: "idle",
    }));
    expect(markup).toContain("Invitations de partie");
    expect(markup).toContain("Table ABCDEF");
    expect(markup).toContain("Rejoindre");
    expect(markup).toContain("Refuser");
    expect(markup).toContain("Envoyées");
    expect(markup).toContain("Annuler");
  });

  it("resolves before navigation and accepts only from the seated room view", () => {
    const friendsClient = readFileSync("app/friends/FriendsPageClient.tsx", "utf8");
    const roomClient = readFileSync("app/multiplayer/[roomId]/RoomPageClient.tsx", "utf8");
    expect(friendsClient).toContain("await resolveGameInvitation(invitationId, session)");
    expect(friendsClient).toContain("router.push(gameInvitationRoomPath(resolution.roomId, invitationId))");
    expect(roomClient).toContain("roomWithPlayers.viewerSeatIndex === null");
    expect(roomClient).toContain("acceptGameInvitation(invitationId, session)");
  });

  it("adds Friends to the drawer only when a session exists", () => {
    const drawer = readFileSync("components/AppDrawerNav.tsx", "utf8");
    expect(drawer).toContain('{ href: "/friends", label: "Amis" }');
    expect(drawer).toContain('{ href: "/leaderboard", label: "Classement" }');
    expect(drawer).toContain('(link.href !== "/friends" && link.href !== "/leaderboard") || session');
  });
});

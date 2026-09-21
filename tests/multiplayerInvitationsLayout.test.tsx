import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceivedInvitations } from "@/components/multiplayer/ReceivedInvitations";
import type { GameInvitationsSnapshot } from "@/lib/socialApi";

const noop = () => undefined;
const base = {
  currentUserId: "me",
  error: null,
  message: null,
  pendingInvitation: null,
  onJoin: noop,
  onDecline: noop,
  onRetry: noop,
};

function render(invitations: GameInvitationsSnapshot | null) {
  return renderToStaticMarkup(<ReceivedInvitations {...base} invitations={invitations} />);
}

describe("multiplayer invitations card", () => {
  it("shows the loading and empty states", () => {
    expect(render(null)).toContain("Chargement des invitations");
    expect(render({ invitations: [], counts: { receivedPending: 0, sentPending: 0 } })).toContain("Aucune invitation en attente.");
  });

  it("only displays received pending invitations with join and decline actions", () => {
    const invitations: GameInvitationsSnapshot = {
      counts: { receivedPending: 1, sentPending: 1 },
      invitations: [
        { id: "received", roomId: "room-1", roomCode: "ABC123", inviterId: "alice", inviteeId: "me", otherUsername: "Alice", status: "pending", createdAt: "now", expiresAt: "later", resolvedAt: null },
        { id: "sent", roomId: "room-2", roomCode: "XYZ789", inviterId: "me", inviteeId: "bob", otherUsername: "Bob", status: "pending", createdAt: "now", expiresAt: "later", resolvedAt: null },
      ],
    };
    const markup = render(invitations);
    expect(markup).toContain("Alice");
    expect(markup).toContain("Table ABC123");
    expect(markup).toContain("Rejoindre");
    expect(markup).toContain("Refuser");
    expect(markup).not.toContain("Bob");
    expect(markup).not.toContain("XYZ789");
  });
});

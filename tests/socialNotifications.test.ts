import { describe, expect, it, vi } from "vitest";
import type { GameInvitation, GameInvitationsSnapshot, SocialFriendRequest, SocialSnapshot } from "@/lib/socialApi";
import { newNotificationKeys, notificationBadge, notificationKey, pendingNotifications } from "@/lib/socialNotifications";

const friend = (id: string): SocialFriendRequest => ({ id, userId: `sender-${id}`, username: "Koyora", createdAt: "2026-09-29T12:00:00Z" });
const game = (id: string, inviteeId = "receiver", status: GameInvitation["status"] = "pending"): GameInvitation => ({
  id, roomId: `room-${id}`, roomCode: "ABC123", inviterId: "sender", inviteeId,
  otherUsername: "Koyora", status, createdAt: "2026-09-29T12:00:00Z",
  expiresAt: "2026-09-29T13:00:00Z", resolvedAt: null,
});
const social = (received: SocialFriendRequest[] = []): SocialSnapshot => ({ friends: [], received, sent: [], counts: { friends: 0, received: received.length, sent: 0 } });
const games = (invitations: GameInvitation[] = []): GameInvitationsSnapshot => ({ invitations, counts: { receivedPending: invitations.filter((item) => item.status === "pending").length, sentPending: 0 } });

describe("social notification reconciliation", () => {
  it("uses the first snapshot as baseline and toasts only new IDs once", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:05:00Z"));
    const baseline = pendingNotifications(social([friend("old")]), games(), "receiver");
    expect(newNotificationKeys(null, baseline)).toEqual([]);
    const oldKeys = new Set(baseline.map(notificationKey));
    const next = pendingNotifications(social([friend("old"), friend("new")]), games([game("invitation")]), "receiver");
    expect(newNotificationKeys(oldKeys, next)).toEqual(["friend:new", "game:invitation"]);
    expect(newNotificationKeys(new Set(next.map(notificationKey)), next)).toEqual([]);
    vi.useRealTimers();
  });

  it("counts received pending only, excludes expired and other accounts, and caps badge text", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:05:00Z"));
    const received = Array.from({ length: 9 }, (_, index) => friend(String(index)));
    const invitations = [game("mine"), game("other", "someone-else"), game("declined", "receiver", "declined"), { ...game("expired"), expiresAt: "2026-09-29T12:00:00Z" }];
    const items = pendingNotifications(social(received), games(invitations), "receiver");
    expect(items).toHaveLength(10);
    expect(notificationBadge(items.length)).toBe("9+");
    vi.useRealTimers();
  });
});

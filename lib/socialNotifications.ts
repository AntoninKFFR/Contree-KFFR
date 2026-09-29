import type { GameInvitation, GameInvitationsSnapshot, SocialFriendRequest, SocialSnapshot } from "@/lib/socialApi";
import type { TrainingDuoInvitation } from "@/lib/trainingDuoInvitationsApi";

export type PendingNotification =
  | { kind: "friend"; id: string; request: SocialFriendRequest }
  | { kind: "game"; id: string; invitation: GameInvitation }
  | { kind: "duo"; id: string; invitation: TrainingDuoInvitation };

export function pendingNotifications(social: SocialSnapshot, games: GameInvitationsSnapshot, userId: string, duos: TrainingDuoInvitation[] = []): PendingNotification[] {
  const friends: PendingNotification[] = social.received.map((request) => ({ kind: "friend", id: request.id, request }));
  const invitations: PendingNotification[] = games.invitations
    .filter((invitation) => invitation.inviteeId === userId && invitation.status === "pending" && Date.parse(invitation.expiresAt) > Date.now())
    .map((invitation) => ({ kind: "game", id: invitation.id, invitation }));
  const duoInvitations: PendingNotification[] = duos.filter((invitation) => invitation.status === "pending" && Date.parse(invitation.expiresAt) > Date.now())
    .map((invitation) => ({ kind: "duo", id: invitation.id, invitation }));
  return [...friends, ...invitations, ...duoInvitations];
}

export function notificationKey(item: PendingNotification): string {
  return `${item.kind}:${item.id}`;
}

export function newNotificationKeys(previous: ReadonlySet<string> | null, current: PendingNotification[]): string[] {
  if (!previous) return [];
  return current.map(notificationKey).filter((key) => !previous.has(key));
}

export function notificationBadge(count: number): string {
  return count > 9 ? "9+" : String(count);
}

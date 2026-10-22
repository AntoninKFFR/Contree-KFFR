// Shared public social wire contracts; no DOM, auth client or server dependency.
export type InvitableFriend = { userId: string; username: string };
export type GameInvitationStatus = "pending" | "accepted" | "declined" | "expired" | "cancelled";

export type GameInvitation = {
  id: string;
  roomId: string;
  roomCode: string;
  inviterId: string;
  inviteeId: string;
  otherUsername: string;
  status: GameInvitationStatus;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
};

export type GameInvitationsSnapshot = {
  invitations: GameInvitation[];
  counts: { receivedPending: number; sentPending: number };
};

export type GameInvitationMutationResult = {
  status: "pending" | "already_invited" | "accepted" | "declined" | "cancelled";
  id?: string;
};

export type GameInvitationResolution = {
  state: "joinable" | GameInvitationStatus;
  roomId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, camel: string, snake = camel): string {
  const value = record[camel] ?? record[snake];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid social field: ${camel}`);
  return value;
}

function requiredCount(record: Record<string, unknown>, key: string, snake = key): number {
  const value = record[key] ?? record[snake];
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`Invalid social count: ${key}`);
  return value as number;
}

export function parseInvitableFriends(value: unknown): InvitableFriend[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Invalid invitable friends");
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error("Invalid invitable friend");
    return {
      userId: requiredString(entry, "userId", "user_id"),
      username: requiredString(entry, "username"),
    };
  });
}

const GAME_INVITATION_STATUSES = new Set<GameInvitationStatus>([
  "pending", "accepted", "declined", "expired", "cancelled",
]);

function parseGameInvitation(value: unknown): GameInvitation {
  if (!isRecord(value) || typeof value.status !== "string" || !GAME_INVITATION_STATUSES.has(value.status as GameInvitationStatus)) {
    throw new Error("Invalid game invitation");
  }
  const resolvedAt = value.resolvedAt ?? value.resolved_at;
  if (resolvedAt !== null && resolvedAt !== undefined && typeof resolvedAt !== "string") {
    throw new Error("Invalid game invitation resolution");
  }
  return {
    id: requiredString(value, "id"),
    roomId: requiredString(value, "roomId", "room_id"),
    roomCode: requiredString(value, "roomCode", "room_code"),
    inviterId: requiredString(value, "inviterId", "inviter_id"),
    inviteeId: requiredString(value, "inviteeId", "invitee_id"),
    otherUsername: requiredString(value, "otherUsername", "other_username"),
    status: value.status as GameInvitationStatus,
    createdAt: requiredString(value, "createdAt", "created_at"),
    expiresAt: requiredString(value, "expiresAt", "expires_at"),
    resolvedAt: typeof resolvedAt === "string" ? resolvedAt : null,
  };
}

export function parseGameInvitationsSnapshot(value: unknown): GameInvitationsSnapshot {
  if (!isRecord(value) || !Array.isArray(value.invitations) || !isRecord(value.counts)) {
    throw new Error("Invalid game invitations snapshot");
  }
  const snapshot = {
    invitations: value.invitations.map(parseGameInvitation),
    counts: {
      receivedPending: requiredCount(value.counts, "receivedPending", "received_pending"),
      sentPending: requiredCount(value.counts, "sentPending", "sent_pending"),
    },
  };
  const receivedPending = snapshot.invitations.filter((invitation) => invitation.status === "pending").length;
  if (snapshot.counts.receivedPending + snapshot.counts.sentPending !== receivedPending) {
    throw new Error("Inconsistent game invitation counts");
  }
  return snapshot;
}

const GAME_MUTATION_STATUSES = new Set<GameInvitationMutationResult["status"]>([
  "pending", "already_invited", "accepted", "declined", "cancelled",
]);

export function parseGameInvitationMutationResult(value: unknown): GameInvitationMutationResult {
  if (!isRecord(value) || typeof value.status !== "string" || !GAME_MUTATION_STATUSES.has(value.status as GameInvitationMutationResult["status"])) {
    throw new Error("Invalid game invitation mutation");
  }
  const status = value.status as GameInvitationMutationResult["status"];
  const id = value.id;
  if (status === "pending" && id !== undefined && (typeof id !== "string" || id.length === 0)) {
    throw new Error("Invalid game invitation id");
  }
  return { status, ...(status === "pending" && typeof id === "string" ? { id } : {}) };
}

export function parseGameInvitationResolution(value: unknown): GameInvitationResolution {
  if (!isRecord(value) || typeof value.state !== "string") throw new Error("Invalid game invitation resolution");
  const allowed = value.state === "joinable" || GAME_INVITATION_STATUSES.has(value.state as GameInvitationStatus);
  if (!allowed) throw new Error("Invalid game invitation state");
  const roomId = value.roomId ?? value.room_id;
  if (value.state === "joinable" && (typeof roomId !== "string" || roomId.length === 0)) {
    throw new Error("Missing joinable room");
  }
  return {
    state: value.state as GameInvitationResolution["state"],
    ...(typeof roomId === "string" ? { roomId } : {}),
  };
}

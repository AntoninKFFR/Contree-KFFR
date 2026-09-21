type AccessTokenSource = { access_token: string };

type ErrorResponse = { data?: unknown; error?: string; code?: string };

export type SocialFriend = {
  userId: string;
  username: string;
  createdAt: string;
};

export type SocialFriendRequest = SocialFriend & { id: string };

export type SocialSnapshot = {
  friends: SocialFriend[];
  received: SocialFriendRequest[];
  sent: SocialFriendRequest[];
  counts: { friends: number; received: number; sent: number };
};

export type SocialSearchResult = { userId: string; username: string };

export type SocialMutationResult = {
  status: "pending" | "request_received" | "already_friends" | "accepted" | "declined" | "cancelled" | "removed";
  id?: string;
};

export class SocialApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "SocialApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, camel: string, snake = camel): string {
  const value = record[camel] ?? record[snake];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid social field: ${camel}`);
  return value;
}

function requiredCount(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`Invalid social count: ${key}`);
  return value as number;
}

function parseFriend(value: unknown): SocialFriend {
  if (!isRecord(value)) throw new Error("Invalid social friend");
  return {
    userId: requiredString(value, "userId", "user_id"),
    username: requiredString(value, "username"),
    createdAt: requiredString(value, "createdAt", "created_at"),
  };
}

function parseFriendRequest(value: unknown): SocialFriendRequest {
  if (!isRecord(value)) throw new Error("Invalid social friend request");
  return { ...parseFriend(value), id: requiredString(value, "id") };
}

export function parseSocialSnapshot(value: unknown): SocialSnapshot {
  if (!isRecord(value) || !Array.isArray(value.friends) || !Array.isArray(value.received) || !Array.isArray(value.sent) || !isRecord(value.counts)) {
    throw new Error("Invalid social snapshot");
  }
  const snapshot = {
    friends: value.friends.map(parseFriend),
    received: value.received.map(parseFriendRequest),
    sent: value.sent.map(parseFriendRequest),
    counts: {
      friends: requiredCount(value.counts, "friends"),
      received: requiredCount(value.counts, "received"),
      sent: requiredCount(value.counts, "sent"),
    },
  };
  if (
    snapshot.counts.friends !== snapshot.friends.length ||
    snapshot.counts.received !== snapshot.received.length ||
    snapshot.counts.sent !== snapshot.sent.length
  ) {
    throw new Error("Inconsistent social snapshot counts");
  }
  return snapshot;
}

export function parseSocialSearchResults(value: unknown): SocialSearchResult[] {
  if (!Array.isArray(value) || value.length > 10) throw new Error("Invalid social search results");
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error("Invalid social search result");
    return {
      userId: requiredString(entry, "userId", "user_id"),
      username: requiredString(entry, "username"),
    };
  });
}

const MUTATION_STATUSES = new Set<SocialMutationResult["status"]>([
  "pending", "request_received", "already_friends", "accepted", "declined", "cancelled", "removed",
]);

export function parseSocialMutationResult(value: unknown): SocialMutationResult {
  if (!isRecord(value) || typeof value.status !== "string" || !MUTATION_STATUSES.has(value.status as SocialMutationResult["status"])) {
    throw new Error("Invalid social mutation result");
  }
  const id = value.id;
  if (id !== undefined && (typeof id !== "string" || id.length === 0)) throw new Error("Invalid social mutation id");
  return { status: value.status as SocialMutationResult["status"], ...(id ? { id } : {}) };
}

async function request<T>(
  url: string,
  token: AccessTokenSource,
  parse: (value: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.access_token}`,
      ...init?.headers,
    },
  });
  let body: ErrorResponse = {};
  try {
    body = await response.json() as ErrorResponse;
  } catch {
    // Preserve the HTTP status when a proxy returns a non-JSON response.
  }
  if (!response.ok || body.data === undefined) {
    throw new SocialApiError(
      body.error ?? "Action sociale impossible.",
      response.status,
      body.code ?? "unknown_error",
    );
  }
  try {
    return parse(body.data);
  } catch {
    throw new SocialApiError("Réponse sociale invalide.", 502, "invalid_response");
  }
}

export function fetchSocialSnapshot(token: AccessTokenSource) {
  return request("/api/social", token, parseSocialSnapshot);
}

export function searchSocialPlayers(query: string, token: AccessTokenSource) {
  return request(`/api/social/search?q=${encodeURIComponent(query)}`, token, parseSocialSearchResults);
}

export function sendFriendRequest(recipientId: string, token: AccessTokenSource) {
  return request("/api/social/friend-requests", token, parseSocialMutationResult, {
    method: "POST",
    body: JSON.stringify({ recipientId }),
  });
}

function friendRequestAction(id: string, action: "accept" | "decline" | "cancel", token: AccessTokenSource) {
  return request(`/api/social/friend-requests/${encodeURIComponent(id)}/${action}`, token, parseSocialMutationResult, { method: "POST" });
}

export function acceptFriendRequest(id: string, token: AccessTokenSource) {
  return friendRequestAction(id, "accept", token);
}

export function declineFriendRequest(id: string, token: AccessTokenSource) {
  return friendRequestAction(id, "decline", token);
}

export function cancelFriendRequest(id: string, token: AccessTokenSource) {
  return friendRequestAction(id, "cancel", token);
}

export function removeFriend(userId: string, token: AccessTokenSource) {
  return request(`/api/social/friends/${encodeURIComponent(userId)}`, token, parseSocialMutationResult, { method: "DELETE" });
}

export function socialErrorMessage(error: unknown): string {
  if (error instanceof SocialApiError) {
    if (error.status === 429) return "Trop de tentatives. Réessaie un peu plus tard.";
    if (error.status === 409) return "La situation vient de changer. L’état actuel a été rechargé.";
    if (error.status === 401) return "Ta session a expiré. Reconnecte-toi.";
    if (error.status === 403 && error.code === "username_required") return "Choisis d’abord ton pseudo.";
    return error.message;
  }
  return "Erreur réseau. Réessaie.";
}

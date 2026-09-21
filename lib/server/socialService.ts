import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  parseGameInvitationMutationResult,
  parseGameInvitationResolution,
  parseGameInvitationsSnapshot,
  parseInvitableFriends,
  parseSocialMutationResult,
  parseSocialSearchResults,
  parseSocialSnapshot,
  type GameInvitationMutationResult,
  type GameInvitationResolution,
  type GameInvitationsSnapshot,
  type InvitableFriend,
  type SocialMutationResult,
  type SocialSearchResult,
  type SocialSnapshot,
} from "@/lib/socialApi";
import { sanitizeApiErrorText } from "@/lib/server/apiError";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

type RpcError = { code?: string; message?: string; details?: string; hint?: string };

export class SocialServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "SocialServerError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSocialUuid(value: unknown, label = "Identifiant"): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new SocialServerError(`${label} invalide.`, 400, "invalid_id");
  }
  return value.toLowerCase();
}

export function parseSocialSearchPrefix(value: unknown): string {
  if (typeof value !== "string") throw new SocialServerError("Recherche invalide.", 400, "invalid_prefix");
  const prefix = value.trim();
  if (prefix.length < 3 || prefix.length > 40) {
    throw new SocialServerError("Saisis entre 3 et 40 caractères.", 400, "invalid_prefix");
  }
  return prefix;
}

export function parseFriendRequestBody(value: unknown): { recipientId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SocialServerError("Requête invalide.", 400, "invalid_body");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "recipientId")) {
    throw new SocialServerError("Requête invalide.", 400, "invalid_body");
  }
  return { recipientId: parseSocialUuid(record.recipientId, "Joueur") };
}

export function parseGameInvitationBody(value: unknown): { inviteeId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SocialServerError("Requête invalide.", 400, "invalid_body");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "inviteeId")) {
    throw new SocialServerError("Requête invalide.", 400, "invalid_body");
  }
  return { inviteeId: parseSocialUuid(record.inviteeId, "Joueur") };
}

export async function readSocialJson(request: Request): Promise<unknown> {
  const announcedLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(announcedLength) && announcedLength > 2_048) {
    throw new SocialServerError("Requête trop volumineuse.", 413, "request_too_large");
  }
  const text = await request.text();
  if (text.length > 2_048) throw new SocialServerError("Requête trop volumineuse.", 413, "request_too_large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SocialServerError("Requête invalide.", 400, "invalid_body");
  }
}

export function mapSocialRpcError(error: RpcError): SocialServerError {
  const code = typeof error.code === "string" ? error.code : "social_rpc_error";
  const rpcMessage = typeof error.message === "string" ? error.message : "";
  if (code === "PT429" || /rate_limited/i.test(rpcMessage)) {
    return new SocialServerError("Trop de tentatives. Réessaie un peu plus tard.", 429, "rate_limited");
  }
  if (code === "42501") {
    return new SocialServerError("Action non autorisée.", 403, "access_denied");
  }
  const known = rpcMessage.match(/authentication_required|username_required|invalid_prefix|invalid_recipient|invalid_friend|invalid_invitee|recipient_unavailable|request_not_found|request_conflict|request_cooldown|not_friends|room_unavailable|invitation_not_found|invitation_conflict|seat_required/)?.[0];
  switch (known) {
    case "authentication_required":
      return new SocialServerError("Authentication required.", 401, known);
    case "username_required":
      return new SocialServerError("Choisis d’abord ton pseudo.", 403, known);
    case "recipient_unavailable":
    case "request_not_found":
    case "invitation_not_found":
      return new SocialServerError("Ressource introuvable.", 404, known);
    case "request_conflict":
    case "request_cooldown":
    case "room_unavailable":
    case "invitation_conflict":
    case "seat_required":
      return new SocialServerError("La situation vient de changer.", 409, known);
    case "not_friends":
      return new SocialServerError("Action non autorisée.", 403, known);
    case "invalid_prefix":
    case "invalid_recipient":
    case "invalid_friend":
    case "invalid_invitee":
      return new SocialServerError("Requête invalide.", 400, known);
    default:
      return new SocialServerError("Erreur serveur.", 500, "social_rpc_error");
  }
}

async function socialClientForRequest(request: Request) {
  await authenticatedUserId(request);
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token) throw new SocialServerError("Authentication required.", 401, "authentication_required");
  if (!url || !publishableKey) throw new SocialServerError("Erreur serveur.", 500, "server_configuration");
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function callRpc<T>(
  request: Request,
  name: string,
  params: Record<string, unknown> | undefined,
  parse: (value: unknown) => T,
): Promise<T> {
  const client = await socialClientForRequest(request);
  const { data, error } = await client.rpc(name, params);
  if (error) throw mapSocialRpcError(error);
  try {
    return parse(data);
  } catch {
    throw new SocialServerError("Réponse sociale invalide.", 502, "invalid_rpc_response");
  }
}

export function getSocialSnapshot(request: Request): Promise<SocialSnapshot> {
  return callRpc(request, "get_my_social_snapshot", undefined, parseSocialSnapshot);
}

export function searchPlayers(request: Request, prefix: string): Promise<SocialSearchResult[]> {
  return callRpc(request, "search_players_by_username", { p_prefix: prefix }, parseSocialSearchResults);
}

export function mutateFriendRequest(
  request: Request,
  action: "send" | "accept" | "decline" | "cancel",
  id: string,
): Promise<SocialMutationResult> {
  const rpc = action === "send" ? "send_friend_request" : `${action}_friend_request`;
  const parameter = action === "send" ? { p_recipient_id: id } : { p_request_id: id };
  return callRpc(request, rpc, parameter, parseSocialMutationResult);
}

export function deleteFriend(request: Request, userId: string): Promise<SocialMutationResult> {
  return callRpc(request, "remove_friend", { p_other_user_id: userId }, parseSocialMutationResult);
}

export function getGameInvitations(request: Request): Promise<GameInvitationsSnapshot> {
  return callRpc(request, "get_my_game_invitations", undefined, parseGameInvitationsSnapshot);
}

export function getInvitableFriends(request: Request, roomId: string): Promise<InvitableFriend[]> {
  return callRpc(request, "list_invitable_friends", { p_room_id: roomId }, parseInvitableFriends);
}

export function sendRoomGameInvitation(
  request: Request,
  roomId: string,
  inviteeId: string,
): Promise<GameInvitationMutationResult> {
  return callRpc(request, "send_game_invitation", {
    p_room_id: roomId,
    p_invitee_id: inviteeId,
  }, parseGameInvitationMutationResult);
}

export function resolveRoomGameInvitation(request: Request, invitationId: string): Promise<GameInvitationResolution> {
  return callRpc(request, "resolve_game_invitation", { p_invitation_id: invitationId }, parseGameInvitationResolution);
}

export function mutateGameInvitation(
  request: Request,
  action: "accept" | "decline" | "cancel",
  invitationId: string,
): Promise<GameInvitationMutationResult> {
  return callRpc(request, `${action}_game_invitation`, { p_invitation_id: invitationId }, parseGameInvitationMutationResult);
}

export function socialApiFailure(error: unknown, route: string, action: string) {
  const authenticationError = error instanceof Error && error.message === "Authentication required.";
  const socialError = error instanceof SocialServerError
    ? error
    : authenticationError
      ? new SocialServerError("Authentication required.", 401, "authentication_required")
      : new SocialServerError("Erreur serveur.", 500, "server_error");
  if (socialError.status >= 500) {
    const rpcError = error && typeof error === "object" ? error as RpcError : {};
    console.error("[social-api] request failed", {
      route,
      action,
      code: sanitizeApiErrorText(rpcError.code),
      message: sanitizeApiErrorText(rpcError.message) ?? sanitizeApiErrorText(error instanceof Error ? error.message : "Unknown error"),
      details: sanitizeApiErrorText(rpcError.details),
      hint: sanitizeApiErrorText(rpcError.hint),
    });
  }
  return NextResponse.json({ error: socialError.message, code: socialError.code }, {
    status: socialError.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function socialApiSuccess(data: unknown) {
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

import type { CustomRulesetInput } from "../../../../engine/rulesets/custom";
import { parseGameInvitationsSnapshot, parseGameInvitationResolution, parseGameInvitationMutationResult, parseInvitableFriends } from "../../../../lib/socialInvitationContracts";
import { SOLO_ORIGIN, type SoloIdentity } from "../solo/api";
import { parseRoom, roomId, RoomFailure, type MultiplayerRoomView, type RoomIntent } from "./contract";
import { seatErrorCode, traceSeat, type SeatTrace } from "./seat-trace";

// One verified backend origin for Solo, multiplayer and social. No user supplied URLs.
export function createRoomApi(fetcher: typeof fetch = fetch, timeoutMs = 15000, trace: (value: SeatTrace) => void = traceSeat) {
  async function call<T>(who: SoloIdentity, signal: AbortSignal, path: string, parse: (v: unknown) => T, body?: unknown, seat?: { seat: number; expectedVersion: number }): Promise<T> {
    if (!who.access_token || who.expires_at !== undefined && who.expires_at * 1000 <= Date.now()) throw new RoomFailure("Session expirée. Reconnecte-toi.", 401, "expired");
    const request = new AbortController(), abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(abort, timeoutMs);
    try {
      if (seat) trace({ event: "http-send", ...seat });
      const response = await fetcher(SOLO_ORIGIN + path, { method: body === undefined ? "GET" : "POST", signal: request.signal,
        redirect: "error", cache: "no-store", headers: { Authorization: "Bearer " + who.access_token, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const raw = await response.text();
      if (request.signal.aborted || raw.length > 2000000) throw new RoomFailure("Réponse interrompue ou trop volumineuse.");
      let wire: { data?: unknown; error?: unknown; code?: unknown };
      try { wire = JSON.parse(raw); } catch { throw new RoomFailure("Réponse serveur illisible.", response.status, "invalid_response"); }
      if (seat) trace({ event: "http-response", ...seat, httpStatus: response.status, code: response.ok ? undefined : seatErrorCode(wire?.code) });
      if (!response.ok) throw new RoomFailure(typeof wire?.error === "string" ? wire.error : "Action refusée par le serveur.", response.status, typeof wire?.code === "string" ? wire.code : "http");
      try { return parse(wire?.data); } catch { throw new RoomFailure("Réponse serveur invalide. Recharge avant de rejouer.", 502, "invalid_response"); }
    } catch (error) {
      if (seat) trace({ event: "http-failure", ...seat, httpStatus: error instanceof RoomFailure ? error.status : 0, code: seatErrorCode(error instanceof RoomFailure ? error.code : "network") });
      if (error instanceof RoomFailure) throw error;
      throw new RoomFailure("Connexion interrompue. Recharge avant de rejouer.");
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  }
  const path = (id: string) => "/api/multiplayer/rooms/" + roomId(id);
  const bound = (id: string) => (v: unknown): MultiplayerRoomView => { const r = parseRoom(v); if (r.room.id !== id) throw new Error("wrong room"); return r; };
  const social = (id: string) => "/api/social/invitations/" + roomId(id);
  return {
    load: (who: SoloIdentity, signal: AbortSignal, id: string) => call(who, signal, path(id), bound(id)),
    create: (who: SoloIdentity, signal: AbortSignal, rules: CustomRulesetInput) => call(who, signal, "/api/multiplayer/rooms", parseRoom, { type: "create", rules }),
    find: (who: SoloIdentity, signal: AbortSignal, code: string) => call(who, signal, "/api/multiplayer/rooms", parseRoom, { type: "find", code: code.trim().toUpperCase() }),
    intent: (who: SoloIdentity, signal: AbortSignal, room: MultiplayerRoomView, intent: RoomIntent) => call(who, signal, path(room.room.id), bound(room.room.id), { expectedVersion: room.room.state_version, intent }, intent.type === "join-seat" ? { seat: intent.seatIndex, expectedVersion: room.room.state_version } : undefined),
    heartbeat: (who: SoloIdentity, signal: AbortSignal, id: string) => call(who, signal, path(id) + "/presence", bound(id), {}),
    tick: (who: SoloIdentity, signal: AbortSignal, id: string) => call(who, signal, path(id) + "/tick", bound(id), {}),
    invitations: (who: SoloIdentity, signal: AbortSignal) => call(who, signal, "/api/social/invitations", parseGameInvitationsSnapshot),
    resolve: (who: SoloIdentity, signal: AbortSignal, id: string) => call(who, signal, social(id) + "/resolve", parseGameInvitationResolution, {}),
    invitation: (who: SoloIdentity, signal: AbortSignal, id: string, action: "accept" | "decline" | "cancel") => call(who, signal, social(id) + "/" + action, parseGameInvitationMutationResult, {}),
    friends: (who: SoloIdentity, signal: AbortSignal, id: string) => call(who, signal, "/api/social/rooms/" + roomId(id) + "/invitable-friends", parseInvitableFriends),
    invite: (who: SoloIdentity, signal: AbortSignal, id: string, inviteeId: string) => call(who, signal, "/api/social/rooms/" + roomId(id) + "/invitations", parseGameInvitationMutationResult, { inviteeId: roomId(inviteeId) }),
  };
}
export type RoomApi = ReturnType<typeof createRoomApi>;

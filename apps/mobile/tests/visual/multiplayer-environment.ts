import states from "../multiplayer/states.json";
import type { MultiplayerRoomView, RoomIntent } from "../../src/multiplayer/contract";
import { parseSoloResponse } from "../../src/solo/contract";
import { biddingFixture } from "../solo-fixtures";
const params = new URLSearchParams(location.search), stage = params.get("multi") ?? "landing", seat = Number(params.get("seat") ?? 0);
const source = (states as Record<string, MultiplayerRoomView[]>)[stage] ?? states["lobby-free"];
let current = structuredClone(source[seat]);
let seatConflict = params.has("seatConflict");
const biddingState = biddingFixture(params.get("bidding"));
if (biddingState) current.game = parseSoloResponse({ data: biddingState }).state;
const handSteps = (globalThis as unknown as { __nativeHandSequence?: NonNullable<MultiplayerRoomView["game"]>[] }).__nativeHandSequence;
let handStep = 0;
if (handSteps) current.game = structuredClone(handSteps[0]);
if (params.has("guest")) {
  const host = Number(params.get("hostSeat") ?? 1) as 0 | 1 | 2 | 3;
  [current.players[0], current.players[host]] = [{ ...current.players[host], seat_index: 0 }, { ...current.players[0], seat_index: host }];
  current.viewerSeatIndex = null; current.isHost = false; current.gameId = null;
}
export const multiplayerRequests: { path: string; body: unknown }[] = [];
Object.assign(globalThis, { __multiplayerFixture: { requests: multiplayerRequests, current: () => current } });
export async function multiplayerFetch(url: string, init?: RequestInit) {
  const path = new URL(url).pathname, body = init?.body ? JSON.parse(String(init.body)) : null;
  multiplayerRequests.push({ path, body });
  // E2E may route the real fetch to the same test server as the web page.
  if (params.get("multi") === "live") return fetch(url, init);
  if (path.includes("/social/")) return new Response(JSON.stringify({ data: { invitations: [], counts: { receivedPending: 0, sentPending: 0 } } }));
  if (body?.type === "find" && body.code !== current.room.code) return new Response(JSON.stringify({ error: "Code introuvable.", code: "room_not_found" }), { status: 404 });
  if (body?.expectedVersion !== undefined) {
    const delay = Number(params.get("postDelay") ?? 0); if (delay) await new Promise((r) => setTimeout(r, delay));
    const intent = body.intent as RoomIntent;
    if (params.get("refuse") === "1") return new Response(JSON.stringify({ error: "Action refusée.", code: "version_conflict" }), { status: 409 });
    if (intent.type === "join-seat") {
      const target = current.players.find((p) => p.seat_index === intent.seatIndex)!;
      if (target.kind !== "empty") return new Response(JSON.stringify({ error: "Cette place n'est plus libre.", code: "seat_occupied" }), { status: 409 });
      if (seatConflict) {
        seatConflict = false;
        Object.assign(target, { kind: "human", display_name: "Autre joueur", is_host: false, is_ready: false, is_connected: true });
        current.room.state_version++;
        return new Response(JSON.stringify({ error: "Cette place n'est plus libre.", code: "seat_occupied" }), { status: 409 });
      }
      const previous = current.players.find((p) => p.seat_index === current.viewerSeatIndex);
      if (previous) Object.assign(previous, { kind: "empty", display_name: null, is_host: false, is_ready: false, is_connected: false, joined_at: null, last_seen_at: null });
      Object.assign(target, { kind: "human", display_name: "Antonin KFFR", is_host: current.isHost, is_ready: false, is_connected: true, joined_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
      current.viewerSeatIndex = intent.seatIndex;
    }
    if (intent.type === "game-action" && intent.action.type === "play-card") {
      if (handSteps) current.game = structuredClone(handSteps[++handStep]);
      else { const card = intent.action.card;
      current.game!.hand = current.game!.hand.filter((c) => c.rank !== card.rank || c.suit !== card.suit);
      current.game!.handCounts[current.game!.viewerPlayerId]--;
      current.game!.currentTrick.cards.push({ playerId: current.game!.viewerPlayerId, card });
      }
    }
    if (intent.type === "set-ready") current.players.find((p) => p.seat_index === current.viewerSeatIndex)!.is_ready = intent.ready;
    current.room.state_version++;
  }
  return new Response(JSON.stringify({ data: current }));
}

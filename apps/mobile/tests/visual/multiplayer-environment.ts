import states from "../multiplayer/states.json";
import type { MultiplayerRoomView, RoomIntent } from "../../src/multiplayer/contract";
const params = new URLSearchParams(location.search), stage = params.get("multi") ?? "landing", seat = Number(params.get("seat") ?? 0);
const source = (states as Record<string, MultiplayerRoomView[]>)[stage] ?? states["lobby-free"];
let current = structuredClone(source[seat]);
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
    if (intent.type === "game-action" && intent.action.type === "play-card") {
      const card = intent.action.card;
      current.game!.hand = current.game!.hand.filter((c) => c.rank !== card.rank || c.suit !== card.suit);
      current.game!.handCounts[current.game!.viewerPlayerId]--;
      current.game!.currentTrick.cards.push({ playerId: current.game!.viewerPlayerId, card });
    }
    if (intent.type === "set-ready") current.players.find((p) => p.seat_index === current.viewerSeatIndex)!.is_ready = intent.ready;
    current.room.state_version++;
  }
  return new Response(JSON.stringify({ data: current }));
}

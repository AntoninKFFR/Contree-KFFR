// Shared server wire types ONLY. No engine function or bot runs in the mobile app.
import type { SoloSession, SoloIntent } from "../../../../lib/solo/sessionTypes";
export type { SoloIntent };
export type Card = SoloSession["state"]["hand"][number];
export type PlayerId = 0 | 1 | 2 | 3;
export const suits = ["clubs", "diamonds", "hearts", "spades"] as const;
export const ranks = ["7", "8", "9", "J", "Q", "K", "10", "A"] as const;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type NativeSoloSession = Pick<SoloSession, "id" | "version"> & { state: {
  phase: SoloSession["state"]["phase"]; viewerPlayerId: 0; currentPlayerId: PlayerId;
  roundNumber: number; hand: Card[]; handCounts: Record<PlayerId, number>;
  playerNames: Record<PlayerId, string>; totalScore: Record<0 | 1, number>;
  currentTrick: { cards: { playerId: PlayerId; card: Card }[] };
  lastTrick: { cards: { playerId: PlayerId; card: Card }[]; winnerId: PlayerId } | null;
  contract: { value: number; label: string } | null;
  bids: string[]; message: string; result: string | null;
  winnerTeam: 0 | 1 | null;
} };
export class SoloFailure extends Error {
  constructor(message: string, readonly status = 0, readonly code = "network") { super(message); }
}
function invalid(): never { throw new SoloFailure("Réponse Solo invalide. Recharge la partie.", 0, "invalid_response"); }
function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid(); }
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number { return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : invalid(); }
function text(value: unknown, max = 500): string { return typeof value === "string" && value.length <= max ? value : invalid(); }
function player(value: unknown): PlayerId { return integer(value, 0, 3) as PlayerId; }
function list(value: unknown, max: number): unknown[] { return Array.isArray(value) && value.length <= max ? value : invalid(); }
function scores(value: unknown): Record<0 | 1, number> { const r = object(value); return { 0: integer(r[0], -1_000_000), 1: integer(r[1], -1_000_000) }; }
function card(value: unknown): Card {
  const r = object(value);
  if (!suits.includes(r.suit as Card["suit"]) || !ranks.includes(r.rank as Card["rank"])) invalid();
  return { suit: r.suit as Card["suit"], rank: r.rank as Card["rank"] };
}
export const cardKey = (c: Card) => c.rank + ":" + c.suit;
function playedCards(value: unknown) {
  const cards = list(value, 4).map((v) => { const c = object(v); return { playerId: player(c.playerId), card: card(c.card) }; });
  if (new Set(cards.map((c) => c.playerId)).size !== cards.length || new Set(cards.map((c) => cardKey(c.card))).size !== cards.length) invalid();
  return cards;
}
export function modeLabel(value: unknown): string {
  const r = object(value);
  if (r.kind === "no-trump") return "Sans atout";
  if (r.kind === "all-trump") return "Tout atout";
  return r.kind === "suit" && suits.includes(r.suit as Card["suit"]) ? { clubs: "Trèfle", diamonds: "Carreau", hearts: "Cœur", spades: "Pique" }[r.suit as Card["suit"]] : invalid();
}
/** Validate and project only displayed fields; never retain an unchecked private payload. */
export function parseSoloResponse(value: unknown): NativeSoloSession {
  const r = object(object(value).data), s = object(r.state);
  const id = text(r.id, 36); if (!uuidPattern.test(id) || s.viewerPlayerId !== 0 || "hands" in s) invalid();
  if (!["bidding", "playing", "finished", "game-over"].includes(String(s.phase))) invalid();
  const hand = list(s.hand, 8).map(card);
  const winnerTeam = s.winnerTeam === null ? null : integer(s.winnerTeam, 0, 1) as 0 | 1;
  if (new Set(hand.map(cardKey)).size !== hand.length) invalid();
  const counts = object(s.handCounts), names = s.playerNames === undefined ? {} : object(s.playerNames);
  const handCounts = {} as Record<PlayerId, number>, playerNames = {} as Record<PlayerId, string>;
  for (const p of [0, 1, 2, 3] as const) { handCounts[p] = integer(counts[p], 0, 8); playerNames[p] = names[p] === undefined ? (p === 0 ? "Toi" : "Joueur " + (p + 1)) : text(names[p], 200); }
  if (handCounts[0] !== hand.length) invalid();
  let contract: NativeSoloSession["state"]["contract"] = null;
  if (s.contract !== null) { const c = object(s.contract); const label = modeLabel(c.contractMode ?? { kind: "suit", suit: c.trump }); contract = { value: integer(c.value, 1, 100_000), label }; }
  const bids = list(s.bids, 256).map((v) => { const b = object(v); const p = player(b.playerId); const action = text(b.action, 20); if (!["bid", "pass", "capot", "generale", "coinche", "surcoinche"].includes(action)) invalid(); return playerNames[p] + " : " + (action === "bid" ? integer(b.value, 1, 100_000) + " " + modeLabel(b.contractMode ?? { kind: "suit", suit: b.trump }) : { pass: "passe", capot: "capot", generale: "générale", coinche: "coinche", surcoinche: "surcoinche" }[action]); });
  let result: string | null = null;
  if (s.result !== null) { const res = object(s.result); const points = scores(res.roundScore); if (res.kind === "all-pass") result = "Tous ont passé. Nouvelle donne."; else if (res.kind === "played" && typeof res.contractSucceeded === "boolean") result = (res.contractSucceeded ? "Contrat réussi" : "Contrat chuté") + " · Nous " + points[0] + " / Eux " + points[1]; else invalid(); }
  const completed = list(s.completedTricks, 8);
  const last = completed.length ? object(completed[completed.length - 1]) : null;
  return { id, version: integer(r.version), state: {
    phase: s.phase as NativeSoloSession["state"]["phase"], viewerPlayerId: 0, currentPlayerId: player(s.currentPlayerId), roundNumber: integer(s.roundNumber, 1),
    hand, handCounts, playerNames, totalScore: scores(s.totalScore), contract, bids, result, message: text(s.message), winnerTeam,
    currentTrick: { cards: playedCards(object(s.currentTrick).cards) },
    lastTrick: last ? { cards: playedCards(last.cards), winnerId: player(last.winnerId) } : null,
  } };
}

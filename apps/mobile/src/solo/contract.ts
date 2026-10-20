import type { SoloSession, SoloIntent } from "../../../../lib/solo/sessionTypes";
import type { Bid, Contract, ContractMode, RoundResult, Trick, CompletedTrick, GameSettings, AnnouncementState, BeloteState } from "../../../../engine/types";
import type { GameRulesetSnapshot } from "../../../../engine/rulesets/types";
import { CONTREE_KFFR_RULESET } from "../../../../engine/rulesets/presets";
import { normalizeGameSettings } from "../../../../engine/rulesets/resolve";
export type { SoloIntent };
export type Card = SoloSession["state"]["hand"][number];
export type PlayerId = 0 | 1 | 2 | 3;
export const suits = ["clubs", "diamonds", "hearts", "spades"] as const;
export const ranks = ["7", "8", "9", "J", "Q", "K", "10", "A"] as const;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type NativeSoloSession = SoloSession;
export class SoloFailure extends Error {
  constructor(message: string, readonly status = 0, readonly code = "network") { super(message); }
}
function invalid(): never { throw new SoloFailure("Réponse Solo invalide. Recharge la partie.", 0, "invalid_response"); }
function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid(); }
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number { return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : invalid(); }
function text(value: unknown, max = 500): string { return typeof value === "string" && value.length <= max ? value : invalid(); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
function oneOf<T extends string>(value: unknown, values: readonly T[]): T { return typeof value === "string" && values.includes(value as T) ? value as T : invalid(); }
function player(value: unknown): PlayerId { return integer(value, 0, 3) as PlayerId; }
function team(value: unknown): 0 | 1 { return integer(value, 0, 1) as 0 | 1; }
function nullableTeam(value: unknown) { return value === null ? null : team(value); }
function list(value: unknown, max: number): unknown[] { return Array.isArray(value) && value.length <= max ? value : invalid(); }
function scores(value: unknown): Record<0 | 1, number> { const r = object(value); return { 0: integer(r[0], -1_000_000), 1: integer(r[1], -1_000_000) }; }
function playerNumbers(value: unknown, max = 8): Record<PlayerId, number> { const r = object(value); return { 0: integer(r[0], 0, max), 1: integer(r[1], 0, max), 2: integer(r[2], 0, max), 3: integer(r[3], 0, max) }; }
function card(value: unknown): Card { const r = object(value); return { suit: oneOf(r.suit, suits), rank: oneOf(r.rank, ranks) }; }
export const cardKey = (c: Card) => c.rank + ":" + c.suit;
function playedCards(value: unknown) {
  const cards = list(value, 4).map((v) => { const c = object(v); return { playerId: player(c.playerId), card: card(c.card) }; });
  if (new Set(cards.map((c) => c.playerId)).size !== cards.length || new Set(cards.map((c) => cardKey(c.card))).size !== cards.length) invalid();
  return cards;
}
function mode(value: unknown): ContractMode {
  const r = object(value);
  if (r.kind === "no-trump" || r.kind === "all-trump") return { kind: r.kind };
  return r.kind === "suit" ? { kind: "suit", suit: oneOf(r.suit, suits) } : invalid();
}
export function modeLabel(value: unknown): string {
  const m = mode(value);
  return m.kind === "no-trump" ? "Sans atout" : m.kind === "all-trump" ? "Tout atout" : { clubs: "Trèfle", diamonds: "Carreau", hearts: "Cœur", spades: "Pique" }[m.suit];
}
function bidMode(r: Record<string, unknown>) {
  const contractMode = r.contractMode === undefined ? undefined : mode(r.contractMode);
  const trump = r.trump === undefined ? undefined : oneOf(r.trump, suits);
  if (!contractMode && !trump || contractMode && trump && (contractMode.kind !== "suit" || contractMode.suit !== trump)) invalid();
  return { ...(contractMode === undefined ? {} : { contractMode }), ...(trump === undefined ? {} : { trump }) };
}
function bid(value: unknown): Bid {
  const r = object(value), playerId = player(r.playerId);
  switch (r.action) {
    case "pass": case "coinche": case "surcoinche": return { action: r.action, playerId };
    case "bid": { const n = integer(r.value, 80, 160); if (n % 10) invalid(); return { action: "bid", playerId, value: n as 80, ...bidMode(r) }; }
    case "capot": return { action: "capot", playerId, ...bidMode(r) };
    case "generale": return { action: "generale", playerId, value: integer(r.value, 1, 100000), ...bidMode(r) };
    default: return invalid();
  }
}
function contract(value: unknown): Contract {
  const r = object(value);
  const base = { playerId: player(r.playerId), teamId: team(r.teamId), status: oneOf(r.status, ["normal", "coinched", "surcoinched"] as const), ...bidMode(r),
    ...(r.coinchedBy === undefined ? {} : { coinchedBy: player(r.coinchedBy) }), ...(r.surcoinchedBy === undefined ? {} : { surcoinchedBy: player(r.surcoinchedBy) }) };
  if (r.kind === "capot") { if (r.value !== 250) invalid(); return { ...base, kind: "capot", value: 250 }; }
  if (r.kind === "generale") return { ...base, kind: "generale", value: integer(r.value, 1, 100000) };
  if (r.kind !== undefined && r.kind !== "points") invalid();
  const n = integer(r.value, 80, 160); if (n % 10) invalid();
  return { ...base, ...(r.kind === "points" ? { kind: "points" as const } : {}), value: n as 80 };
}
function trick(value: unknown): Trick { const r = object(value); return { leaderId: player(r.leaderId), cards: playedCards(r.cards) }; }
function completedTrick(value: unknown): CompletedTrick { const r = object(value); return { ...trick(r), winnerId: player(r.winnerId), points: integer(r.points) }; }
function result(value: unknown): RoundResult {
  const r = object(value), roundScore = scores(r.roundScore);
  if (r.kind === "all-pass") return { kind: "all-pass", roundScore };
  if (r.kind !== "played") invalid();
  return { kind: "played", roundScore, contract: contract(r.contract), takerPoints: integer(r.takerPoints), defenderPoints: integer(r.defenderPoints),
    trickPointsByTeam: scores(r.trickPointsByTeam), announcementPointsByTeam: scores(r.announcementPointsByTeam), belotePointsByTeam: scores(r.belotePointsByTeam),
    totalPointsByTeam: scores(r.totalPointsByTeam), capotTeam: nullableTeam(r.capotTeam), contractSucceeded: bool(r.contractSucceeded),
    scoringMode: oneOf(r.scoringMode, ["ffb", "announced-points", "made-points"] as const), multiplier: integer(r.multiplier, 1, 100000),
    ...(r.tenDeDerTeam === undefined ? {} : { tenDeDerTeam: team(r.tenDeDerTeam) }), ...(r.tricksWonByPlayer === undefined ? {} : { tricksWonByPlayer: playerNumbers(r.tricksWonByPlayer) }) };
}
// Project known schema keys, then use the SAME ruleset validator/migration as web.
function settings(value: unknown): GameSettings {
  const r = object(value), scoringMode = oneOf(r.scoringMode, ["ffb", "announced-points", "made-points"] as const), targetScore = integer(r.targetScore, 1, 100000);
  let ruleset: GameRulesetSnapshot | undefined;
  if (r.ruleset !== undefined) {
    const raw = object(r.ruleset), projected: Record<string, unknown> = { id: text(raw.id, 100), version: integer(raw.version, 1, 100000) };
    for (const section of ["game", "bidding", "cardPlay", "announcements", "belote", "contractSuccess", "trickScoring", "scoring"] as const) {
      const source = object(raw[section]), defaults = CONTREE_KFFR_RULESET[section], fields: Record<string, unknown> = {};
      for (const key of Object.keys(defaults)) {
        const exemplar = (defaults as unknown as Record<string, unknown>)[key], candidate = source[key];
        if (candidate === undefined) continue; // Historical snapshots migrate through canonical defaults.
        fields[key] = typeof exemplar === "boolean" ? bool(candidate) : typeof exemplar === "number" ? integer(candidate, 0, 100000) : oneOf(candidate, ["ffb", "contract-only", "contract-only-160-failure", "points-only"]);
      }
      projected[section] = fields;
    }
    ruleset = projected as GameRulesetSnapshot;
  }
  try { return normalizeGameSettings({ scoringMode, targetScore, ruleset }); } catch { return invalid(); }
}
function announcements(value: unknown): AnnouncementState {
  const r = object(value);
  return { winningTeam: nullableTeam(r.winningTeam), pointsByTeam: scores(r.pointsByTeam), declaredPlayerIds: list(r.declaredPlayerIds, 4).map(player),
    declarations: list(r.declarations, 64).map((v) => { const a = object(v); const n = integer(a.value); if (![20, 50, 100, 150, 200].includes(n)) invalid();
      return { playerId: player(a.playerId), teamId: team(a.teamId), type: oneOf(a.type, ["tierce", "fifty", "hundred", "square"] as const), value: n as 20,
        ...(a.suit === undefined ? {} : { suit: oneOf(a.suit, suits) }), ...(a.highestRank === undefined ? {} : { highestRank: oneOf(a.highestRank, ranks) }), ...(a.squareRank === undefined ? {} : { squareRank: oneOf(a.squareRank, ranks) }) }; }) };
}
function belote(value: unknown): BeloteState {
  const r = object(value);
  const declaration = (value: unknown) => { const d = object(value); return { playerId: player(d.playerId), teamId: team(d.teamId), firstRank: oneOf(d.firstRank, ["K", "Q"] as const), completed: bool(d.completed), ...(d.suit === undefined ? {} : { suit: oneOf(d.suit, suits) }) }; };
  return { declaration: r.declaration === null ? null : declaration(r.declaration), pointsByTeam: scores(r.pointsByTeam),
    ...(r.declarations === undefined ? {} : { declarations: list(r.declarations, 4).map((d) => ({ ...declaration(d), suit: oneOf(object(d).suit, suits) })) }) };
}
/** Rich public projection; no opponent hands or unchecked object spreads. */
export function parseSoloResponse(value: unknown): NativeSoloSession {
  const r = object(object(value).data), s = object(r.state);
  const id = text(r.id, 36); if (!uuidPattern.test(id) || s.viewerPlayerId !== 0 || "hands" in s) invalid();
  const phase = oneOf(s.phase, ["bidding", "playing", "finished", "game-over"] as const);
  const hand = list(s.hand, 8).map(card), handCounts = playerNumbers(s.handCounts);
  if (new Set(hand.map(cardKey)).size !== hand.length || handCounts[viewerPlayerId] !== hand.length) invalid();
  const names = s.playerNames === undefined ? null : object(s.playerNames);
  const playerNames = names ? { 0: text(names[0], 200), 1: text(names[1], 200), 2: text(names[2], 200), 3: text(names[3], 200) } : undefined;
  return { id, version: integer(r.version), state: {
    phase, viewerPlayerId: 0, currentPlayerId: player(s.currentPlayerId), roundNumber: integer(s.roundNumber, 1), startingPlayerId: player(s.startingPlayerId),
    hand, handCounts, playerNames, settings: settings(s.settings), totalScore: scores(s.totalScore), roundScore: scores(s.roundScore), trickPoints: scores(s.trickPoints),
    contract: s.contract === null ? null : contract(s.contract), bids: list(s.bids, 256).map(bid), result: s.result === null ? null : result(s.result), message: text(s.message), winnerTeam: nullableTeam(s.winnerTeam),
    trump: s.trump === null ? null : oneOf(s.trump, suits), ...(s.contractMode === undefined ? {} : { contractMode: s.contractMode === null ? null : mode(s.contractMode) }),
    inactivePlayerId: s.inactivePlayerId === null ? null : player(s.inactivePlayerId), currentTrick: trick(s.currentTrick), completedTricks: list(s.completedTricks, 8).map(completedTrick),
    roundHistory: list(s.roundHistory, 10000).map((v) => { const h = object(v); return { roundNumber: integer(h.roundNumber, 1), result: result(h.result), totalScoreAfterRound: scores(h.totalScoreAfterRound) }; }),
    ...(s.endReason === undefined ? {} : { endReason: s.endReason === null ? null : oneOf(s.endReason, ["score", "forfeit"] as const) }),
    ...(s.forfeitingTeam === undefined ? {} : { forfeitingTeam: nullableTeam(s.forfeitingTeam) }),
    ...(s.announcements === undefined ? {} : { announcements: announcements(s.announcements) }), ...(s.belote === undefined ? {} : { belote: belote(s.belote) }),
  } };
}

export function parseSoloResponse(value: unknown): NativeSoloSession {
  const r = object(object(value).data), id = text(r.id, 36), state = parsePlayerGameView(r.state);
  if (!uuidPattern.test(id) || state.viewerPlayerId !== 0) invalid();
  return { id, version: integer(r.version), state };
}

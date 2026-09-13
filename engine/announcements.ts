import { cardId, SUITS } from "./cards";
import { playerTeam } from "./rules";
import { CONTREE_KFFR_RULESET } from "./rulesets/presets";
import type { GameRulesetSnapshot } from "./rulesets/types";
import type {
  AnnouncementState,
  Card,
  CardAnnouncement,
  PlayerId,
  Rank,
  TeamId,
} from "./types";
import { isTrumpSuit } from "./contractMode";
import type { ContractModeInput } from "./contractMode";

const SEQUENCE_RANKS: Rank[] = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const SQUARE_RANKS: Rank[] = ["Q", "K", "10", "A", "9", "J"];

type AnnouncementRules = GameRulesetSnapshot["announcements"];
type Candidate = { announcement: CardAnnouncement; cardIds: Set<string> };

export function emptyAnnouncementState(): AnnouncementState {
  return { declarations: [], declaredPlayerIds: [], winningTeam: null, pointsByTeam: { 0: 0, 1: 0 } };
}

function sequenceType(length: number): Pick<CardAnnouncement, "type" | "value"> {
  if (length >= 5) return { type: "hundred", value: 100 };
  if (length === 4) return { type: "fifty", value: 50 };
  return { type: "tierce", value: 20 };
}

function announcementTypeEnabled(
  announcement: CardAnnouncement,
  rules: AnnouncementRules,
): boolean {
  if (!rules.enabled) return false;
  if (announcement.type === "square") return rules.squares;
  return rules[announcement.type];
}

function candidatesForHand(
  hand: Card[],
  playerId: PlayerId,
  rules: AnnouncementRules,
): Candidate[] {
  if (!rules.enabled) return [];
  const teamId = playerTeam(playerId);
  const candidates: Candidate[] = [];

  for (const rank of SQUARE_RANKS) {
    const cards = hand.filter((card) => card.rank === rank);
    if (cards.length === 4) {
      const value = rank === "J" ? 200 : rank === "9" ? 150 : 100;
      const announcement: CardAnnouncement = { playerId, teamId, type: "square", value, squareRank: rank };
      if (announcementTypeEnabled(announcement, rules)) {
        candidates.push({ announcement, cardIds: new Set(cards.map(cardId)) });
      }
    }
  }

  for (const suit of SUITS) {
    const present = new Set(hand.filter((card) => card.suit === suit).map((card) => card.rank));
    let start = 0;
    while (start < SEQUENCE_RANKS.length) {
      if (!present.has(SEQUENCE_RANKS[start])) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (end < SEQUENCE_RANKS.length && present.has(SEQUENCE_RANKS[end])) end += 1;
      const ranks = SEQUENCE_RANKS.slice(start, end);
      if (ranks.length >= 3) {
        const { type, value } = sequenceType(ranks.length);
        const announcement: CardAnnouncement = {
          playerId,
          teamId,
          type,
          value,
          suit,
          highestRank: ranks.at(-1),
        };
        if (announcementTypeEnabled(announcement, rules)) {
          candidates.push({
            announcement,
            cardIds: new Set(ranks.map((rank) => cardId({ rank, suit }))),
          });
        }
      }
      start = end;
    }
  }

  return candidates;
}

function selectionKey(selection: Candidate[], mode: ContractModeInput): string {
  const ordered = selection
    .map((candidate) => candidate.announcement)
    .sort((first, second) => compareAnnouncements(second, first, mode));
  return ordered.map((announcement) => [
    String(announcement.value).padStart(3, "0"),
    announcement.type === "square" ? 1 : 0,
    announcement.squareRank ? SQUARE_RANKS.indexOf(announcement.squareRank) + 1 : 0,
    announcement.highestRank ? SEQUENCE_RANKS.indexOf(announcement.highestRank) + 1 : 0,
    announcement.suit && isTrumpSuit(announcement.suit, mode) ? 1 : 0,
    announcement.suit ? SUITS.indexOf(announcement.suit) + 1 : 0,
  ].join(":")).join("|");
}

export function detectAnnouncements(
  hand: Card[],
  playerId: PlayerId,
  mode: ContractModeInput,
  rules: AnnouncementRules = CONTREE_KFFR_RULESET.announcements,
): CardAnnouncement[] {
  const candidates = candidatesForHand(hand, playerId, rules);
  let best: Candidate[] = [];
  let bestPoints = -1;
  let bestKey = "";

  function visit(index: number, selected: Candidate[], used: Set<string>): void {
    if (index === candidates.length) {
      const points = selected.reduce((sum, candidate) => sum + candidate.announcement.value, 0);
      const key = selectionKey(selected, mode);
      if (points > bestPoints || (points === bestPoints && key > bestKey)) {
        best = [...selected];
        bestPoints = points;
        bestKey = key;
      }
      return;
    }
    visit(index + 1, selected, used);
    const candidate = candidates[index];
    if ([...candidate.cardIds].some((id) => used.has(id))) return;
    const nextUsed = new Set(used);
    candidate.cardIds.forEach((id) => nextUsed.add(id));
    visit(index + 1, [...selected, candidate], nextUsed);
  }

  visit(0, [], new Set());
  return best.map((candidate) => candidate.announcement);
}

function squareRankStrength(rank: Rank | undefined): number {
  return rank ? SQUARE_RANKS.indexOf(rank) : -1;
}

export function compareAnnouncements(
  first: CardAnnouncement,
  second: CardAnnouncement,
  mode: ContractModeInput,
): number {
  if (first.value !== second.value) return first.value - second.value;
  if (first.type === "square" && second.type !== "square") return 1;
  if (first.type !== "square" && second.type === "square") return -1;
  if (first.type === "square" && second.type === "square") {
    return squareRankStrength(first.squareRank) - squareRankStrength(second.squareRank);
  }
  const firstHigh = first.highestRank ? SEQUENCE_RANKS.indexOf(first.highestRank) : -1;
  const secondHigh = second.highestRank ? SEQUENCE_RANKS.indexOf(second.highestRank) : -1;
  if (firstHigh !== secondHigh) return firstHigh - secondHigh;
  if (first.suit && isTrumpSuit(first.suit, mode) && (!second.suit || !isTrumpSuit(second.suit, mode))) return 1;
  if (second.suit && isTrumpSuit(second.suit, mode) && (!first.suit || !isTrumpSuit(first.suit, mode))) return -1;
  return 0;
}

function bestForTeam(declarations: CardAnnouncement[], teamId: TeamId, mode: ContractModeInput) {
  return declarations
    .filter((announcement) => announcement.teamId === teamId)
    .sort((first, second) => compareAnnouncements(second, first, mode))[0] ?? null;
}

export function resolveAnnouncements(
  declarations: CardAnnouncement[],
  declaredPlayerIds: PlayerId[],
  mode: ContractModeInput,
): AnnouncementState {
  const team0 = bestForTeam(declarations, 0, mode);
  const team1 = bestForTeam(declarations, 1, mode);
  let winningTeam: TeamId | null = null;
  if (team0 && !team1) winningTeam = 0;
  else if (team1 && !team0) winningTeam = 1;
  else if (team0 && team1) {
    const comparison = compareAnnouncements(team0, team1, mode);
    if (comparison > 0) winningTeam = 0;
    if (comparison < 0) winningTeam = 1;
  }
  const pointsByTeam: Record<TeamId, number> = { 0: 0, 1: 0 };
  if (winningTeam !== null) {
    pointsByTeam[winningTeam] = declarations
      .filter((announcement) => announcement.teamId === winningTeam)
      .reduce((sum, announcement) => sum + announcement.value, 0);
  }
  return { declarations, declaredPlayerIds, winningTeam, pointsByTeam };
}

export function declareAnnouncementsForPlayer(
  state: AnnouncementState | undefined,
  hand: Card[],
  playerId: PlayerId,
  mode: ContractModeInput,
  rules: AnnouncementRules = CONTREE_KFFR_RULESET.announcements,
  expectedPlayers = 4,
): AnnouncementState {
  const current = state ?? emptyAnnouncementState();
  if (!rules.enabled || current.declaredPlayerIds.includes(playerId)) return current;
  const declarations = [...current.declarations, ...detectAnnouncements(hand, playerId, mode, rules)];
  const declaredPlayerIds = [...current.declaredPlayerIds, playerId];
  return declaredPlayerIds.length === expectedPlayers
    ? resolveAnnouncements(declarations, declaredPlayerIds, mode)
    : { ...current, declarations, declaredPlayerIds };
}

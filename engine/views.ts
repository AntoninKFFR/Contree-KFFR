import type { Card, CardAnnouncement, GameState, PlayerId, RoundResult, TeamId } from "./types";
import { normalizeGameSettings } from "./rulesets/resolve";

export type ServerGameState = GameState;

export type PlayerGameView = Omit<ServerGameState, "hands"> & {
  viewerPlayerId: PlayerId;
  hand: Card[];
  handCounts: Record<PlayerId, number>;
};

function handCountsFor(state: ServerGameState): Record<PlayerId, number> {
  return {
    0: state.hands[0].length,
    1: state.hands[1].length,
    2: state.hands[2].length,
    3: state.hands[3].length,
  };
}

function cloneResult(result: RoundResult): RoundResult {
  if (result.kind === "all-pass") {
    return { ...result, roundScore: { ...result.roundScore } };
  }
  return {
    ...result,
    contract: { ...result.contract },
    roundScore: { ...result.roundScore },
    trickPointsByTeam: { ...result.trickPointsByTeam },
    announcementPointsByTeam: { ...result.announcementPointsByTeam },
    belotePointsByTeam: { ...result.belotePointsByTeam },
    totalPointsByTeam: { ...result.totalPointsByTeam },
  };
}

function publicAnnouncement(
  announcement: CardAnnouncement,
  winningTeam: TeamId | null,
): CardAnnouncement {
  if (winningTeam === announcement.teamId) return { ...announcement };
  return {
    playerId: announcement.playerId,
    teamId: announcement.teamId,
    type: announcement.type,
    value: announcement.value,
  };
}

export function toPlayerGameView(
  state: ServerGameState,
  viewerPlayerId: PlayerId,
): PlayerGameView {
  const result = state.result ? cloneResult(state.result) : null;

  return {
    settings: normalizeGameSettings(state.settings),
    playerNames: state.playerNames ? { ...state.playerNames } : undefined,
    phase: state.phase,
    roundNumber: state.roundNumber,
    startingPlayerId: state.startingPlayerId,
    totalScore: { ...state.totalScore },
    roundHistory: state.roundHistory.map((entry) => ({
      ...entry,
      result: cloneResult(entry.result),
      totalScoreAfterRound: { ...entry.totalScoreAfterRound },
    })),
    winnerTeam: state.winnerTeam,
    endReason: state.endReason ?? null,
    forfeitingTeam: state.forfeitingTeam ?? null,
    trump: state.trump,
    currentPlayerId: state.currentPlayerId,
    currentTrick: {
      ...state.currentTrick,
      cards: state.currentTrick.cards.map((played) => ({
        ...played,
        card: { ...played.card },
      })),
    },
    completedTricks: state.completedTricks.map((trick) => ({
      ...trick,
      cards: trick.cards.map((played) => ({
        ...played,
        card: { ...played.card },
      })),
    })),
    bids: state.bids.map((bid) => ({ ...bid })),
    contract: state.contract ? { ...state.contract } : null,
    result,
    trickPoints: { ...state.trickPoints },
    announcements: state.announcements
      ? {
          ...state.announcements,
          declarations: state.announcements.declarations.map((announcement) =>
            publicAnnouncement(announcement, state.announcements?.winningTeam ?? null)),
          declaredPlayerIds: [...state.announcements.declaredPlayerIds],
          pointsByTeam: { ...state.announcements.pointsByTeam },
        }
      : undefined,
    belote: state.belote
      ? {
          declaration: state.belote.declaration ? { ...state.belote.declaration } : null,
          pointsByTeam: { ...state.belote.pointsByTeam },
        }
      : undefined,
    roundScore: { ...state.roundScore },
    message: state.message,
    viewerPlayerId,
    hand: state.hands[viewerPlayerId].map((card) => ({ ...card })),
    handCounts: handCountsFor(state),
  };
}

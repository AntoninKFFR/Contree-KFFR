import type { Card, GameState, PlayerId } from "./types";

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

export function toPlayerGameView(
  state: ServerGameState,
  viewerPlayerId: PlayerId,
): PlayerGameView {
  const result =
    state.result?.kind === "played"
      ? {
          ...state.result,
          contract: { ...state.result.contract },
          roundScore: { ...state.result.roundScore },
        }
      : state.result
        ? {
            ...state.result,
            roundScore: { ...state.result.roundScore },
          }
        : null;

  return {
    settings: { ...state.settings },
    playerNames: state.playerNames ? { ...state.playerNames } : undefined,
    phase: state.phase,
    roundNumber: state.roundNumber,
    startingPlayerId: state.startingPlayerId,
    totalScore: { ...state.totalScore },
    roundHistory: state.roundHistory.map((entry) => ({
      ...entry,
      totalScoreAfterRound: { ...entry.totalScoreAfterRound },
    })),
    winnerTeam: state.winnerTeam,
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
    roundScore: { ...state.roundScore },
    message: state.message,
    viewerPlayerId,
    hand: state.hands[viewerPlayerId].map((card) => ({ ...card })),
    handCounts: handCountsFor(state),
  };
}

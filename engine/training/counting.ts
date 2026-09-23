import { resolveContractMode } from "@/engine/contractMode";
import { playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import type { TrainingRound } from "@/engine/training/generator";
import type { CompletedTrick, Contract, ContractMode, GameState, PlayerId, RoundResult, TeamId } from "@/engine/types";

/** A full round replay is long to watch: counting series are shorter than trick-value series. */
export const COUNTING_SERIES_LENGTH = 5;
/** Same 80 % bar as trick-value (8/10). */
export const COUNTING_PASSING_SCORE = 4;
export const MAX_COUNTING_ATTEMPTS = 100;

export type PlayedRoundResult = Extract<RoundResult, { kind: "played" }>;

export type BeloteMoment = {
  trickIndex: number;
  playerId: PlayerId;
  teamId: TeamId;
  kind: "belote" | "rebelote";
};

/** Everything the replay may show: public information only, never trick points or running totals. */
export type CountingReplay = {
  tricks: CompletedTrick[];
  contract: Contract;
  contractMode: ContractMode;
  playerNames: Record<PlayerId, string>;
  beloteMoments: BeloteMoment[];
};

export function otherTeam(team: TeamId): TeamId {
  return team === 0 ? 1 : 0;
}

export function playedResult(state: GameState): PlayedRoundResult | null {
  const result = state.result;
  return result?.kind === "played" && state.completedTricks.length === 8 ? result : null;
}

/** Rebuilds the exact state after `trickCount` tricks by replaying the recorded cards from the first one. */
export function stateAfterTricks(round: TrainingRound, trickCount: number): GameState {
  const tricks = round.final.completedTricks;
  if (!Number.isInteger(trickCount) || trickCount < 0 || trickCount > tricks.length) {
    throw new Error(`Invalid trick count for this round: ${trickCount}`);
  }
  let state = round.start;
  for (const trick of tricks.slice(0, trickCount)) {
    for (const played of trick.cards) state = playCard(state, played.playerId, played.card);
  }
  return state;
}

/** Plays legal random cards until `stopAfterTricks` tricks are complete (or the round ends). */
export function playOn(state: GameState, seed: number, stopAfterTricks = 8): GameState {
  const random = createSeededRandom(seed ^ 0x434f554e);
  let next = state;
  while (next.phase === "playing" && next.completedTricks.length < stopAfterTricks) {
    const legalCards = playableCardsForCurrentPlayer(next);
    next = playCard(next, next.currentPlayerId, legalCards[Math.floor(random() * legalCards.length)]);
  }
  return next;
}

/** Belote is announced on the first trump King or Queen, rebelote on the second, as players do aloud. */
export function beloteMoments(state: GameState): BeloteMoment[] {
  const declaration = state.belote?.declaration;
  const mode = resolveContractMode(state);
  if (!declaration || mode?.kind !== "suit") return [];
  const moments: BeloteMoment[] = [];
  state.completedTricks.forEach((trick, trickIndex) => {
    for (const { playerId, card } of trick.cards) {
      if (playerId !== declaration.playerId || card.suit !== mode.suit || (card.rank !== "K" && card.rank !== "Q")) continue;
      moments.push({ trickIndex, playerId, teamId: declaration.teamId, kind: moments.length === 0 ? "belote" : "rebelote" });
    }
  });
  return moments;
}

export function countingReplay(state: GameState): CountingReplay {
  const mode = resolveContractMode(state);
  if (!state.contract || !mode || !state.playerNames) throw new Error("A counting exercise requires a played contract.");
  return {
    tricks: state.completedTricks,
    contract: state.contract,
    contractMode: mode,
    playerNames: state.playerNames,
    beloteMoments: beloteMoments(state),
  };
}

export function seededTeam(random: () => number): TeamId {
  return random() < 0.5 ? 0 : 1;
}

/**
 * One point per exercise. A question on both teams gives half a point per exact answer.
 * Missing, non-integer or extra answers never throw: they simply score nothing.
 */
export function gradeCountingAnswers(expected: readonly number[], given: readonly unknown[]): number {
  if (expected.length === 0 || given.length !== expected.length) return 0;
  const exact = expected.filter((value, index) => Number.isInteger(given[index]) && given[index] === value).length;
  return exact / expected.length;
}

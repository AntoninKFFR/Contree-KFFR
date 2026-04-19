import { getBotProfile, type BotProfileId } from "@/bots/profiles";
import {
  chooseMonteCarloCardToPlay,
  chooseMonteCarloV2CardToPlay,
} from "@/bots/strategy/monteCarloCardStrategy";
import { chooseMonteCarloBid } from "@/bots/strategy/monteCarloBiddingStrategy";
import { chooseProfileBid } from "@/bots/strategy/biddingStrategy";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";
import { createInitialGame, makeBid, playCard, startNextRound } from "@/engine/game";
import { playerTeam } from "@/engine/rules";
import type { GameSettings, GameState, TeamId } from "@/engine/types";
import {
  addGameToSummary,
  createEmptySummary,
  type SimulationGameRecord,
  type SimulationRoundRecord,
  type SimulationSummary,
  type TeamProfiles,
} from "@/simulation/stats";

export type SimulationOptions = {
  games: number;
  teamProfiles: TeamProfiles;
  settings?: Partial<GameSettings>;
  seed?: number;
  maxRoundsPerGame?: number;
};

function createSeededRandom(seed: number): () => number {
  let value = seed;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function profileForCurrentPlayer(state: GameState, teamProfiles: TeamProfiles): BotProfileId {
  return teamProfiles[playerTeam(state.currentPlayerId)];
}

function tricksWonByTeam(state: GameState): Record<TeamId, number> {
  return state.completedTricks.reduce(
    (total, trick) => {
      total[playerTeam(trick.winnerId)] += 1;
      return total;
    },
    { 0: 0, 1: 0 } as Record<TeamId, number>,
  );
}

function playOneDecision(state: GameState, teamProfiles: TeamProfiles): GameState {
  const profile = getBotProfile(profileForCurrentPlayer(state, teamProfiles));

  if (state.phase === "bidding") {
    const bid =
      profile.id === "main_montecarlo_bidding"
        ? chooseMonteCarloBid(state, { profile })
        : chooseProfileBid(state, profile);

    if (bid.action === "bid" && bid.value && bid.trump) {
      return makeBid(state, state.currentPlayerId, {
        action: "bid",
        value: bid.value,
        trump: bid.trump,
      });
    }

    if (bid.action === "coinche") {
      return makeBid(state, state.currentPlayerId, { action: "coinche" });
    }

    if (bid.action === "surcoinche") {
      return makeBid(state, state.currentPlayerId, { action: "surcoinche" });
    }

    return makeBid(state, state.currentPlayerId, { action: "pass" });
  }

  const card =
    profile.id === "main_montecarlo_v2" || profile.id === "main_montecarlo_bidding"
      ? chooseMonteCarloV2CardToPlay(state)
      : profile.id === "main_montecarlo"
        ? chooseMonteCarloCardToPlay(state)
        : chooseProfileCardToPlay(state, profile);

  return playCard(state, state.currentPlayerId, card);
}

export function simulateOneGame({
  maxRoundsPerGame = 80,
  seed = 1,
  settings = {},
  teamProfiles,
}: Omit<SimulationOptions, "games">): SimulationGameRecord {
  const random = createSeededRandom(seed);
  let state = createInitialGame(random, settings);
  const rounds: SimulationRoundRecord[] = [];

  while (state.phase !== "game-over" && rounds.length < maxRoundsPerGame) {
    while (state.phase === "bidding" || state.phase === "playing") {
      state = playOneDecision(state, teamProfiles);
    }

    if (state.result) {
      rounds.push({
        result: state.result,
        bids: state.bids,
        tricksWon: tricksWonByTeam(state),
        teamProfiles,
      });
    }

    if (state.phase === "finished") {
      state = startNextRound(state, random);
    }
  }

  const winnerTeam =
    state.winnerTeam ??
    (state.totalScore[0] >= state.totalScore[1] ? 0 : 1);

  return {
    winnerTeam,
    totalScore: state.totalScore,
    rounds,
    teamProfiles,
  };
}

export function runSimulation(options: SimulationOptions): SimulationSummary {
  const summary = createEmptySummary();

  for (let gameIndex = 0; gameIndex < options.games; gameIndex += 1) {
    const game = simulateOneGame({
      maxRoundsPerGame: options.maxRoundsPerGame,
      seed: (options.seed ?? 1) + gameIndex,
      settings: options.settings,
      teamProfiles: options.teamProfiles,
    });

    addGameToSummary(summary, game);
  }

  return summary;
}

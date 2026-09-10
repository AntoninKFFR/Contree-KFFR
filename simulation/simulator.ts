import { getBotProfile, type BotProfileId } from "@/bots/profiles";
import {
  chooseMonteCarloCardToPlay,
  chooseMonteCarloV2CardToPlay,
} from "@/bots/strategy/monteCarloCardStrategy";
import { chooseMonteCarloBid } from "@/bots/strategy/monteCarloBiddingStrategy";
import { chooseProfileBid } from "@/bots/strategy/biddingStrategy";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";
import { chooseMonteCarloV3CardToPlay } from "@/bots/strategy/monteCarloV3CardStrategy";
import { V3_1_OPTIONS } from "@/bots/strategy/monteCarloV3CardStrategy";
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
  onDecision?: (profile: BotProfileId, elapsedMs: number, kind: "bid" | "card") => void;
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

function playOneDecision(
  state: GameState,
  teamProfiles: TeamProfiles,
  onDecision?: SimulationOptions["onDecision"],
): GameState {
  const profile = getBotProfile(profileForCurrentPlayer(state, teamProfiles));
  const started = performance.now();

  if (state.phase === "bidding") {
    const bid =
      profile.id === "main_montecarlo_bidding"
        ? chooseMonteCarloBid(state, { profile })
        : chooseProfileBid(state, profile);

    if (bid.action === "bid" && bid.value && bid.trump) {
      const next = makeBid(state, state.currentPlayerId, {
        action: "bid",
        value: bid.value,
        trump: bid.trump,
      });
      onDecision?.(profile.id as BotProfileId, performance.now() - started, "bid");
      return next;
    }

    if (bid.action === "coinche") {
      const next = makeBid(state, state.currentPlayerId, { action: "coinche" });
      onDecision?.(profile.id as BotProfileId, performance.now() - started, "bid");
      return next;
    }

    if (bid.action === "surcoinche") {
      const next = makeBid(state, state.currentPlayerId, { action: "surcoinche" });
      onDecision?.(profile.id as BotProfileId, performance.now() - started, "bid");
      return next;
    }

    const next = makeBid(state, state.currentPlayerId, { action: "pass" });
    onDecision?.(profile.id as BotProfileId, performance.now() - started, "bid");
    return next;
  }

  const card =
    profile.id === "main_montecarlo_v3" || profile.id === "main_montecarlo_v3_1"
      ? chooseMonteCarloV3CardToPlay(state, profile.id === "main_montecarlo_v3_1" ? V3_1_OPTIONS : undefined)
      : profile.id === "main_montecarlo_v2" || profile.id === "main_montecarlo_bidding"
      ? chooseMonteCarloV2CardToPlay(state)
      : profile.id === "main_montecarlo"
        ? chooseMonteCarloCardToPlay(state)
        : chooseProfileCardToPlay(state, profile);

  const next = playCard(state, state.currentPlayerId, card);
  onDecision?.(profile.id as BotProfileId, performance.now() - started, "card");
  return next;
}

export function simulateOneGame({
  maxRoundsPerGame = 80,
  seed = 1,
  settings = {},
  teamProfiles,
  onDecision,
}: Omit<SimulationOptions, "games">): SimulationGameRecord {
  const random = createSeededRandom(seed);
  let state = createInitialGame(random, settings);
  const rounds: SimulationRoundRecord[] = [];

  while (state.phase !== "game-over" && rounds.length < maxRoundsPerGame) {
    while (state.phase === "bidding" || state.phase === "playing") {
      state = playOneDecision(state, teamProfiles, onDecision);
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

  if (state.phase !== "game-over" || state.winnerTeam === null) {
    throw new Error(`Partie invalide: limite de sécurité de ${maxRoundsPerGame} manches atteinte sans game-over (seed ${seed}).`);
  }

  return {
    winnerTeam: state.winnerTeam,
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
      onDecision: options.onDecision,
    });

    addGameToSummary(summary, game);
  }

  return summary;
}

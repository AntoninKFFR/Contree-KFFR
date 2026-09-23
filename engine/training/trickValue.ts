import { resolveContractMode } from "@/engine/contractMode";
import { playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { playerTeam, trickPoints } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { generateTrainingSeries, generatorVersion, type TrainingPosition } from "@/engine/training/generator";
import type { TrainingAxis } from "@/engine/training/registry";
import type { ContractMode, PlayedCard } from "@/engine/types";

export const TRICK_VALUE_SERIES_LENGTH = 10;

export type TrickValueExercise = {
  seed: number;
  generatorVersion: typeof generatorVersion;
  cards: PlayedCard[];
  contractMode: ContractMode;
  isLastTrick: boolean;
  bonusPoints: number;
  answer: number;
};

export function createTrickValueExercise(position: TrainingPosition): TrickValueExercise {
  let state = position.state;
  if (state.phase !== "playing" && !(state.phase === "finished" && state.completedTricks.length === 8)) {
    throw new Error("A trick-value exercise requires a playing position or a completed round.");
  }
  const mode = resolveContractMode(state);
  if (!mode) throw new Error("A trick-value exercise requires a contract mode.");

  if (state.completedTricks.length === 0) {
    const random = createSeededRandom(position.seed ^ 0x54524943);
    while (state.completedTricks.length === 0) {
      const legalCards = playableCardsForCurrentPlayer(state);
      state = playCard(state, state.currentPlayerId, legalCards[Math.floor(random() * legalCards.length)]);
    }
  }

  const trick = state.completedTricks.at(-1)!;
  const isLastTrick = state.completedTricks.length === 8;
  const rules = resolveGameRules(state.settings);
  const isCapot = isLastTrick
    && rules.trickScoring.capotLastTrickBonus !== rules.trickScoring.lastTrickBonus
    && state.completedTricks.slice(0, -1).every((played) => playerTeam(played.winnerId) === playerTeam(trick.winnerId));
  return {
    seed: position.seed,
    generatorVersion: position.generatorVersion,
    cards: trick.cards,
    contractMode: mode,
    isLastTrick,
    bonusPoints: isLastTrick ? (isCapot ? rules.trickScoring.capotLastTrickBonus : rules.trickScoring.lastTrickBonus) : 0,
    answer: trickPoints(trick.cards, mode, isLastTrick, isCapot, rules.trickScoring),
  };
}

export const trickValueAxis: TrainingAxis<TrickValueExercise> = {
  id: "trick-value",
  label: "Valeur d’un pli",
  createExercise: createTrickValueExercise,
};

export function generateTrickValueSeries(seed: number): TrickValueExercise[] {
  return generateTrainingSeries({ seed, generatorVersion, count: TRICK_VALUE_SERIES_LENGTH })
    .map(trickValueAxis.createExercise);
}

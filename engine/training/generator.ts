import { SUITS } from "@/engine/cards";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import type { GameState } from "@/engine/types";

export const generatorVersion = 1 as const;

export type TrainingPosition = {
  seed: number;
  generatorVersion: typeof generatorVersion;
  state: GameState;
};

export type TrainingGeneratorOptions = {
  seed: number;
  generatorVersion: number;
};

export function generateTrainingPosition(options: TrainingGeneratorOptions): TrainingPosition {
  const { seed, generatorVersion: requestedVersion } = options;
  if (requestedVersion !== generatorVersion) {
    throw new Error(`Unsupported training generator version: ${requestedVersion}`);
  }
  if (!Number.isSafeInteger(seed)) throw new Error("Training seed must be a safe integer.");

  const random = createSeededRandom(seed);
  let state = createInitialGame(random);
  const trump = SUITS[Math.floor(random() * SUITS.length)];
  state = makeBid(state, state.currentPlayerId, { action: "bid", value: 80, trump });
  for (let pass = 0; pass < 3; pass += 1) {
    state = makeBid(state, state.currentPlayerId, { action: "pass" });
  }

  const cardCount = Math.floor(random() * 25);
  for (let played = 0; played < cardCount; played += 1) {
    const legalCards = playableCardsForCurrentPlayer(state);
    const card = legalCards[Math.floor(random() * legalCards.length)];
    state = playCard(state, state.currentPlayerId, card);
  }
  return { seed, generatorVersion, state };
}

export function generateTrainingSeries(options: TrainingGeneratorOptions & { count: number }): TrainingPosition[] {
  if (!Number.isSafeInteger(options.count) || options.count < 0) {
    throw new Error("Training position count must be a nonnegative safe integer.");
  }
  return Array.from({ length: options.count }, (_, index) =>
    generateTrainingPosition({ seed: options.seed + index, generatorVersion: options.generatorVersion }),
  );
}

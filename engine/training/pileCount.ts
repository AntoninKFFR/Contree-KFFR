import { getBotProfile } from "@/bots/profiles";
import { chooseProfileBid } from "@/bots/strategy/biddingStrategy";
import { chooseProfileCardToPlay } from "@/bots/strategy/cardStrategy";
import { resolveContractMode } from "@/engine/contractMode";
import { createInitialGame, makeBid, playCard } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { playerTeam } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import type { TrainingAxis } from "@/engine/training/registry";
import type { Card, ContractStatus, GameState, PlayerId, Suit, TeamId } from "@/engine/types";

/**
 * Bump when the deal, the pinned bot or its heuristics change: every pile of a given seed changes with it.
 * `tests/trainingPileCount.test.ts` pins the totals of a reference series to catch such drifts.
 */
export const pileGeneratorVersion = 1 as const;
/** Pinned on purpose: piles must not follow the official bot, whose play keeps evolving. */
export const PILE_BOT_PROFILE_ID = "main" as const;
export const PILE_COUNT_SERIES_LENGTH = 10;
const MAX_ATTEMPTS = 100;
/** Series seeds are spaced wider than a series and its retries. */
export const PILE_COUNT_SEED_STRIDE = PILE_COUNT_SERIES_LENGTH * MAX_ATTEMPTS;

export const PILE_COUNT_MODES = ["beginner", "normal", "free"] as const;
export type PileCountMode = (typeof PILE_COUNT_MODES)[number];

export type PileCountExercise = {
  seed: number;
  generatorVersion: typeof pileGeneratorVersion;
  playerNames: Record<PlayerId, string>;
  trump: Suit;
  contractValue: number;
  contractStatus: ContractStatus;
  takerTeam: TeamId;
  /** The tricks won by the player's team, in the order they were won, each in play order. */
  cards: Card[];
  trickCount: number;
  hasTenDeDer: boolean;
  hasBelote: boolean;
  cardPoints: number;
  tenDeDerPoints: number;
  belotePoints: number;
  /** Card points + ten de der + belote, read from the engine's round result. */
  answer: number;
  /** For the "162 minus the other pile" tip: trick points only, belote excluded. */
  teamTrickPoints: number;
  otherTeamTrickPoints: number;
};

export function parsePileCountMode(value: unknown): PileCountMode | null {
  return typeof value === "string" && (PILE_COUNT_MODES as readonly string[]).includes(value) ? value as PileCountMode : null;
}

/** Deals from the seed and lets the pinned bot bid and play every card. Null when nobody takes. */
export function playBotRound(seed: number): GameState | null {
  if (!Number.isSafeInteger(seed)) throw new Error("Training seed must be a safe integer.");
  const profile = getBotProfile(PILE_BOT_PROFILE_ID);
  let state = createInitialGame(createSeededRandom(seed));
  try {
    while (state.phase === "bidding") {
      const bid = chooseProfileBid(state, profile);
      const playerId = state.currentPlayerId;
      state = bid.action === "bid" && bid.value && bid.trump
        ? makeBid(state, playerId, { action: "bid", value: bid.value, trump: bid.trump })
        : bid.action === "coinche" || bid.action === "surcoinche"
          ? makeBid(state, playerId, { action: bid.action })
          : makeBid(state, playerId, { action: "pass" });
    }
    if (state.phase !== "playing") return null;
    while (state.phase === "playing") {
      state = playCard(state, state.currentPlayerId, chooseProfileCardToPlay(state, profile));
    }
  } catch {
    // A bot decision the engine refuses only disqualifies this seed.
    return null;
  }
  return state;
}

/** Null when the round cannot make a pile exercise: no suit contract, capot, or no trick for the player's team. */
export function createPileCountExercise(seed: number, final: GameState): PileCountExercise | null {
  const result = final.result;
  const mode = resolveContractMode(final);
  if (result?.kind !== "played" || final.completedTricks.length !== 8 || mode?.kind !== "suit") return null;
  // A capot turns the ten de der into a 100-point bonus: kept out so that "10 de der" stays unambiguous.
  if (result.capotTeam !== null || !final.playerNames) return null;
  const won = final.completedTricks.filter((trick) => playerTeam(trick.winnerId) === 0);
  if (won.length === 0) return null;
  const hasTenDeDer = playerTeam(final.completedTricks[7].winnerId) === 0;
  const tenDeDerPoints = hasTenDeDer ? resolveGameRules(final.settings).trickScoring.lastTrickBonus : 0;
  const teamTrickPoints = result.trickPointsByTeam[0];
  const belotePoints = result.belotePointsByTeam[0];
  return {
    seed,
    generatorVersion: pileGeneratorVersion,
    playerNames: final.playerNames,
    trump: mode.suit,
    contractValue: result.contract.value,
    contractStatus: result.contract.status,
    takerTeam: result.contract.teamId,
    cards: won.flatMap((trick) => trick.cards.map(({ card }) => card)),
    trickCount: won.length,
    hasTenDeDer,
    hasBelote: belotePoints > 0,
    cardPoints: teamTrickPoints - tenDeDerPoints,
    tenDeDerPoints,
    belotePoints,
    answer: teamTrickPoints + belotePoints,
    teamTrickPoints,
    otherTeamTrickPoints: result.trickPointsByTeam[1],
  };
}

function selectExercise(seed: number): PileCountExercise {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidateSeed = seed + attempt * PILE_COUNT_SERIES_LENGTH;
    const final = playBotRound(candidateSeed);
    const exercise = final && createPileCountExercise(candidateSeed, final);
    if (exercise) return exercise;
  }
  throw new Error(`Could not generate a pile-count exercise for seed ${seed}.`);
}

export function generatePileCountSeries(options: { seed: number; generatorVersion: number }): PileCountExercise[] {
  if (options.generatorVersion !== pileGeneratorVersion) {
    throw new Error(`Unsupported pile generator version: ${options.generatorVersion}`);
  }
  if (!Number.isSafeInteger(options.seed)) throw new Error("Training seed must be a safe integer.");
  return Array.from({ length: PILE_COUNT_SERIES_LENGTH }, (_, index) => selectExercise(options.seed + index));
}

export const pileCountAxis: TrainingAxis<PileCountExercise> = {
  id: "pile-count",
  label: "Compter son tas",
  // Piles come from a bot-played round: only the position's seed is used, not its random-play state.
  createExercise: (position) => selectExercise(position.seed),
};

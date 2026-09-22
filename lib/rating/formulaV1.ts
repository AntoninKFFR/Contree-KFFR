/** Pure Elo V1 calculations. Inputs are the start-of-game snapshots. */
export const RATING_FORMULA_VERSION = 1 as const;
export type RatingSeatKind = "human" | "bot";
export type RatingTeam = 0 | 1;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

export function kFactor(ratedGamesBeforeStart: number): 40 | 36 | 32 {
  if (!Number.isSafeInteger(ratedGamesBeforeStart) || ratedGamesBeforeStart < 0) {
    throw new RangeError("ratedGamesBeforeStart must be a non-negative integer");
  }
  if (ratedGamesBeforeStart < 10) return 40;
  if (ratedGamesBeforeStart < 30) return 36;
  return 32;
}

/** Seat order is 0..3; team is seatIndex % 2. */
export function reliabilityFactor(seats: readonly RatingSeatKind[]): 1 | 0.95 | 0.85 | 0.6 | 0.2 {
  if (seats.length !== 4 || seats.some((seat) => seat !== "human" && seat !== "bot")) {
    throw new RangeError("Exactly four human/bot seats are required");
  }
  const humans = seats.flatMap((seat, index) => seat === "human" ? [index] : []);
  if (humans.length === 4) return 1;
  if (humans.length === 3) return 0.95;
  if (humans.length === 2) return humans[0] % 2 === humans[1] % 2 ? 0.6 : 0.85;
  if (humans.length === 1) return 0.2;
  throw new RangeError("An Elo match requires at least one human");
}

export function teamStrength(firstRating: number, secondRating: number): number {
  if (finite(firstRating, "firstRating") < 0 || finite(secondRating, "secondRating") < 0) {
    throw new RangeError("Ratings must be non-negative");
  }
  return (firstRating + secondRating) / 2;
}

export function expectedScore(ownTeamRating: number, opponentTeamRating: number): number {
  finite(ownTeamRating, "ownTeamRating");
  finite(opponentTeamRating, "opponentTeamRating");
  return 1 / (1 + 10 ** ((opponentTeamRating - ownTeamRating) / 400));
}

export function roundHalfAwayFromZero(value: number): number {
  finite(value, "value");
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.abs(value) + 0.5);
  return magnitude === 0 ? 0 : Math.sign(value) * magnitude;
}

export function eloDelta(input: {
  k: 40 | 36 | 32;
  reliability: 1 | 0.95 | 0.85 | 0.6 | 0.2;
  result: 0 | 1;
  expected: number;
}): number {
  const { k, reliability, result, expected } = input;
  if (![40, 36, 32].includes(k) || ![1, 0.95, 0.85, 0.6, 0.2].includes(reliability)
    || (result !== 0 && result !== 1) || !Number.isFinite(expected) || expected < 0 || expected > 1) {
    throw new RangeError("Invalid Elo V1 input");
  }
  return roundHalfAwayFromZero(k * reliability * (result - expected));
}

/** Absolute database floor, applied only after the theoretical V1 delta. */
export function effectiveRatingDelta(ratingBeforeApply: number, calculatedDelta: number): number {
  if (!Number.isSafeInteger(ratingBeforeApply) || ratingBeforeApply < 0
    || !Number.isSafeInteger(calculatedDelta)) {
    throw new RangeError("Invalid rating application input");
  }
  return Math.max(calculatedDelta, ratingBeforeApply === 0 ? 0 : -ratingBeforeApply);
}

/** normal deltas are rounded before the transfer; a bot contributes no loss. */
export function redistributeForfeit(
  forfeiterNormalDelta: number,
  partner: { kind: "human"; normalDelta: number } | { kind: "bot" },
): { forfeiterDelta: number; partnerDelta: number | null } {
  if (!Number.isSafeInteger(forfeiterNormalDelta) || forfeiterNormalDelta > 0) {
    throw new RangeError("Forfeiter normal delta must be a non-positive integer");
  }
  if (partner.kind === "bot") return { forfeiterDelta: forfeiterNormalDelta, partnerDelta: null };
  if (!Number.isSafeInteger(partner.normalDelta) || partner.normalDelta > 0) {
    throw new RangeError("Human partner normal delta must be a non-positive integer");
  }
  const transfer = roundHalfAwayFromZero(Math.abs(partner.normalDelta) / 2);
  return {
    forfeiterDelta: forfeiterNormalDelta - transfer,
    partnerDelta: partner.normalDelta + transfer,
  };
}

const RANK_THRESHOLDS = [
  [1750, "Capot de Capi I"], [1700, "Capot de Capi II"],
  [1650, "Capot de Capi III"], [1600, "Capot de Capi IV"],
  [1550, "Capot de Capi V"], [1500, "Sait jouer I"],
  [1450, "Sait jouer II"], [1400, "Sait jouer III"],
  [1350, "Sait jouer IV"], [1300, "Sait jouer V"],
  [1250, "Pas mauvais I"], [1200, "Pas mauvais II"],
  [1150, "Pas mauvais III"], [1100, "Pas mauvais IV"],
  [1050, "Pas mauvais V"], [1000, "Débutant I"],
  [950, "Débutant II"], [900, "Débutant III"],
  [850, "Débutant IV"],
] as const;

export function ratingRank(rating: number): string {
  if (!Number.isSafeInteger(rating) || rating < 0) throw new RangeError("Rating must be a non-negative integer");
  return RANK_THRESHOLDS.find(([minimum]) => rating >= minimum)?.[1] ?? "Débutant V";
}

/** Presentation progress using the same official thresholds as ratingRank. */
export function getRatingProgress(rating: number): {
  currentRank: string;
  currentThreshold: number | null;
  nextRank: string | null;
  nextThreshold: number | null;
  pointsIntoRank: number | null;
  pointsToNextRank: number | null;
  pointsRemaining: number | null;
  progress: number | null;
} {
  const currentRank = ratingRank(rating);
  const index = RANK_THRESHOLDS.findIndex(([minimum]) => rating >= minimum);
  if (index === -1) {
    return {
      currentRank, currentThreshold: null,
      nextRank: RANK_THRESHOLDS.at(-1)![1], nextThreshold: RANK_THRESHOLDS.at(-1)![0],
      pointsIntoRank: null, pointsToNextRank: null,
      pointsRemaining: RANK_THRESHOLDS.at(-1)![0] - rating, progress: null,
    };
  }
  const [currentThreshold] = RANK_THRESHOLDS[index];
  if (index === 0) {
    return {
      currentRank, currentThreshold, nextRank: null, nextThreshold: null,
      pointsIntoRank: null, pointsToNextRank: null, pointsRemaining: null, progress: null,
    };
  }
  const [nextThreshold, nextRank] = RANK_THRESHOLDS[index - 1];
  const pointsIntoRank = rating - currentThreshold;
  const pointsToNextRank = nextThreshold - currentThreshold;
  return {
    currentRank, currentThreshold, nextRank, nextThreshold,
    pointsIntoRank, pointsToNextRank,
    pointsRemaining: nextThreshold - rating,
    progress: pointsIntoRank / pointsToNextRank,
  };
}

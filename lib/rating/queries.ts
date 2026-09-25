import type { SupabaseClient } from "@supabase/supabase-js";

export type RatingSummary = {
  rating: number;
  ratedGames: number;
  wins: number;
  losses: number;
  forfeits: number;
  peakRating: number;
  rank: string | null;
  position: number | null;
  placementGames: number;
  isRanked: boolean;
  pendingMatches: number;
};

export type LeaderboardEntry = {
  username: string;
  rating: number;
  rank: string;
  position: number;
};

export type RatingMatchResult = {
  status: "pending" | "applied" | "void";
  ratingBefore: number | null;
  delta: number | null;
  ratingAfter: number | null;
  forfeited: boolean;
};

export const LEADERBOARD_DEFAULT_LIMIT = 50;
export const LEADERBOARD_MAX_LIMIT = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(record: Record<string, unknown>, key: string, minimum = 0): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`Invalid rating field: ${key}`);
  }
  return value as number;
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid rating field: ${key}`);
  return value;
}

function nullableInteger(record: Record<string, unknown>, key: string): number | null {
  if (record[key] === null) return null;
  return integer(record, key, 1);
}

function signedInteger(record: Record<string, unknown>, key: string): number {
  if (!Number.isSafeInteger(record[key])) throw new Error(`Invalid rating field: ${key}`);
  return record[key] as number;
}

export function parseRatingMatchResult(value: unknown): RatingMatchResult | null {
  if (value === null) return null;
  if (!isRecord(value) || !["pending", "applied", "void"].includes(String(value.status))
    || typeof value.forfeited !== "boolean") throw new Error("Invalid rating match result");
  const result: RatingMatchResult = {
    status: value.status as RatingMatchResult["status"],
    ratingBefore: value.rating_before === null ? null : integer(value, "rating_before"),
    delta: value.delta === null ? null : signedInteger(value, "delta"),
    ratingAfter: value.rating_after === null ? null : integer(value, "rating_after"),
    forfeited: value.forfeited,
  };
  if (result.status === "applied") {
    if (result.ratingBefore === null || result.delta === null || result.ratingAfter === null
      || result.ratingBefore + result.delta !== result.ratingAfter) throw new Error("Inconsistent rating match result");
  } else if (result.ratingBefore !== null || result.delta !== null || result.ratingAfter !== null) {
    throw new Error("Inconsistent rating match result");
  }
  return result;
}

export function parseRatingSummary(value: unknown): RatingSummary {
  if (!isRecord(value) || typeof value.is_ranked !== "boolean") {
    throw new Error("Invalid rating summary");
  }
  const summary: RatingSummary = {
    rating: integer(value, "rating"),
    ratedGames: integer(value, "rated_games"),
    wins: integer(value, "wins"),
    losses: integer(value, "losses"),
    forfeits: integer(value, "forfeits"),
    peakRating: integer(value, "peak_rating"),
    rank: nullableString(value, "rank"),
    position: nullableInteger(value, "position"),
    placementGames: integer(value, "placement_games"),
    isRanked: value.is_ranked,
    pendingMatches: integer(value, "pending_matches"),
  };
  if (
    summary.ratedGames !== summary.wins + summary.losses
    || summary.forfeits > summary.losses
    || summary.peakRating < summary.rating
    || summary.placementGames !== Math.min(summary.ratedGames, 5)
    || (summary.isRanked
      ? summary.ratedGames < 5 || summary.rank === null || summary.position === null
      : summary.rank !== null || summary.position !== null)
  ) {
    throw new Error("Inconsistent rating summary");
  }
  return summary;
}

export function parseLeaderboard(value: unknown): LeaderboardEntry[] {
  if (!Array.isArray(value) || value.length > LEADERBOARD_MAX_LIMIT) {
    throw new Error("Invalid rating leaderboard");
  }
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.username !== "string" || entry.username.length === 0
      || typeof entry.rank !== "string" || entry.rank.length === 0) {
      throw new Error("Invalid rating leaderboard entry");
    }
    return {
      username: entry.username,
      rating: integer(entry, "rating"),
      rank: entry.rank,
      position: integer(entry, "position", 1),
    };
  });
}

export async function getMyRatingSummary(supabase: SupabaseClient): Promise<RatingSummary> {
  const { data, error } = await supabase.rpc("get_my_rating_summary");
  if (error) throw error;
  return parseRatingSummary(data);
}

export async function getMyRatingMatchResult(
  supabase: SupabaseClient,
  sourceGameId: string,
): Promise<RatingMatchResult | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceGameId)) {
    throw new RangeError("Invalid source game id");
  }
  const { data, error } = await supabase.rpc("get_my_rating_match_result", { p_source_game_id: sourceGameId });
  if (error) throw error;
  return parseRatingMatchResult(data);
}

export async function getRatingLeaderboard(
  supabase: SupabaseClient,
  options: { limit?: number; offset?: number } = {},
): Promise<LeaderboardEntry[]> {
  const limit = options.limit ?? LEADERBOARD_DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > LEADERBOARD_MAX_LIMIT
    || !Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError("Invalid leaderboard pagination");
  }
  const { data, error } = await supabase.rpc("get_rating_leaderboard", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return parseLeaderboard(data);
}

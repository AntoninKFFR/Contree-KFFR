import { describe, expect, it, vi } from "vitest";
import {
  getMyRatingSummary,
  getMyRatingMatchResult,
  getRatingLeaderboard,
  parseLeaderboard,
  parseRatingMatchResult,
  parseRatingSummary,
} from "@/lib/rating/queries";
import { shouldRetryFinishedRating } from "@/components/multiplayer/useFinishedRatingResult";

const unranked = {
  rating: 1012,
  rated_games: 4,
  wins: 3,
  losses: 1,
  forfeits: 0,
  peak_rating: 1012,
  rank: null,
  position: null,
  placement_games: 4,
  is_ranked: false,
  pending_matches: 1,
};

describe("rating read queries", () => {
  it("accepts only bounded own-match projections and never invents an Elo delta", () => {
    expect(parseRatingMatchResult(null)).toBeNull();
    const pending = { status: "pending", rating_before: null, delta: null, rating_after: null, forfeited: false };
    expect(parseRatingMatchResult(pending)).toEqual({ status: "pending", ratingBefore: null,
      delta: null, ratingAfter: null, forfeited: false });
    expect(parseRatingMatchResult({ ...pending, status: "applied", rating_before: 1040,
      delta: -14, rating_after: 1026, user_id: "not projected" })).toEqual({
      status: "applied", ratingBefore: 1040, delta: -14, ratingAfter: 1026, forfeited: false,
    });
    expect(() => parseRatingMatchResult({ ...pending, status: "applied" })).toThrow("Inconsistent");
    expect(() => parseRatingMatchResult({ ...pending, status: "applied", rating_before: 1040,
      delta: -14, rating_after: 1030 })).toThrow("Inconsistent");
    expect(() => parseRatingMatchResult({ ...pending, delta: 0 })).toThrow("Inconsistent");
    expect(shouldRetryFinishedRating(parseRatingMatchResult(pending), 1)).toBe(true);
    expect(shouldRetryFinishedRating(parseRatingMatchResult(pending), 6)).toBe(false);
    expect(shouldRetryFinishedRating(null, 1)).toBe(false);
  });

  it("reads one source game through the viewer-only RPC", async () => {
    const gameId = "00000000-0000-4000-8000-000000000001";
    const rpc = vi.fn().mockResolvedValue({ data: { status: "applied", rating_before: 1012,
      delta: 18, rating_after: 1030, forfeited: false }, error: null });
    expect(await getMyRatingMatchResult({ rpc } as never, gameId)).toMatchObject({ delta: 18 });
    expect(rpc).toHaveBeenCalledWith("get_my_rating_match_result", { p_source_game_id: gameId });
    await expect(getMyRatingMatchResult({ rpc } as never, "not-a-uuid")).rejects.toThrow(RangeError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("maps the snake_case summary to the app type", () => {
    expect(parseRatingSummary(unranked)).toEqual({
      rating: 1012,
      ratedGames: 4,
      wins: 3,
      losses: 1,
      forfeits: 0,
      peakRating: 1012,
      rank: null,
      position: null,
      placementGames: 4,
      isRanked: false,
      pendingMatches: 1,
    });
  });

  it("supports the virtual initial state and ranked state", () => {
    expect(parseRatingSummary({ ...unranked, rating: 1000, rated_games: 0, wins: 0, losses: 0,
      peak_rating: 1000, placement_games: 0, pending_matches: 0 })).toMatchObject({
      rating: 1000, ratedGames: 0, placementGames: 0, isRanked: false,
    });
    expect(parseRatingSummary({ ...unranked, rated_games: 5, wins: 4, losses: 1,
      rank: "Débutant I", position: 7, placement_games: 5, is_ranked: true })).toMatchObject({
      ratedGames: 5, rank: "Débutant I", position: 7, isRanked: true,
    });
  });

  it("keeps a five-game player without a public username unranked", () => {
    expect(parseRatingSummary({
      rating: 1600,
      rated_games: 5,
      wins: 3,
      losses: 2,
      forfeits: 0,
      peak_rating: 1600,
      rank: null,
      position: null,
      placement_games: 5,
      is_ranked: false,
      pending_matches: 0,
    })).toEqual({
      rating: 1600,
      ratedGames: 5,
      wins: 3,
      losses: 2,
      forfeits: 0,
      peakRating: 1600,
      rank: null,
      position: null,
      placementGames: 5,
      isRanked: false,
      pendingMatches: 0,
    });
  });

  it("rejects inconsistent summaries", () => {
    expect(() => parseRatingSummary({ ...unranked, placement_games: 5 })).toThrow("Inconsistent");
    expect(() => parseRatingSummary({ ...unranked, rank: "Débutant I" })).toThrow("Inconsistent");
    expect(() => parseRatingSummary({ ...unranked, is_ranked: true,
      rank: "Débutant I", position: 1 })).toThrow("Inconsistent");
    expect(() => parseRatingSummary({ ...unranked, rated_games: 5, wins: 4,
      placement_games: 5, rank: "Débutant I", position: 1 })).toThrow("Inconsistent");
  });

  it("maps only the four public leaderboard fields", () => {
    expect(parseLeaderboard([{ username: "Alice", rating: 1500, rank: "Sait jouer I", position: 1,
      user_id: "hidden", email: "hidden@example.test", rated_games: 99 }])).toEqual([
      { username: "Alice", rating: 1500, rank: "Sait jouer I", position: 1 },
    ]);
  });

  it("calls the authenticated summary RPC without a user id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: unranked, error: null });
    const result = await getMyRatingSummary({ rpc } as never);
    expect(rpc).toHaveBeenCalledWith("get_my_rating_summary");
    expect(result.ratedGames).toBe(4);
  });

  it("applies default and explicit leaderboard pagination", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = { rpc } as never;
    await getRatingLeaderboard(client);
    await getRatingLeaderboard(client, { limit: 25, offset: 10 });
    expect(rpc).toHaveBeenNthCalledWith(1, "get_rating_leaderboard", { p_limit: 50, p_offset: 0 });
    expect(rpc).toHaveBeenNthCalledWith(2, "get_rating_leaderboard", { p_limit: 25, p_offset: 10 });
  });

  it("rejects unsafe pagination before making a request", async () => {
    const rpc = vi.fn();
    const client = { rpc } as never;
    await expect(getRatingLeaderboard(client, { limit: 101 })).rejects.toThrow(RangeError);
    await expect(getRatingLeaderboard(client, { offset: -1 })).rejects.toThrow(RangeError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propagates RPC failures", async () => {
    const error = new Error("denied");
    await expect(getMyRatingSummary({ rpc: vi.fn().mockResolvedValue({ data: null, error }) } as never))
      .rejects.toBe(error);
  });
});

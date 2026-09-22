import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { parseLeaderboard, parseRatingSummary, type LeaderboardEntry, type RatingSummary } from "../../lib/rating/queries";

function publicSupabaseConfig(): { url: string; key: string } {
  let local = "";
  // A remote E2E_BASE_URL may point at a different Supabase project. Never
  // silently reuse this checkout's .env.local for that target.
  if (!process.env.E2E_BASE_URL) {
    try { local = readFileSync(".env.local", "utf8"); } catch { /* Public values may be supplied by the environment. */ }
  }
  const value = (name: string): string | undefined => {
    if (process.env[name]) return process.env[name];
    const line = local.split(/\r?\n/).find((entry) => entry.trimStart().startsWith(`${name}=`));
    return line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  };
  const url = value("NEXT_PUBLIC_SUPABASE_URL");
  const key = value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Missing public Supabase URL or publishable key for rating E2E.");
  return { url, key };
}

async function userRequest(page: Page, path: string, body?: unknown): Promise<unknown> {
  const { url, key } = publicSupabaseConfig();
  return page.evaluate(async ({ baseUrl, publishableKey, targetPath, payload }) => {
    const storageKey = Object.keys(localStorage).find((item) => item.startsWith("sb-") && item.endsWith("-auth-token"));
    if (!storageKey) throw new Error("Authenticated rating E2E session is missing.");
    const session = JSON.parse(localStorage.getItem(storageKey) ?? "null") as { access_token?: string };
    if (!session?.access_token) throw new Error("Authenticated rating E2E session has no access token.");
    const response = await fetch(new URL(targetPath, baseUrl), {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Rating client request failed with HTTP ${response.status}.`);
    return response.json();
  }, { baseUrl: url, publishableKey: key, targetPath: path, payload: body });
}

export async function ratingSummary(page: Page): Promise<RatingSummary> {
  return parseRatingSummary(await userRequest(page, "/rest/v1/rpc/get_my_rating_summary", {}));
}

export async function ratingLeaderboard(page: Page, limit = 50, offset = 0): Promise<LeaderboardEntry[]> {
  const result = await userRequest(page, "/rest/v1/rpc/get_rating_leaderboard", { p_limit: limit, p_offset: offset });
  if (!Array.isArray(result) || result.some((entry) =>
    !entry || typeof entry !== "object" || Array.isArray(entry)
    || Object.keys(entry).sort().join(",") !== "position,rank,rating,username")) {
    throw new Error("Leaderboard exposed fields outside its four-field public contract.");
  }
  return parseLeaderboard(result);
}

export async function ownPublicUsername(page: Page): Promise<string | null> {
  const result = await userRequest(page, "/rest/v1/profiles?select=username&limit=1");
  if (!Array.isArray(result) || result.length !== 1 || typeof result[0] !== "object" || result[0] === null) {
    throw new Error("Own profile username could not be read.");
  }
  const username = (result[0] as { username?: unknown }).username;
  if (username !== null && typeof username !== "string") throw new Error("Invalid own public username.");
  return username;
}

export async function waitForNoPending(page: Page, label: string): Promise<RatingSummary> {
  await expect.poll(async () => (await ratingSummary(page)).pendingMatches, {
    message: `${label}: pending Elo did not resolve before the rated game; run the operator retry separately`,
    timeout: 45_000,
    intervals: [500, 1000, 2000],
  }).toBe(0);
  return ratingSummary(page);
}

export async function waitForApplied(page: Page, ratedGamesBefore: number, label: string): Promise<RatingSummary> {
  await expect.poll(async () => {
    const summary = await ratingSummary(page);
    return [summary.ratedGames, summary.pendingMatches];
  }, {
    message: `${label}: finished game Elo was not applied within the timeout`,
    timeout: 60_000,
    intervals: [500, 1000, 2000],
  }).toEqual([ratedGamesBefore + 1, 0]);
  return ratingSummary(page);
}

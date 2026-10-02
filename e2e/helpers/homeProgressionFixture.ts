import type { Page } from "@playwright/test";
import type { WeeklySnapshot } from "../../lib/progression/weeklyMissions";
import { installMobileNavigationFixture } from "./mobileNavigationFixture";

export type HomeProgressionState = "ready" | "loading" | "error" | "weekly-unavailable" | "weekly-empty" | "weekly-complete";

// UI-only network fixtures use the existing auth and standalone simulation.
export async function installHomeProgressionFixture(page: Page, options: { theme?: "dark" | "light"; authenticated?: boolean; xp?: number; state?: HomeProgressionState; standalone?: boolean } = {}) {
  const base = await installMobileNavigationFixture(page, { ...options, xp: options.xp ?? 5, notifications: false });
  let state = options.state ?? "ready";
  const snapshot: WeeklySnapshot = {
    catalogVersion: 1, weekStart: "2026-09-28", serverNow: "2026-09-30T12:00:00Z", nextResetAt: "2026-10-04T22:00:00Z",
    missions: [
      { key: "training_series", target: 3, progress: 3, rewardXp: 200, completed: true, completedAt: "2026-09-30T10:00:00Z" },
      { key: "multiplayer_games", target: 3, progress: 2, rewardXp: 200, completed: false, completedAt: null },
      { key: "solo_games", target: 3, progress: 1, rewardXp: 200, completed: false, completedAt: null },
    ],
  };
  let releaseLoading: (() => void) | undefined;
  const loading = new Promise<void>((resolve) => { releaseLoading = resolve; });
  const reads: string[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith("/get_my_progression") && !path.endsWith("/get_my_weekly_missions")) { await route.fallback(); return; }
    if (route.request().method() !== "OPTIONS") reads.push(path);
    if (state === "loading") await loading;
    if ((state === "error" && path.endsWith("/get_my_progression")) || (state === "weekly-unavailable" && path.endsWith("/get_my_weekly_missions"))) {
      await route.fulfill({ status: 500, json: { message: "Presentation fixture unavailable" }, headers: cors(route.request().headers()) }); return;
    }
    const missions = state === "weekly-complete" ? snapshot.missions.map((mission) => ({ ...mission, progress: mission.target, completed: true, completedAt: "2026-09-30T10:00:00Z" })) : snapshot.missions;
    await route.fulfill({ status: 200, json: path.endsWith("/get_my_progression") ? { total_xp: options.xp ?? 5 } : state === "weekly-empty" ? null : { ...snapshot, missions }, headers: cors(route.request().headers()) });
  });
  return { ...base, snapshot, reads, setState: (next: HomeProgressionState) => { state = next; releaseLoading?.(); } };
}

function cors(headers: Record<string, string>) {
  return { "Access-Control-Allow-Origin": headers.origin ?? "*", "Access-Control-Allow-Headers": headers["access-control-request-headers"] ?? "authorization, apikey, x-client-info, content-type, prefer, x-supabase-api-version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
}

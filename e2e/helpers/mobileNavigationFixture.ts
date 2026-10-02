import type { Page } from "@playwright/test";
import { withEquipment, cosmeticsFixture } from "../../tests/helpers/profileCosmetics";
import { getProgression } from "../../lib/progression/formulaV1";
import { clonePlayerPreferences, PLAYER_PREFERENCES_STORAGE_KEY } from "../../lib/preferences/playerPreferences";
import { installMobileRoomFixture } from "./mobileRoomFixture";
import { IPHONE_UA, simulatePwaEnvironment } from "./pwa";

export const LONG_NAVIGATION_USERNAME = "Navigation".repeat(4); // Actual 40-character limit.
export const NAVIGATION_FRIEND_ID = "44444444-4444-4444-8444-444444444444";

export async function installMobileNavigationFixture(page: Page, { authenticated = true, theme = "dark", xp = 22750, username = LONG_NAVIGATION_USERNAME, notifications = true, standalone = true }:
  { authenticated?: boolean; theme?: "dark" | "light"; xp?: number; username?: string; notifications?: boolean; standalone?: boolean } = {}) {
  if (standalone) await simulatePwaEnvironment(page, { ua: IPHONE_UA, standalone: "ios" });
  const room = await installMobileRoomFixture(page, { seedSession: authenticated });
  const preferences = clonePlayerPreferences(); preferences.visual.theme = theme;
  await page.addInitScript(({ key, preferences }) => localStorage.setItem(key, JSON.stringify(preferences)), { key: PLAYER_PREFERENCES_STORAGE_KEY, preferences });
  const summary = getProgression(xp);
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/profiles") ? [{ id: room.user.id, username }]
      : path.endsWith("/get_my_progression") ? { total_xp: xp }
      : path.endsWith("/get_my_unlocked_profile_cosmetics") ? summary.level > 1 ? withEquipment(summary.level) : cosmeticsFixture(1)
      : undefined;
    if (data === undefined) { await route.fallback(); return; }
    await route.fulfill({ status: 200, json: data, headers: {
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "*",
      "Access-Control-Allow-Headers": route.request().headers()["access-control-request-headers"] ?? "authorization, apikey, x-client-info, content-type, prefer, x-supabase-api-version",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
    } });
  });
  await page.route("**/api/social**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const emptyStats = { games: 0, wins: 0, losses: 0, winrate: 0 };
    const data = path === "/api/social" ? {
      friends: [], received: notifications ? [{ id: "notification-fixture", userId: NAVIGATION_FRIEND_ID, username: "Ami de navigation", createdAt: new Date().toISOString() }] : [],
      sent: [], counts: { friends: 0, received: notifications ? 1 : 0, sent: 0 },
    } : path === "/api/social/invitations" ? { invitations: [], counts: { receivedPending: 0, sentPending: 0 } }
      : path === `/api/social/friends/${NAVIGATION_FRIEND_ID}/profile` ? { userId: NAVIGATION_FRIEND_ID, username: "Ami de navigation", level: 1,
        equipped: { title: null, badge: null, frame: null }, solo: emptyStats, multiplayer: emptyStats, rating: null }
      : undefined;
    if (data === undefined) { await route.fallback(); return; }
    await route.fulfill({ status: 200, json: { data } });
  });
  return { ...room, summary };
}

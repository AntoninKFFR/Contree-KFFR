import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loginAs } from "./helpers/auth";
import { createRoomThroughUi } from "./helpers/multiplayerUi";
import { bestEffortFinishRoom } from "./helpers/room";

type FriendData = { friends: Array<{ userId: string }> };

async function socialApi<T>(page: Page, path: string, method = "GET", body?: unknown): Promise<T> {
  const result = await page.evaluate(async ({ path, method, body }) => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("sb-") && item.endsWith("-auth-token"))!;
    const token = (JSON.parse(localStorage.getItem(key) ?? "null") as { access_token: string }).access_token;
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, payload: await response.json() };
  }, { path, method, body });
  expect(result.status, `${method} ${path}`).toBe(200);
  return result.payload.data as T;
}

async function identity(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("sb-") && item.endsWith("-auth-token"))!;
    return (JSON.parse(localStorage.getItem(key) ?? "null") as { user: { id: string } }).user.id;
  });
}

function assertInsideViewport(box: { x: number; y: number; width: number; height: number } | null, width: number, height: number) {
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
}

test.describe("@social private friend presence", () => {
  test("online friend leads both lists, offline friend remains invitable, mobile and themes fit", async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Presence E2E requires disposable local Supabase");
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const credentials: Array<{ email: string; password: string }> = [];
    const createdIds: string[] = [];
    const contexts: BrowserContext[] = [];
    const rooms: string[] = [];
    let a: Page | null = null;
    let b: Page | null = null;
    let bId: string | null = null;
    try {
      for (let index = 0; index < 2; index += 1) {
        const suffix = randomUUID().slice(0, 8);
        const identity = { email: `social-presence-${suffix}@example.test`, password: `Local-${randomUUID()}-test`, username: `Presence${index}${suffix}` };
        const created = await admin.auth.admin.createUser({ email: identity.email, password: identity.password, email_confirm: true, user_metadata: { username: identity.username } });
        if (created.error) throw created.error;
        createdIds.push(created.data.user.id);
        credentials.push(identity);
      }
      for (const credential of credentials) {
        const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
        contexts.push(context);
        const page = await context.newPage();
        await loginAs(page, credential);
        if (!a) a = page; else b = page;
      }
      if (!a || !b) throw new Error("Two authenticated pages required");
      const aId = await identity(a);
      bId = await identity(b);
      const usernameB = (await b.locator('.progression-account-name').first().innerText()).trim();
      if ((await socialApi<FriendData>(a, "/api/social")).friends.some((friend) => friend.userId === bId)) {
        await socialApi(a, `/api/social/friends/${bId}`, "DELETE");
      }
      await b.goto("/training");
      const sent = await socialApi<{ id: string }>(a, "/api/social/friend-requests", "POST", { recipientId: bId });
      await socialApi(b, `/api/social/friend-requests/${sent.id}/accept`, "POST");
      await socialApi(b, "/api/social/presence", "POST");
      await expect.poll(async () => (await socialApi<Array<{ user_id: string }>>(a!, "/api/social/presence")).some((item) => item.user_id === bId)).toBe(true);

      await a.goto("/friends");
      const friendRow = a.locator(".friend-presence-row").filter({ hasText: usernameB });
      await expect(friendRow).toContainText("En ligne");
      await expect(a.getByRole("heading", { name: "En ligne · 1" })).toBeVisible();
      expect(await friendRow.locator(".friend-presence-dot--online").count()).toBe(1);
      for (const theme of ["dark", "light"]) {
        await a.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
        const dot = friendRow.locator(".friend-presence-dot--online");
        await expect(dot).toBeVisible();
        const colors = await dot.evaluate((element) => {
          const reference = document.createElement("span");
          reference.style.backgroundColor = "var(--success)";
          document.body.append(reference);
          const actual = getComputedStyle(element).backgroundColor;
          const expected = getComputedStyle(reference).backgroundColor;
          reference.remove();
          return { actual, expected };
        });
        expect(colors.actual).toBe(colors.expected);
      }
      await a.getByLabel("Pseudo").fill(usernameB);
      const searchRow = a.locator("li.coinche-social-row").filter({ hasText: usernameB });
      await expect(searchRow).toBeVisible();
      expect(await searchRow.locator(".friend-presence-dot").count()).toBe(0);
      expect(await searchRow.getByText("En ligne").count()).toBe(0);

      // A UI-only long-list fixture proves the list actually scrolls without
      // creating a hundred database accounts or changing invitation rights.
      const longList = [{ userId: bId, username: usernameB, createdAt: "now" }, ...Array.from({ length: 99 }, (_, index) => ({
        userId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        username: `Fixture${String(index).padStart(3, "0")}`,
        createdAt: "now",
      }))];
      await a.route("**/api/social", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {
        friends: longList, received: [], sent: [], counts: { friends: 100, received: 0, sent: 0 },
      } }) }));
      await a.reload();
      await expect(a.locator(".friend-presence-row")).toHaveCount(100);
      for (const [width, height] of [[1280, 720], [390, 844], [667, 375], [844, 390]]) {
        await a.setViewportSize({ width, height });
        await expect(a.locator("[data-testid=friends-presence-scroll]")).toBeVisible();
        await expect.poll(async () => a!.locator("[data-testid=friends-presence-scroll]").evaluate((node) =>
          node.scrollHeight > node.clientHeight && node.scrollWidth <= node.clientWidth)).toBe(true);
      }
      await a.unroute("**/api/social");
      await a.setViewportSize({ width: 1280, height: 720 });
      await a.reload();
      await expect(a.locator(".friend-presence-row")).toHaveCount(1);

      const room = await createRoomThroughUi(a);
      rooms.push(room.roomId);
      await a.getByRole("button", { name: "Inviter des amis" }).click();
      let dialog = a.getByRole("dialog", { name: "Inviter des amis" });
      await expect(dialog.getByRole("textbox", { name: "Rechercher un ami" })).toBeVisible();
      await expect(dialog.locator(".friend-presence-row").filter({ hasText: usernameB })).toContainText("En ligne");
      await expect(dialog.getByRole("heading", { name: "En ligne · 1" })).toBeVisible();
      await dialog.getByRole("textbox", { name: "Rechercher un ami" }).fill("zzzz-no-match");
      await expect(dialog.getByText("Aucun ami correspondant.")).toBeVisible();
      await dialog.getByRole("textbox", { name: "Rechercher un ami" }).fill(usernameB.toUpperCase());
      await expect(dialog.locator(".friend-presence-row")).toHaveCount(1);
      await dialog.getByRole("button", { name: "Inviter", exact: true }).click();
      await expect(dialog.getByText("Invitation envoyée")).toBeVisible();
      await dialog.getByRole("button", { name: "Fermer", exact: true }).click();

      await b.close();
      b = null;
      const aged = await admin.from("social_presence").update({ last_seen_at: new Date(Date.now() - 120_000).toISOString() }).eq("user_id", bId);
      if (aged.error) throw aged.error;
      await a.goto("/friends");
      await expect(a.locator(".friend-presence-row").filter({ hasText: usernameB })).toContainText("Hors ligne");
      await expect(a.getByRole("heading", { name: "Hors ligne · 1" })).toBeVisible();

      for (const [width, height] of [[390, 844], [667, 375], [844, 390]]) {
        await a.setViewportSize({ width, height });
        await a.locator("[data-testid=friends-presence-scroll]").scrollIntoViewIfNeeded();
        assertInsideViewport(await a.locator("[data-testid=friends-presence-scroll]").boundingBox(), width, height);
        for (const button of await a.locator(".friend-presence-row button").all()) {
          assertInsideViewport(await button.boundingBox(), width, height);
        }
        expect(await a.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await a.setViewportSize({ width: 1280, height: 720 });
      const offlineRoom = await createRoomThroughUi(a);
      rooms.push(offlineRoom.roomId);
      await a.getByRole("button", { name: "Inviter des amis" }).click();
      dialog = a.getByRole("dialog", { name: "Inviter des amis" });
      await expect(dialog.locator(".friend-presence-row").filter({ hasText: usernameB })).toContainText("Hors ligne");
      await expect(dialog.getByRole("button", { name: "Inviter", exact: true })).toBeEnabled();
      for (const [width, height] of [[390, 844], [667, 375], [844, 390]]) {
        await a.setViewportSize({ width, height });
        assertInsideViewport(await dialog.boundingBox(), width, height);
        assertInsideViewport(await dialog.getByRole("textbox", { name: "Rechercher un ami" }).boundingBox(), width, height);
        const button = await dialog.getByRole("button", { name: "Inviter", exact: true }).boundingBox();
        assertInsideViewport(button, width, height);
        expect(button!.height).toBeGreaterThanOrEqual(44);
        expect(await a.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await a.setViewportSize({ width: 1280, height: 720 });
      await dialog.getByRole("button", { name: "Inviter", exact: true }).click();
      await expect(dialog.getByText("Invitation envoyée")).toBeVisible();
      await dialog.getByRole("button", { name: "Fermer", exact: true }).click();

      await a.goto("/friends");
      const offlineRow = a.locator(".friend-presence-row").filter({ hasText: usernameB });
      await expect(offlineRow).toContainText("Hors ligne");
      for (const theme of ["dark", "light"]) {
        await a.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
        const dot = offlineRow.locator(".friend-presence-dot");
        await expect(dot).toBeVisible();
        const colors = await dot.evaluate((element) => ({
          dot: getComputedStyle(element).backgroundColor,
          muted: getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim(),
        }));
        expect(colors.dot).not.toBe("rgba(0, 0, 0, 0)");
        expect(colors.muted).not.toBe("");
      }
      await socialApi(a, `/api/social/friends/${bId}`, "DELETE");
      await a.evaluate(() => window.dispatchEvent(new Event("kffr:social-changed")));
      await expect(a.locator(".friend-presence-row")).toHaveCount(0);
      expect((await socialApi<Array<{ user_id: string }>>(a, "/api/social/presence")).some((item) => item.user_id === bId)).toBe(false);
      expect(aId).not.toBe(bId);
    } finally {
      if (a) for (const roomId of rooms) await bestEffortFinishRoom([a], roomId);
      await Promise.allSettled(contexts.map(async (context) => { if (context.browser()?.isConnected()) await context.close(); }));
      for (const id of createdIds) await admin.auth.admin.deleteUser(id);
    }
  });
});

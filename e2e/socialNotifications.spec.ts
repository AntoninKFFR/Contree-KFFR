import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";
import { loginAs, twoPlayerCredentials } from "./helpers/auth";
import { createRoomThroughUi } from "./helpers/multiplayerUi";
import { bestEffortFinishRoom } from "./helpers/room";

const auth = twoPlayerCredentials();

type SocialData = { friends: Array<{ userId: string }>; received: Array<{ id: string; userId: string }>; sent: Array<{ id: string; userId: string }> };
type InvitationsData = { invitations: Array<{ id: string; roomId: string; status: string }> };

async function socialApi<T>(page: Page, path: string, method = "GET", body?: unknown): Promise<T> {
  const result = await page.evaluate(async ({ path, method, body }) => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("sb-") && item.endsWith("-auth-token"));
    if (!key) throw new Error("Missing E2E auth session");
    const session = JSON.parse(localStorage.getItem(key) ?? "null") as { access_token: string };
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, payload: await response.json() };
  }, { path, method, body });
  expect(result.status, `${method} ${path}`).toBe(200);
  return result.payload.data as T;
}

function monitorSocialPrivacy(page: Page) {
  const checks: Promise<void>[] = [];
  page.on("response", (response: Response) => {
    if (!new URL(response.url()).pathname.startsWith("/api/social")) return;
    checks.push(response.json().then((body: unknown) => {
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        for (const [key, nested] of Object.entries(value)) {
          expect(["email", "access_token", "refresh_token", "GameState", "hands", "cards", "private_cards"], `social response leaked ${key}`).not.toContain(key);
          visit(nested);
        }
      };
      visit(body);
    }));
  });
  return async () => { await Promise.all(checks); expect(checks.length).toBeGreaterThan(0); };
}

async function awaitBaseline(page: Page) {
  const social = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/social" && response.status() === 200);
  const games = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/social/invitations" && response.status() === 200);
  await page.reload();
  await Promise.all([social, games]);
  await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
}

test.describe("@social global notifications with two accounts", () => {
  test.skip(auth.missing.length > 0, `Missing authenticated E2E variables: ${auth.missing.join(", ")}`);
  test.describe.configure({ mode: "serial" });

  test("friend and invitation arrive off /friends, actions resolve through the existing room flow, refusals clear pending", async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const contexts: BrowserContext[] = [];
    const rooms: string[] = [];
    let a: Page | null = null;
    let b: Page | null = null;
    try {
      for (const credentials of auth.credentials) {
        const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
        contexts.push(context);
        const page = await context.newPage();
        await loginAs(page, credentials);
        if (!a) a = page; else b = page;
      }
      if (!a || !b) throw new Error("Two authenticated pages required");
      const assertSafeA = monitorSocialPrivacy(a);
      const assertSafeB = monitorSocialPrivacy(b);
      await expect.poll(async () => (await a!.locator('a[href="/profile"]').first().innerText()).trim()).not.toBe("Profil");
      await expect.poll(async () => (await b!.locator('a[href="/profile"]').first().innerText()).trim()).not.toBe("Profil");
      const usernameA = (await a.locator('a[href="/profile"]').first().innerText()).trim();
      const usernameB = (await b.locator('a[href="/profile"]').first().innerText()).trim();
      const identityA = await socialApi<{ friends: Array<{ userId: string }> }>(a, "/api/social");
      const identityB = await socialApi<{ friends: Array<{ userId: string }> }>(b, "/api/social");
      const aId = (await a.evaluate(() => {
        const key = Object.keys(localStorage).find((item) => item.startsWith("sb-") && item.endsWith("-auth-token"))!;
        return (JSON.parse(localStorage.getItem(key) ?? "null") as { user: { id: string } }).user.id;
      }));
      const bId = (await b.evaluate(() => {
        const key = Object.keys(localStorage).find((item) => item.startsWith("sb-") && item.endsWith("-auth-token"))!;
        return (JSON.parse(localStorage.getItem(key) ?? "null") as { user: { id: string } }).user.id;
      }));
      if (identityA.friends.some((friend) => friend.userId === bId) || identityB.friends.some((friend) => friend.userId === aId)) {
        await socialApi(a, `/api/social/friends/${bId}`, "DELETE");
      }
      const oldA = await socialApi<SocialData>(a, "/api/social");
      const oldB = await socialApi<SocialData>(b, "/api/social");
      for (const request of oldA.sent.filter((item) => item.userId === bId)) await socialApi(a, `/api/social/friend-requests/${request.id}/cancel`, "POST");
      for (const request of oldB.sent.filter((item) => item.userId === aId)) await socialApi(b, `/api/social/friend-requests/${request.id}/cancel`, "POST");
      await b.goto("/training");
      await awaitBaseline(b);

      await a.goto("/friends");
      await a.getByLabel("Pseudo").fill(usernameB);
      await a.locator("li").filter({ hasText: usernameB }).getByRole("button", { name: "Ajouter" }).click();
      const friendToast = b.locator(".social-notification-toast").filter({ hasText: usernameA });
      await expect(friendToast).toBeVisible({ timeout: 15_000 });
      await expect(b.locator(".social-notification-badge")).toHaveText("1");
      await friendToast.getByRole("button", { name: `Accepter la demande de ${usernameA}` }).click();
      await expect(friendToast).toHaveCount(0);
      await expect(b.locator(".social-notification-badge")).toHaveCount(0);
      await expect.poll(async () => (await socialApi<SocialData>(b!, "/api/social")).friends.some((friend) => friend.userId === aId)).toBe(true);
      await expect(b).toHaveURL(/\/training$/);

      const room = await createRoomThroughUi(a);
      rooms.push(room.roomId);
      await a.getByRole("button", { name: "Inviter des amis" }).click();
      await a.getByRole("dialog", { name: "Inviter des amis" }).locator("li").filter({ hasText: usernameB }).getByRole("button", { name: "Inviter" }).click();
      const inviteToast = b.locator(".social-notification-toast").filter({ hasText: usernameA });
      await expect(inviteToast).toContainText("Invitation de partie", { timeout: 15_000 });
      const beforeSeat = await socialApi<InvitationsData>(b, "/api/social/invitations");
      const invitation = beforeSeat.invitations.find((item) => item.roomId === room.roomId && item.status === "pending");
      expect(invitation).toBeDefined();
      await inviteToast.getByRole("button", { name: `Rejoindre la partie de ${usernameA}` }).click();
      await expect(b).toHaveURL(new RegExp(`/multiplayer/${room.roomId}\\?invitation=${invitation!.id}`));
      expect((await socialApi<InvitationsData>(b, "/api/social/invitations")).invitations.find((item) => item.id === invitation!.id)?.status).toBe("pending");
      await b.getByRole("button", { name: "S'asseoir" }).click();
      await expect.poll(async () => (await socialApi<InvitationsData>(b!, "/api/social/invitations")).invitations.find((item) => item.id === invitation!.id)?.status).toBe("accepted");

      await b.goto("/training");
      const declinedRoom = await createRoomThroughUi(a);
      rooms.push(declinedRoom.roomId);
      await a.getByRole("button", { name: "Inviter des amis" }).click();
      await a.getByRole("dialog", { name: "Inviter des amis" }).locator("li").filter({ hasText: usernameB }).getByRole("button", { name: "Inviter" }).click();
      const declineToast = b.locator(".social-notification-toast").filter({ hasText: usernameA });
      await expect(declineToast).toContainText("Invitation de partie", { timeout: 15_000 });
      await declineToast.getByRole("button", { name: `Refuser l’invitation de ${usernameA}` }).click();
      await expect(declineToast).toHaveCount(0);
      await expect(b.locator(".social-notification-badge")).toHaveCount(0);

      await socialApi(a, `/api/social/friends/${bId}`, "DELETE");
      await a.goto("/friends");
      await a.getByLabel("Pseudo").fill(usernameB);
      await a.locator("li").filter({ hasText: usernameB }).getByRole("button", { name: "Ajouter" }).click();
      const refusalToast = b.locator(".social-notification-toast").filter({ hasText: usernameA });
      await expect(refusalToast).toContainText("Nouvelle demande", { timeout: 15_000 });
      await refusalToast.getByRole("button", { name: `Refuser la demande de ${usernameA}` }).click();
      await expect(refusalToast).toHaveCount(0);
      await expect(b.locator(".social-notification-badge")).toHaveCount(0);
      await expect(b).toHaveURL(/\/training$/);

      // A pending item is cleared on logout and restored as baseline, without a retroactive toast.
      const addAgain = a.locator("li").filter({ hasText: usernameB }).getByRole("button", { name: "Ajouter" });
      await expect(addAgain).toBeVisible();
      await addAgain.click();
      await expect(b.locator(".social-notification-toast")).toContainText("Nouvelle demande", { timeout: 15_000 });
      await b.goto("/profile");
      await b.getByRole("button", { name: "Se déconnecter" }).click();
      await expect(b.getByRole("button", { name: "Notifications" })).toHaveCount(0);
      await expect(b.locator(".social-notification-toast")).toHaveCount(0);
      await loginAs(b, auth.credentials[1]);
      await expect(b.locator(".social-notification-badge")).toHaveText("1");
      await expect(b.locator(".social-notification-toast")).toHaveCount(0);
      await b.getByRole("button", { name: "Notifications" }).click();
      await b.locator("#social-notification-center").getByRole("button", { name: `Refuser la demande de ${usernameA}` }).click();
      await expect(b.locator(".social-notification-badge")).toHaveCount(0);
      await assertSafeA(); await assertSafeB();
    } finally {
      if (a && b) for (const roomId of rooms) await bestEffortFinishRoom([a, b], roomId);
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});

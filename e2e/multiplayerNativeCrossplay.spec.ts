import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { memoryMultiplayerServer, TEST_ROOM_ID } from "../tests/helpers/nativeMultiplayerServer";
import { installMobileNavigationFixture } from "./helpers/mobileNavigationFixture";

test("actual web and native controls share one authoritative fixture through HTTP and the real Realtime SDK", async ({ browser }) => {
  test.setTimeout(90000);
  const server = memoryMultiplayerServer(71, Date.now()), pc = await browser.newPage({ viewport: { width: 1280, height: 800 } }), ios = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await installMobileNavigationFixture(pc, { username: "Alice", notifications: false, standalone: false });
  type Socket = { route: WebSocketRoute; topic: string; array: boolean; joinRef: unknown; filters: { id: number }[] };
  const sockets: Socket[] = [];
  function changed() {
    for (const socket of sockets) {
      const payload = { ids: socket.filters.map((f) => f.id), data: { schema: "public", table: "rooms", type: "UPDATE", commit_timestamp: new Date().toISOString(), columns: [], record: { id: TEST_ROOM_ID }, old_record: {} } };
      socket.route.send(JSON.stringify(socket.array ? [socket.joinRef, null, socket.topic, "postgres_changes", payload] : { topic: socket.topic, event: "postgres_changes", payload }));
    }
  }
  async function install(page: Page, user: string) {
    await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:54321\//, (route) => {
      route.onMessage((message) => {
        const raw = JSON.parse(String(message)), array = Array.isArray(raw);
        const [joinRef, ref, topic, event, payload] = array ? raw : [raw.join_ref, raw.ref, raw.topic, raw.event, raw.payload];
        const filters = (payload?.config?.postgres_changes ?? []).map((filter: object, index: number) => ({ ...filter, id: index + 1 }));
        if (event === "phx_join") sockets.push({ route, topic, array, joinRef, filters });
        const reply = { status: "ok", response: event === "phx_join" ? { postgres_changes: filters } : {} };
        route.send(JSON.stringify(array ? [joinRef, ref, topic, "phx_reply", reply] : { topic, ref, event: "phx_reply", payload: reply }));
      });
    });
    await page.route("**/api/multiplayer/rooms**", async (route) => {
      if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } }); return; }
      const response = await server.fetcher(route.request().url(), { method: route.request().method(), headers: { Authorization: "Bearer " + user }, body: route.request().postData() ?? undefined });
      await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" } });
      if (route.request().method() === "POST") changed();
    });
    await page.route("**/api/social/invitations", (route) => route.fulfill({ json: { data: { invitations: [], counts: { receivedPending: 0, sentPending: 0 } } }, headers: { "Access-Control-Allow-Origin": "*" } }));
  }
  await install(pc, "web"); await install(ios, "ios");
  await pc.goto("http://127.0.0.1:3100/multiplayer");
  await pc.getByRole("button", { name: "Créer la table", exact: true }).click();
  await expect(pc.getByText("KFFR151", { exact: true }).first()).toBeVisible();
  await ios.goto("http://127.0.0.1:8091/?screen=multiplayer&multi=live");
  await ios.getByRole("button", { name: "Saisir un code", exact: true }).click(); await ios.getByRole("textbox", { name: "Code de table" }).fill("KFFR151");
  await ios.getByRole("button", { name: "Rejoindre la table", exact: true }).click();
  await ios.getByRole("button", { name: "Place 2 : libre, s'asseoir" }).click();
  await expect(pc.getByText("Béatrice", { exact: true }).first()).toBeVisible();
  await ios.getByRole("button", { name: "Prêt", exact: true }).click();
  await pc.getByRole("button", { name: /^Je suis prêt|^Prêt$/ }).click();
  await pc.getByRole("button", { name: /Lancer la partie|Démarrer/ }).click();
  await expect(ios.getByTestId("multiplayer-game")).toBeVisible();
  const tick = async () => { server.advance(5000); await server.fetcher(`http://fixture/api/multiplayer/rooms/${TEST_ROOM_ID}/tick`, { method: "POST", headers: { Authorization: "Bearer web" } }); changed(); };
  for (let step = 0; step < 16 && server.game!.phase === "bidding"; step++) {
    if (server.game!.currentPlayerId > 1) { await tick(); continue; }
    const page = server.game!.currentPlayerId === 0 ? pc : ios, before = server.room.state_version;
    await page.getByRole("button", { name: server.game!.bids.some((b) => b.action !== "pass") ? "Passer" : "Annoncer", exact: true }).click();
    await expect.poll(() => server.room.state_version).toBeGreaterThan(before);
  }
  expect(server.game!.phase).toBe("playing");
  for (let step = 0; step < 4 && server.game!.currentPlayerId !== 1; step++) {
    if (server.game!.currentPlayerId > 1) { await tick(); continue; }
    const before = server.room.state_version;
    const cards = pc.locator('.coinche-human-hand button[data-playable="true"]:not([disabled])');
    await expect(cards.first()).toBeEnabled(); await cards.first().click();
    await expect.poll(() => server.room.state_version).toBeGreaterThan(before);
  }
  const before = server.room.state_version;
  const nativeCard = ios.locator('[data-testid="solo-hand"] [role="button"]:not([aria-disabled="true"])').first();
  await expect(nativeCard).toBeEnabled(); await nativeCard.click();
  await expect.poll(() => server.room.state_version).toBeGreaterThan(before);
  await expect(pc.locator('.coinche-trick-card[data-player-id="1"]').first()).toBeVisible();
  await ios.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(ios.getByTestId("multiplayer-game")).toHaveCount(0);
  await ios.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(ios.getByTestId("multiplayer-game")).toBeVisible();
  await ios.getByRole("button", { name: "Menu Multijoueur" }).click(); await ios.getByRole("button", { name: "Déclarer forfait", exact: true }).click(); await ios.getByRole("button", { name: "Confirmer le forfait" }).click();
  await expect(ios.getByTestId("solo-round-result")).toContainText("FORFAIT");
  await expect(pc.getByRole("heading", { name: /Victoire par abandon/ })).toBeVisible();
  expect(server.view("ios").game!.winnerTeam).toBe(server.view("web").game!.winnerTeam);
  await pc.getByRole("button", { name: "Retour au lobby" }).click(); await expect(ios.getByTestId("multiplayer-lobby")).toBeVisible();
  expect(sockets.length).toBeGreaterThanOrEqual(3); // web + native, then native resume
  await pc.close(); await ios.close();
});

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fourPlayerCredentials, loginAs } from "./helpers/auth";
import { createRoomThroughUi, enableTechnicalRules, joinRoomThroughUi, setLocalPreferences } from "./helpers/multiplayerUi";
import { expectRoom, monitorRoomPrivacy, roomView, sendIntent, type E2ERoomView } from "./helpers/room";

const auth = fourPlayerCredentials();
const names = ["E2E_P1", "E2E_P2", "E2E_P3", "E2E_P4"];

test.describe("@multiplayer four authenticated browser contexts", () => {
  test.skip(auth.missing.length > 0, `Missing authenticated E2E variables: ${auth.missing.join(", ")}`);
  test.describe.configure({ mode: "serial" });

  test("covers room lifecycle, privacy, Realtime, CAS, reconnect and preferences", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    let roomId: string | null = null;

    try {
      for (let index = 0; index < 4; index += 1) {
        const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
        contexts.push(context);
        const page = await context.newPage();
        pages.push(page);
        await loginAs(page, auth.credentials[index]);
      }

      const privacy = [monitorRoomPrivacy(pages[0]), monitorRoomPrivacy(pages[1])];
      const created = await createRoomThroughUi(pages[0], names[0]);
      roomId = created.roomId;
      const hostLobby = await roomView(pages[0], roomId);
      expect(hostLobby.isHost).toBe(true);
      expect(hostLobby.viewerSeatIndex).toBe(0);
      expect(hostLobby.room.ruleset_snapshot?.id).toBe("contree-kffr");
      for (let index = 1; index < 4; index += 1) await joinRoomThroughUi(pages[index], created.code, names[index]);

      for (const page of pages) {
        await expect(page.getByRole("button", { name: "Règles", exact: true })).toBeVisible();
        await expect(page.getByText(/1000 pts/)).toBeVisible();
      }
      const joinedViews = await Promise.all(pages.map((page) => roomView(page, roomId!)));
      expect(new Set(joinedViews.map((view) => view.room.id)).size).toBe(1);
      expect(joinedViews.map((view) => view.room.status)).toEqual(["lobby", "lobby", "lobby", "lobby"]);
      expect(joinedViews.map((view) => view.isHost)).toEqual([true, false, false, false]);

      // Two independent sessions race for the same free seat using one known version.
      const version = (await roomView(pages[0], roomId)).room.state_version;
      const race = await Promise.all([
        sendIntent(pages[1], roomId, version, { type: "join-seat", seatIndex: 1, displayName: names[1] }),
        sendIntent(pages[2], roomId, version, { type: "join-seat", seatIndex: 1, displayName: names[2] }),
      ]);
      expect(race.map((result) => result.status).sort()).toEqual([200, 409]);
      let converged = await expectRoom(pages[0], roomId, "one CAS seat winner", (view) => view.players.filter((p) => p.seat_index === 1 && p.kind === "human").length === 1);
      expect(new Set(converged.players.filter((p) => p.kind === "human").map((p) => p.seat_index)).size).toBe(2);

      for (let index = 1; index < 4; index += 1) {
        const ownView = await roomView(pages[index], roomId);
        if (ownView.viewerSeatIndex === null) {
          await expect(pages[index].getByRole("button", { name: "S'asseoir" })).toBeVisible();
          await pages[index].getByRole("button", { name: "S'asseoir" }).click();
          await expectRoom(pages[index], roomId, `${names[index]} seated`, (view) => view.viewerSeatIndex !== null);
        }
      }

      converged = await expectRoom(pages[0], roomId, "four unique seats", (view) => view.players.filter((p) => p.kind === "human").length === 4);
      expect(new Set(converged.players.map((p) => p.seat_index)).size).toBe(4);
      for (const page of pages) for (const name of names) await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

      const beforePreferences = (await roomView(pages[0], roomId)).room.state_version;
      let playerOneRoomPosts = 0;
      pages[0].on("request", (request) => {
        if (request.method() === "POST" && new URL(request.url()).pathname === `/api/multiplayer/rooms/${roomId}`) playerOneRoomPosts += 1;
      });
      await setLocalPreferences(pages[0], { cardSize: "large", theme: "midnight-blue" });
      await setLocalPreferences(pages[1], { cardSize: "small", theme: "classic-green" });
      expect(playerOneRoomPosts).toBe(0);
      expect((await roomView(pages[0], roomId)).room.state_version).toBe(beforePreferences);
      const preferenceValues = await Promise.all(pages.slice(0, 2).map((page) => page.evaluate(() => {
        const raw = localStorage.getItem("coinche:player-preferences:v1");
        const value = JSON.parse(raw ?? "null") as { gameplay?: { gameSpeed?: string }; cards?: { cardSize?: string }; visual?: { tableTheme?: string } };
        return [value.cards?.cardSize, value.visual?.tableTheme];
      })));
      expect(preferenceValues).toEqual([["large", "midnight-blue"], ["small", "classic-green"]]);

      for (const page of pages) {
        await page.getByRole("button", { name: "Prêt", exact: true }).click();
        await expect(page.getByRole("button", { name: "Pas prêt", exact: true })).toBeVisible();
      }
      await expectRoom(pages[0], roomId, "all players ready", (view) => view.players.every((player) => player.is_ready));

      await enableTechnicalRules(pages[0]);
      for (const page of pages) {
        await expect(page.getByText(/1500 pts/)).toBeVisible();
        await expect(page.getByText("Règles modifiées · confirme à nouveau que tu es prêt.")).toBeVisible();
        await expect(page.getByRole("button", { name: "Prêt", exact: true })).toBeVisible();
      }
      const rulesView = await roomView(pages[0], roomId);
      expect(rulesView.room.ruleset_snapshot?.bidding).toMatchObject({ allowNoTrump: true, allowAllTrump: true, allowGenerale: true });
      const forbidden = await sendIntent(pages[1], roomId, rulesView.room.state_version, { type: "update-room-rules", rules: { presetId: "contree-kffr" } });
      expect(forbidden.status).toBe(403);
      expect((await roomView(pages[0], roomId)).room.state_version).toBe(rulesView.room.state_version);

      for (const page of pages) await page.getByRole("button", { name: "Prêt", exact: true }).click();
      await expectRoom(pages[0], roomId, "ready after rule reset", (view) => view.players.every((player) => player.is_ready));
      await pages[0].getByRole("button", { name: "Lancer la partie" }).click();
      let gameView = await expectRoom(pages[0], roomId, "authoritative game created", (view) => view.room.status === "playing" && view.game?.phase === "bidding");
      for (const page of pages) {
        await page.getByRole("button", { name: "Ouvrir le menu de partie" }).click();
        await expect(page.getByRole("button", { name: "Abandonner la partie" })).toBeVisible();
        await page.keyboard.press("Escape");
      }

      const seatPages = new Map<number, Page>();
      const dealtCardIds = new Set<string>();
      for (const page of pages) {
        const view = await roomView(page, roomId);
        seatPages.set(view.viewerSeatIndex!, page);
        expect(view.game?.hand).toHaveLength(8);
        expect(view.game?.handCounts).toEqual({ 0: 8, 1: 8, 2: 8, 3: 8 });
        for (const card of view.game!.hand) dealtCardIds.add(`${card.rank}-${card.suit}`);
      }
      if (dealtCardIds.size !== 32) throw new Error("Authoritative deal did not project 32 unique private cards across the four owners.");

      const initialVersion = gameView.room.state_version;
      const outOfTurnSeat = [0, 1, 2, 3].find((seat) => seat !== gameView.game!.currentPlayerId)!;
      const outOfTurn = await sendIntent(seatPages.get(outOfTurnSeat)!, roomId, initialVersion, { type: "game-action", action: { type: "pass" } });
      expect(outOfTurn.status).toBe(409);
      expect((await roomView(pages[0], roomId)).room.state_version).toBe(initialVersion);

      // Dynamic active-seat bidding: 80 SA, 90 TA, then three passes.
      let actorPage = seatPages.get(gameView.game!.currentPlayerId)!;
      await actorPage.getByRole("button", { name: "Valeur 80" }).click();
      await actorPage.getByRole("button", { name: "Atout Sans Atout" }).click();
      await expect(actorPage.getByRole("button", { name: "Générale" })).toBeEnabled();
      await actorPage.getByRole("button", { name: "Annoncer" }).click();
      gameView = await expectRoom(pages[0], roomId, "SA bid propagated", (view) => view.game?.bids.some((bid) => bid.action === "bid" && bid.value === 80) === true);
      actorPage = seatPages.get(gameView.game!.currentPlayerId)!;
      await actorPage.getByRole("button", { name: "Valeur 90" }).click();
      await actorPage.getByRole("button", { name: "Atout Tout Atout" }).click();
      await actorPage.getByRole("button", { name: "Annoncer" }).click();
      gameView = await expectRoom(pages[0], roomId, "TA bid propagated", (view) => view.game?.bids.some((bid) => bid.action === "bid" && bid.value === 90) === true);
      for (let pass = 0; pass < 3; pass += 1) {
        actorPage = seatPages.get(gameView.game!.currentPlayerId)!;
        await actorPage.getByRole("button", { name: "Passer" }).click();
        gameView = await expectRoom(pages[0], roomId, `pass ${pass + 1} propagated`, (view) => (view.game?.bids.length ?? 0) > (gameView.game?.bids.length ?? 0));
      }
      gameView = await expectRoom(pages[0], roomId, "card play phase", (view) => view.game?.phase === "playing");
      expect(gameView.game?.contract?.contractMode?.kind).toBe("all-trump");

      const currentSeat = gameView.game!.currentPlayerId;
      const currentPage = seatPages.get(currentSeat)!;
      const currentPrivate = await roomView(currentPage, roomId);
      const held = new Set(currentPrivate.game!.hand.map((card) => `${card.rank}-${card.suit}`));
      const suits = ["clubs", "diamonds", "hearts", "spades"];
      const ranks = ["7", "8", "9", "J", "Q", "K", "10", "A"];
      const missingCard = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit }))).find((card) => !held.has(`${card.rank}-${card.suit}`))!;
      const forgedVersion = currentPrivate.room.state_version;
      const forged = await sendIntent(currentPage, roomId, forgedVersion, { type: "game-action", action: { type: "play-card", card: missingCard } });
      expect(forged.status).toBe(409);
      expect((await roomView(pages[0], roomId)).room.state_version).toBe(forgedVersion);

      for (let cardIndex = 0; cardIndex < 4; cardIndex += 1) {
        gameView = await roomView(pages[0], roomId);
        actorPage = seatPages.get(gameView.game!.currentPlayerId)!;
        const before = await roomView(actorPage, roomId);
        const cardButton = actorPage.locator('button[aria-label^="Jouer "]:not([disabled])').first();
        await expect(cardButton).toBeVisible();
        await cardButton.click();
        await expectRoom(actorPage, roomId, `card ${cardIndex + 1} left its hand`, (view) => view.game!.hand.length === before.game!.hand.length - 1);
      }
      gameView = await expectRoom(pages[0], roomId, "one complete public trick", (view) => (view.game?.completedTricks.length ?? 0) >= 1);
      for (const page of pages) {
        const view = await roomView(page, roomId);
        expect(view.game?.completedTricks.length).toBe(gameView.game?.completedTricks.length);
        expect(view.game?.hand).toHaveLength(view.game!.handCounts[String(view.viewerSeatIndex)]);
      }

      // Close and recreate one full BrowserContext with its in-memory storageState.
      const reconnectIndex = 2;
      const oldSeat = (await roomView(pages[reconnectIndex], roomId)).viewerSeatIndex;
      const state = await contexts[reconnectIndex].storageState();
      await contexts[reconnectIndex].close();
      contexts[reconnectIndex] = await browser.newContext({ baseURL, storageState: state, viewport: { width: 1280, height: 720 } });
      pages[reconnectIndex] = await contexts[reconnectIndex].newPage();
      await pages[reconnectIndex].goto(`/multiplayer/${roomId}`);
      const reconnected = await expectRoom(pages[reconnectIndex], roomId, "session and seat restored", (view) => view.viewerSeatIndex === oldSeat && view.room.status === "playing");
      expect(reconnected.players.filter((player) => player.display_name === names[reconnectIndex])).toHaveLength(1);
      expect(reconnected.game?.hand).toHaveLength(reconnected.game!.handCounts[String(oldSeat)]);
      assertNoAuthoritativeHands(reconnected);

      await privacy[0].assertSafeTraffic();
      await privacy[1].assertSafeTraffic();
    } finally {
      if (roomId) await bestEffortFinishRoom(pages, roomId);
      await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    }
  });
});

function assertNoAuthoritativeHands(view: E2ERoomView): void {
  if ("hands" in (view.game ?? {})) throw new Error("Privacy violation: reconnect exposed authoritative hands.");
}

async function bestEffortFinishRoom(pages: Page[], roomId: string): Promise<void> {
  const usable = pages.find((page) => !page.isClosed());
  if (!usable) return;
  try {
    const current = await roomView(usable, roomId);
    if (current.room.status === "playing") {
      await sendIntent(usable, roomId, current.room.state_version, { type: "forfeit-game" });
      return;
    }
    if (current.room.status === "lobby") {
      for (const page of pages) {
        if (page.isClosed()) continue;
        const view = await roomView(page, roomId);
        if (view.viewerSeatIndex !== null) await sendIntent(page, roomId, view.room.state_version, { type: "leave-seat" });
      }
    }
  } catch {
    // Cleanup is best-effort and targets only the exact room id created by this test.
  }
}

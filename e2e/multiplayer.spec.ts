import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fourPlayerCredentials, loginAs } from "./helpers/auth";
import { createRoomThroughUi, enableTechnicalRules, joinRoomThroughUi, setLocalPreferences } from "./helpers/multiplayerUi";
import { ratingSummary, waitForNoPending } from "./helpers/rating";
import { bestEffortFinishRoom, expectRoom, monitorRoomPrivacy, roomView, sendIntent, sendTick, type E2ERoomView } from "./helpers/room";

const auth = fourPlayerCredentials();
const names = ["E2E_P1", "E2E_P2", "E2E_P3", "E2E_P4"];

test.describe("@multiplayer four authenticated browser contexts", () => {
  test.skip(auth.missing.length > 0, `Missing authenticated E2E variables: ${auth.missing.join(", ")}`);
  test.describe.configure({ mode: "serial" });

  test("covers room lifecycle, privacy, Realtime, CAS, reconnect and preferences", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
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
      const created = await createRoomThroughUi(pages[0]);
      roomId = created.roomId;
      const hostLobby = await roomView(pages[0], roomId);
      expect(hostLobby.isHost).toBe(true);
      expect(hostLobby.viewerSeatIndex).toBe(0);
      expect(hostLobby.room.ruleset_snapshot?.id).toBe("contree-kffr");
      for (let index = 1; index < 4; index += 1) await joinRoomThroughUi(pages[index], created.code);

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
        sendIntent(pages[1], roomId, version, { type: "join-seat", seatIndex: 1 }),
        sendIntent(pages[2], roomId, version, { type: "join-seat", seatIndex: 1 }),
      ]);
      expect(race.map((result) => result.status).sort()).toEqual([200, 409]);
      let converged = await expectRoom(pages[0], roomId, "one CAS seat winner", (view) => view.players.filter((p) => p.seat_index === 1 && p.kind === "human").length === 1);
      expect(new Set(converged.players.filter((p) => p.kind === "human").map((p) => p.seat_index)).size).toBe(2);

      for (let index = 1; index < 4; index += 1) {
        const ownView = await roomView(pages[index], roomId);
        if (ownView.viewerSeatIndex === null) {
          const freeSeat = ownView.players.find((player) => player.kind === "empty")?.seat_index;
          if (freeSeat === undefined) throw new Error(`No free seat remained for ${names[index]}.`);
          const joined = await sendIntent(pages[index], roomId, ownView.room.state_version, { type: "join-seat", seatIndex: freeSeat });
          expect(joined.status).toBe(200);
          await expectRoom(pages[index], roomId, `${names[index]} seated`, (view) => view.viewerSeatIndex !== null);
        }
      }

      converged = await expectRoom(pages[0], roomId, "four unique seats", (view) => view.players.filter((p) => p.kind === "human").length === 4);
      expect(new Set(converged.players.map((p) => p.seat_index)).size).toBe(4);
      for (const player of converged.players) {
        expect(player).toHaveProperty("is_ranked");
        expect(player).toHaveProperty("rating");
        expect(player).toHaveProperty("rank");
        if (player.is_ranked) {
          expect(Number.isSafeInteger(player.rating)).toBe(true);
          expect(player.rank).toMatch(/^(Débutant|Pas mauvais|Sait jouer|Capot de Capi) (V|IV|III|II|I)$/);
        } else {
          expect(player.rating).toBeNull();
          expect(player.rank).toBeNull();
        }
      }
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
      expect(rulesView.room.ruleset_snapshot?.id).toBe("custom");
      expect(rulesView.room.ruleset_snapshot?.bidding).toMatchObject({ allowNoTrump: true, allowAllTrump: true, allowGenerale: true });
      const forbidden = await sendIntent(pages[1], roomId, rulesView.room.state_version, { type: "update-room-rules", rules: { presetId: "contree-kffr" } });
      expect(forbidden.status).toBe(403);
      expect((await roomView(pages[0], roomId)).room.state_version).toBe(rulesView.room.state_version);

      for (const page of pages) {
        await page.getByRole("button", { name: "Prêt", exact: true }).click();
        await expect(page.getByRole("button", { name: "Pas prêt", exact: true })).toBeVisible();
      }
      await expectRoom(pages[0], roomId, "ready after rule reset", (view) => view.players.every((player) => player.is_ready));
      await pages[0].getByRole("button", { name: "Lancer la partie" }).click();
      let gameView = await expectRoom(pages[0], roomId, "authoritative game created", (view) => view.room.status === "playing" && view.game?.phase === "bidding");
      for (const page of pages) {
        await page.getByRole("button", { name: "Menu Partie" }).click();
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
      expect(outOfTurn.status).toBe(403);
      expect((await roomView(pages[0], roomId)).room.state_version).toBe(initialVersion);

      // Dynamic active-seat bidding: 80 SA, 90 TA, then three passes.
      let actorPage = seatPages.get(gameView.game!.currentPlayerId)!;
      await actorPage.getByRole("button", { name: "Valeur 80" }).click();
      await actorPage.getByRole("button", { name: "Atout Sans Atout" }).click();
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
      expect(forged.status).toBe(400);
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

  test("covers real offline takeover, reconnect, history and rematch", async ({ browser, baseURL }) => {
    test.setTimeout(360_000);
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

      const ratingsBefore = await Promise.all(pages.map((page, index) => waitForNoPending(page, `generic multiplayer account ${index + 1}`)));

      const hostPage = pages[0];
      const hostPrivacy = monitorRoomPrivacy(hostPage);
      const created = await createRoomThroughUi(hostPage);
      roomId = created.roomId;
      for (let index = 1; index < 4; index += 1) {
        await joinRoomThroughUi(pages[index], created.code);
        const view = await roomView(pages[index], roomId);
        const freeSeat = view.players.find((player) => player.kind === "empty")?.seat_index;
        if (freeSeat === undefined) throw new Error(`No free seat remained for ${names[index]}.`);
        const joined = await sendIntent(pages[index], roomId, view.room.state_version, { type: "join-seat", seatIndex: freeSeat });
        expect(joined.status).toBe(200);
      }

      let live = await expectRoom(
        hostPage,
        roomId,
        "four humans seated for lifecycle validation",
        (view) => view.players.filter((player) => player.kind === "human").length === 4,
      );
      await enableTechnicalRules(hostPage);
      expect((await roomView(hostPage, roomId)).room.ruleset_snapshot?.id).toBe("custom");
      const seatPages = new Map<number, Page>();
      for (const page of pages) {
        const view = await roomView(page, roomId);
        if (view.viewerSeatIndex === null) throw new Error("A lifecycle participant has no seat.");
        seatPages.set(view.viewerSeatIndex, page);
      }

      for (const page of pages) {
        const view = await roomView(page, roomId);
        const ready = await sendIntent(page, roomId, view.room.state_version, { type: "set-ready", ready: true });
        expect(ready.status).toBe(200);
      }
      live = await expectRoom(hostPage, roomId, "lifecycle players ready", (view) => view.players.every((player) => player.is_ready));
      const started = await sendIntent(hostPage, roomId, live.room.state_version, { type: "start-game" });
      expect(started.status).toBe(200);
      live = await expectRoom(hostPage, roomId, "lifecycle game started", (view) => view.room.status === "playing" && view.game?.phase === "bidding");

      const hostSeat = live.viewerSeatIndex;
      if (hostSeat === null) throw new Error("The lifecycle host has no seat.");
      const openingSeat = live.game!.currentPlayerId;
      const openingPage = seatPages.get(openingSeat);
      if (!openingPage) throw new Error("The opening bidder page is unavailable.");
      const openingBid = await sendIntent(openingPage, roomId, live.room.state_version, {
        type: "game-action",
        action: { type: "bid", value: 80, contractMode: { kind: "suit", suit: "hearts" } },
      });
      expect(openingBid.status).toBe(200);
      live = openingBid.body.data!;

      if (live.game!.currentPlayerId === hostSeat) {
        const hostPass = await sendIntent(hostPage, roomId, live.room.state_version, { type: "game-action", action: { type: "pass" } });
        expect(hostPass.status).toBe(200);
        live = hostPass.body.data!;
      }
      const takeoverSeat = live.game!.currentPlayerId;
      expect(takeoverSeat).not.toBe(hostSeat);
      const takeoverPage = seatPages.get(takeoverSeat);
      if (!takeoverPage) throw new Error("The takeover target page is unavailable.");
      const takeoverIndex = pages.indexOf(takeoverPage);
      if (takeoverIndex < 0) throw new Error("The takeover target context is unavailable.");
      const takeoverName = live.players.find((player) => player.seat_index === takeoverSeat)?.display_name;
      if (!takeoverName) throw new Error("The takeover target has no public display name.");
      const takeoverStorage = await contexts[takeoverIndex].storageState();
      const targetBeforeDisconnect = await roomView(takeoverPage, roomId);
      expect(targetBeforeDisconnect.game?.hand).toHaveLength(8);

      await contexts[takeoverIndex].close();
      seatPages.delete(takeoverSeat);
      const offline = await expectRoom(
        hostPage,
        roomId,
        "closed browser context projected offline after the real presence timeout",
        (view) => view.players.some((player) => player.seat_index === takeoverSeat && !player.is_connected),
        90_000,
      );
      const offlineSeat = offline.players.find((player) => player.seat_index === takeoverSeat)!;
      expect(offlineSeat).toMatchObject({ kind: "human", display_name: takeoverName, is_connected: false, bot_takeover: false });
      expect(offline.room.status).toBe("playing");

      const takeoverButton = hostPage.getByRole("button", { name: `Faire jouer un bot pour ${takeoverName}` });
      await expect(takeoverButton).toBeVisible({ timeout: 20_000 });
      await takeoverButton.click();
      const takeover = await expectRoom(
        hostPage,
        roomId,
        "host enabled bot takeover for the offline human seat",
        (view) => view.players.some((player) => player.seat_index === takeoverSeat && player.bot_takeover),
      );
      expect(takeover.players.find((player) => player.seat_index === takeoverSeat)).toMatchObject({
        kind: "human",
        display_name: takeoverName,
        is_connected: false,
        bot_takeover: true,
      });
      expect(takeover.room.status).toBe("playing");

      const takeoverVersion = takeover.room.state_version;
      const actionCountBefore = playerActionCount(takeover, takeoverSeat);
      let tickRequests = 0;
      for (const page of pages) {
        if (page.isClosed()) continue;
        page.on("request", (request) => {
          if (request.method() === "POST" && new URL(request.url()).pathname === `/api/multiplayer/rooms/${roomId}/tick`) tickRequests += 1;
        });
      }

      live = takeover;
      let takeoverActionObserved = false;
      for (let step = 0; step < 16 && !takeoverActionObserved; step += 1) {
        if (!live.game || (live.game.phase !== "bidding" && live.game.phase !== "playing")) {
          throw new Error("The game left an actionable phase before takeover progression was observed.");
        }
        const actorSeat = live.game.currentPlayerId;
        if (actorSeat === takeoverSeat) {
          const tick = await sendTick(hostPage, roomId);
          expect(tick.status).toBe(200);
          await hostPage.waitForTimeout(600);
        } else if (live.game.phase === "bidding") {
          const actorPage = seatPages.get(actorSeat);
          if (!actorPage) throw new Error(`No connected bidder page for seat ${actorSeat}.`);
          const pass = await sendIntent(actorPage, roomId, live.room.state_version, { type: "game-action", action: { type: "pass" } });
          if (pass.status !== 409) expect(pass.status).toBe(200);
        } else {
          const actorPage = seatPages.get(actorSeat);
          if (!actorPage) throw new Error(`No connected card player page for seat ${actorSeat}.`);
          const beforeVersion = live.room.state_version;
          const cardButton = actorPage.locator('button[aria-label^="Jouer "]:not([disabled])').first();
          await expect(cardButton).toBeVisible({ timeout: 15_000 });
          await cardButton.click();
          await expectRoom(hostPage, roomId, `human seat ${actorSeat} advanced toward takeover turn`, (view) => view.room.state_version > beforeVersion);
        }
        live = await roomView(hostPage, roomId);
        takeoverActionObserved = playerActionCount(live, takeoverSeat) > actionCountBefore;
      }
      expect(takeoverActionObserved).toBe(true);
      expect(live.room.state_version).toBeGreaterThan(takeoverVersion);
      expect(tickRequests).toBeGreaterThan(0);

      contexts[takeoverIndex] = await browser.newContext({
        baseURL,
        storageState: takeoverStorage,
        viewport: { width: 1280, height: 720 },
      });
      const reconnectedPage = await contexts[takeoverIndex].newPage();
      pages[takeoverIndex] = reconnectedPage;
      seatPages.set(takeoverSeat, reconnectedPage);
      const reconnectPrivacy = monitorRoomPrivacy(reconnectedPage);
      await reconnectedPage.goto(`/multiplayer/${roomId}`);
      const reconnected = await expectRoom(
        reconnectedPage,
        roomId,
        "human heartbeat disabled takeover and restored the same seat",
        (view) => view.viewerSeatIndex === takeoverSeat && view.players.some(
          (player) => player.seat_index === takeoverSeat && player.is_connected && !player.bot_takeover,
        ),
        30_000,
      );
      expect(reconnected.players.filter((player) => player.display_name === takeoverName)).toHaveLength(1);
      expect(new Set(reconnected.players.filter((player) => player.kind === "human").map((player) => player.seat_index)).size).toBe(4);
      expect(reconnected.game?.hand).toHaveLength(reconnected.game!.handCounts[String(takeoverSeat)]);
      assertNoAuthoritativeHands(reconnected);

      const forfeit = await sendIntent(reconnectedPage, roomId, reconnected.room.state_version, { type: "forfeit-game" });
      expect(forfeit.status).toBe(200);
      const finished = await expectRoom(
        hostPage,
        roomId,
        "forfeit archived the real multiplayer game",
        (view) => view.room.status === "finished" && view.game?.phase === "game-over",
      );
      const forfeitingTeam = takeoverSeat % 2;
      expect(finished.game?.endReason).toBe("forfeit");
      expect(finished.game?.forfeitingTeam).toBe(forfeitingTeam);
      expect(finished.game?.winnerTeam).toBe(forfeitingTeam === 0 ? 1 : 0);
      expect(finished.players.every((player) => !player.bot_takeover)).toBe(true);
      expect(finished.gameId).toMatch(/^[0-9a-f-]{36}$/i);
      for (const page of pages) {
        const card = page.getByRole("region", { name: "Résultat de la partie" });
        await expect(card).toBeVisible({ timeout: 20_000 });
        for (const player of finished.players) await expect(card).toContainText(player.display_name!);
        await expect(card).not.toContainText("Score équipe 0");
        await expect(card).not.toContainText("Score équipe 1");
        expect((await roomView(page, roomId)).gameId).toBe(finished.gameId);
        if (page !== hostPage) {
          await expect(card.getByRole("button", { name: "Retour au lobby" })).toHaveCount(0);
          await expect(card).toContainText("En attente de l’hôte");
        }
      }
      await pages[1].setViewportSize({ width: 667, height: 375 });
      const compactCard = pages[1].getByRole("region", { name: "Résultat de la partie" });
      await expect(compactCard).toBeVisible();
      await expect(compactCard.getByText("Partie terminée", { exact: true })).toBeVisible();
      await expect(compactCard.getByRole("heading", { level: 1 })).toHaveText(/^(Victoire|Défaite) par abandon$/);
      const compactLayout = await pages[1].evaluate(() => {
        const scroller = document.querySelector("main");
        const card = document.querySelector('section[aria-label="Résultat de la partie"]');
        const heading = card?.querySelector("h1");
        const kicker = card?.querySelector(".coinche-ui-kicker");
        if (!scroller || !card || !heading || !kicker) throw new Error("The finished result structure is missing.");
        scroller.scrollTop = 0;
        const viewport = scroller.getBoundingClientRect();
        const top = {
          overflowsVertically: scroller.scrollHeight > scroller.clientHeight,
          card: card.getBoundingClientRect().top,
          kicker: kicker.getBoundingClientRect().top,
          headingBottom: heading.getBoundingClientRect().bottom,
          viewportTop: viewport.top,
          viewportBottom: viewport.bottom,
        };
        scroller.scrollTop = scroller.scrollHeight;
        return { ...top, cardBottomAtEnd: card.getBoundingClientRect().bottom };
      });
      expect(compactLayout.overflowsVertically).toBe(true);
      expect(compactLayout.card).toBeGreaterThanOrEqual(compactLayout.viewportTop - 1);
      expect(compactLayout.kicker).toBeGreaterThanOrEqual(compactLayout.viewportTop - 1);
      expect(compactLayout.headingBottom).toBeLessThanOrEqual(compactLayout.viewportBottom + 1);
      expect(compactLayout.cardBottomAtEnd).toBeLessThanOrEqual(compactLayout.viewportBottom + 1);
      expect(await pages[1].evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await pages[1].reload();
      await expect(pages[1].getByRole("region", { name: "Résultat de la partie" })).toBeVisible();
      const ratingsAfter = await Promise.all(pages.map(ratingSummary));
      for (let index = 0; index < 4; index += 1) {
        expect([ratingsAfter[index].rating, ratingsAfter[index].ratedGames, ratingsAfter[index].pendingMatches],
          `custom multiplayer game changed Elo for account ${index + 1}`)
          .toEqual([ratingsBefore[index].rating, ratingsBefore[index].ratedGames, 0]);
      }

      const hostPlayer = finished.players.find((player) => player.is_host);
      if (!hostPlayer) throw new Error("The finished room has no public host projection.");
      const partner = finished.players.find(
        (player) => player.kind === "human" && player.seat_index !== hostPlayer.seat_index && player.seat_index % 2 === hostPlayer.seat_index % 2,
      );
      const opponents = finished.players.filter(
        (player) => player.kind === "human" && player.seat_index % 2 !== hostPlayer.seat_index % 2,
      );
      if (!partner || opponents.length !== 2) throw new Error("The lifecycle teams are incomplete.");

      await hostPage.goto("/history");
      await hostPage.getByRole("button", { name: "Multijoueur", exact: true }).click();
      const latestHistory = hostPage.locator("li").first();
      await expect(latestHistory).toContainText("Multijoueur", { timeout: 15_000 });
      await expect(latestHistory).toContainText("Fin: abandon");
      await expect(latestHistory).toContainText(`Partenaire: ${partner.display_name}`);
      for (const opponent of opponents) await expect(latestHistory).toContainText(opponent.display_name!);

      const seatsBeforeRematch = finished.players
        .filter((player) => player.kind === "human")
        .map((player) => [player.seat_index, player.display_name, player.kind])
        .sort(([first], [second]) => Number(first) - Number(second));
      await hostPage.goto(`/multiplayer/${roomId}`);
      await expect(hostPage.getByRole("button", { name: "Retour au lobby" })).toBeVisible();
      const disconnectedIndex = 2;
      const disconnectedStorage = await contexts[disconnectedIndex].storageState();
      await contexts[disconnectedIndex].close();
      await hostPage.getByRole("button", { name: "Retour au lobby" }).click();
      const rematch = await expectRoom(
        hostPage,
        roomId,
        "rematch returned the same room to its lobby",
        (view) => view.room.status === "lobby" && view.game === null,
      );
      expect(new URL(hostPage.url()).pathname).toBe(`/multiplayer/${roomId}`);
      expect(rematch.room.id).toBe(roomId);
      expect(rematch.players
        .filter((player) => player.kind === "human")
        .map((player) => [player.seat_index, player.display_name, player.kind])
        .sort(([first], [second]) => Number(first) - Number(second))).toEqual(seatsBeforeRematch);
      expect(rematch.players.every((player) => !player.bot_takeover)).toBe(true);
      expect(rematch.players.filter((player) => player.kind === "human").every((player) => !player.is_ready)).toBe(true);
      expect(rematch.room.status).toBe("lobby");
      expect(rematch.game).toBeNull();
      expect(rematch.gameId).toBeNull();
      for (const page of [pages[1], pages[3]]) {
        await expect(page.getByRole("button", { name: "Prêt", exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole("region", { name: "Résultat de la partie" })).toHaveCount(0);
        expect((await roomView(page, roomId)).room.status).toBe("lobby");
      }
      contexts[disconnectedIndex] = await browser.newContext({ baseURL, storageState: disconnectedStorage,
        viewport: { width: 1280, height: 720 } });
      pages[disconnectedIndex] = await contexts[disconnectedIndex].newPage();
      await pages[disconnectedIndex].goto(`/multiplayer/${roomId}`);
      await expect(pages[disconnectedIndex].getByRole("button", { name: "Prêt", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(pages[disconnectedIndex].getByRole("region", { name: "Résultat de la partie" })).toHaveCount(0);
      expect((await roomView(pages[disconnectedIndex], roomId)).room.status).toBe("lobby");
      for (const page of pages) {
        const lobbyView = await roomView(page, roomId);
        expect((await sendIntent(page, roomId, lobbyView.room.state_version, { type: "set-ready", ready: true })).status).toBe(200);
      }
      const readyAgain = await expectRoom(hostPage, roomId, "same lobby ready for a new game", (view) =>
        view.players.filter((player) => player.kind === "human").every((player) => player.is_ready));
      expect((await sendIntent(hostPage, roomId, readyAgain.room.state_version, { type: "start-game" })).status).toBe(200);
      const nextGame = await expectRoom(hostPage, roomId, "new game id after rematch", (view) => view.room.status === "playing");
      expect(nextGame.gameId).not.toBe(finished.gameId);

      await hostPrivacy.assertSafeTraffic();
      await reconnectPrivacy.assertSafeTraffic();
    } finally {
      if (roomId) await bestEffortFinishRoom(pages, roomId);
      await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    }
  });
});

function assertNoAuthoritativeHands(view: E2ERoomView): void {
  if ("hands" in (view.game ?? {})) throw new Error("Privacy violation: reconnect exposed authoritative hands.");
}

function playerActionCount(view: E2ERoomView, seatIndex: number): number {
  if (!view.game) return 0;
  return view.game.bids.filter((bid) => bid.playerId === seatIndex).length
    + view.game.currentTrick.cards.filter((played) => played.playerId === seatIndex).length
    + view.game.completedTricks.reduce(
      (count, trick) => count + trick.cards.filter((played) => played.playerId === seatIndex).length,
      0,
    );
}

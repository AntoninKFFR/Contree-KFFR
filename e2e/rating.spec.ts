import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { CONTREE_KFFR_RULESET } from "../engine/rulesets/presets";
import { effectiveRatingDelta, eloDelta, expectedScore, kFactor, redistributeForfeit, teamStrength } from "../lib/rating/formulaV1";
import type { RatingSummary } from "../lib/rating/queries";
import { fourPlayerCredentials, loginAs } from "./helpers/auth";
import { createRoomThroughUi, joinRoomThroughUi } from "./helpers/multiplayerUi";
import { ownPublicUsername, ratingLeaderboard, ratingMatchResult, ratingSummary, waitForApplied, waitForNoPending } from "./helpers/rating";
import { bestEffortFinishRoom, expectRoom, roomView, sendIntent } from "./helpers/room";

const auth = fourPlayerCredentials();
const missing = [...auth.missing, ...(process.env.E2E_RATING_MUTATION === "1" ? [] : ["E2E_RATING_MUTATION=1"])];

test.describe("@multiplayer @rating authenticated Elo lifecycle", () => {
  test.skip(missing.length > 0, `Rating mutation guard unavailable: ${missing.join(", ")}`);
  test.describe.configure({ mode: "serial", retries: 0 });

  test("four humans: real forfeit applies exact snapshot Elo once", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    let roomId: string | null = null;
    try {
      for (let index = 0; index < 4; index += 1) {
        const context = await browser.newContext({ baseURL });
        contexts.push(context);
        const page = await context.newPage();
        pages.push(page);
        await loginAs(page, auth.credentials[index]);
      }
      const before = await Promise.all(pages.map((page, index) => waitForNoPending(page, `four-human account ${index + 1}`)));
      const created = await createRoomThroughUi(pages[0]);
      roomId = created.roomId;
      expect((await roomView(pages[0], roomId)).room.ruleset_snapshot).toEqual(CONTREE_KFFR_RULESET);

      for (let index = 1; index < 4; index += 1) {
        await joinRoomThroughUi(pages[index], created.code);
        const view = await roomView(pages[index], roomId);
        const joined = await sendIntent(pages[index], roomId, view.room.state_version, { type: "join-seat", seatIndex: index });
        expect(joined.status).toBe(200);
      }
      const seated = await expectRoom(pages[0], roomId, "four distinct humans seated", (view) =>
        view.players.filter((player) => player.kind === "human").length === 4);
      expect(seated.players.map((player) => player.seat_index).sort()).toEqual([0, 1, 2, 3]);
      for (const page of pages) {
        const view = await roomView(page, roomId);
        expect((await sendIntent(page, roomId, view.room.state_version, { type: "set-ready", ready: true })).status).toBe(200);
      }
      const ready = await expectRoom(pages[0], roomId, "rated room ready", (view) => view.players.every((player) => player.is_ready));
      expect((await sendIntent(pages[0], roomId, ready.room.state_version, { type: "start-game" })).status).toBe(200);
      const playing = await expectRoom(pages[0], roomId, "rated room playing", (view) => view.room.status === "playing");
      expect(playing.room.ruleset_snapshot).toEqual(CONTREE_KFFR_RULESET);
      expect(playing.players.filter((player) => player.kind === "human")).toHaveLength(4);
      const seatByPage = await Promise.all(pages.map(async (page) => (await roomView(page, roomId!)).viewerSeatIndex));
      expect(seatByPage).toEqual([0, 1, 2, 3]);

      // The authenticated seat 0 abandons through the production intent. No
      // forfeiter ID or seat is supplied by this client request.
      expect((await sendIntent(pages[0], roomId, playing.room.state_version, { type: "forfeit-game" })).status).toBe(200);
      const finished = await expectRoom(pages[0], roomId, "rated forfeit finished", (view) =>
        view.room.status === "finished" && view.game?.endReason === "forfeit");
      expect(finished.gameId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(finished.game?.winnerTeam).toBe(1);
      expect(finished.game?.forfeitingTeam).toBe(0);
      const after = await Promise.all(pages.map((page, index) => waitForApplied(page, before[index].ratedGames, `four-human account ${index + 1}`)));

      const team0 = teamStrength(before[0].rating, before[2].rating);
      const team1 = teamStrength(before[1].rating, before[3].rating);
      const expected0 = expectedScore(team0, team1);
      const normal = before.map((player, seat) => eloDelta({
        k: kFactor(player.ratedGames), reliability: 1, result: seat % 2 === 1 ? 1 : 0,
        expected: seat % 2 === 0 ? expected0 : 1 - expected0,
      }));
      const transfer = redistributeForfeit(normal[0], { kind: "human", normalDelta: normal[2] });
      const calculated = [transfer.forfeiterDelta, normal[1], transfer.partnerDelta!, normal[3]];
      for (let seat = 0; seat < 4; seat += 1) {
        const playerBefore = before[seat];
        const playerAfter = after[seat];
        const rating = playerBefore.rating + effectiveRatingDelta(playerBefore.rating, calculated[seat]);
        expect(playerAfter.rating, `seat ${seat} exact Elo`).toBe(rating);
        expect(playerAfter.ratedGames).toBe(playerBefore.ratedGames + 1);
        expect(playerAfter.wins).toBe(playerBefore.wins + (seat % 2 === 1 ? 1 : 0));
        expect(playerAfter.losses).toBe(playerBefore.losses + (seat % 2 === 0 ? 1 : 0));
        expect(playerAfter.forfeits).toBe(playerBefore.forfeits + (seat === 0 ? 1 : 0));
        expect(playerAfter.peakRating).toBe(Math.max(playerBefore.peakRating, rating));
        const ledger = await ratingMatchResult(pages[seat], finished.gameId!);
        expect(ledger).toMatchObject({ status: "applied", ratingBefore: playerBefore.rating,
          delta: playerAfter.rating - playerBefore.rating, ratingAfter: playerAfter.rating,
          forfeited: seat === 0 });
        const resultCard = pages[seat].getByRole("region", { name: "Résultat de la partie" });
        await expect(resultCard.getByRole("region", { name: "Elo KFFR" })).toContainText(
          playerAfter.rating - playerBefore.rating > 0
            ? `+${playerAfter.rating - playerBefore.rating}` : String(playerAfter.rating - playerBefore.rating),
          { timeout: 20_000 },
        );
        await assertRankState(pages[seat], playerAfter);
      }
      await pages[0].goto("/profile");
      await expect(pages[0].getByRole("heading", { name: "Classement Contrée" })).toBeVisible();
      await pages[0].goto("/leaderboard");
      await expect(pages[0].getByRole("heading", { name: "Classement", exact: true })).toBeVisible();
      await assertStableAfterReload(pages, after, roomId);
    } finally {
      if (roomId) await bestEffortFinishRoom(pages, roomId);
      await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    }
  });

  test("one human and three official bots: forfeit has no partner transfer", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    let roomId: string | null = null;
    try {
      await loginAs(page, auth.credentials[0]);
      const before = await waitForNoPending(page, "one-human account");
      const created = await createRoomThroughUi(page);
      roomId = created.roomId;
      expect((await roomView(page, roomId)).room.ruleset_snapshot).toEqual(CONTREE_KFFR_RULESET);
      const lobby = await roomView(page, roomId);
      expect((await sendIntent(page, roomId, lobby.room.state_version, { type: "set-ready", ready: true })).status).toBe(200);
      const ready = await expectRoom(page, roomId, "one-human room ready", (view) => view.players[0].is_ready);
      expect((await sendIntent(page, roomId, ready.room.state_version, { type: "start-game" })).status).toBe(200);
      const playing = await expectRoom(page, roomId, "one-human room playing", (view) => view.room.status === "playing");
      expect(playing.room.ruleset_snapshot).toEqual(CONTREE_KFFR_RULESET);
      expect(playing.players.filter((player) => player.kind === "human")).toHaveLength(1);
      expect(playing.players.filter((player) => player.kind === "bot")).toHaveLength(3);
      for (const bot of playing.players.filter((player) => player.kind === "bot")) {
        expect(bot).toMatchObject({ is_ranked: false, rating: null, rank: null });
      }
      expect(playing.players[0]).toMatchObject(before.isRanked
        ? { is_ranked: true, rating: before.rating, rank: before.rank }
        : { is_ranked: false, rating: null, rank: null });
      expect(playing.viewerSeatIndex).toBe(0);
      expect((await sendIntent(page, roomId, playing.room.state_version, { type: "forfeit-game" })).status).toBe(200);
      const finished = await expectRoom(page, roomId, "one-human forfeit finished", (view) =>
        view.room.status === "finished" && view.game?.endReason === "forfeit");
      expect(finished.game?.winnerTeam).toBe(1);
      const after = await waitForApplied(page, before.ratedGames, "one-human account");
      const ownTeam = teamStrength(before.rating, 1000);
      const opponents = teamStrength(1000, 1000);
      const normal = eloDelta({ k: kFactor(before.ratedGames), reliability: 0.2, result: 0,
        expected: expectedScore(ownTeam, opponents) });
      expect(redistributeForfeit(normal, { kind: "bot" }).forfeiterDelta).toBe(normal);
      const rating = before.rating + effectiveRatingDelta(before.rating, normal);
      expect(after.rating).toBe(rating);
      expect(after.ratedGames).toBe(before.ratedGames + 1);
      expect(after.wins).toBe(before.wins);
      expect(after.losses).toBe(before.losses + 1);
      expect(after.forfeits).toBe(before.forfeits + 1);
      expect(after.peakRating).toBe(Math.max(before.peakRating, rating));
      await assertRankState(page, after);
      await assertStableAfterReload([page], [after], roomId);
    } finally {
      if (roomId) await bestEffortFinishRoom([page], roomId);
      await context.close().catch(() => undefined);
    }
  });
});

async function assertRankState(page: Page, summary: RatingSummary): Promise<void> {
  const username = await ownPublicUsername(page);
  if (summary.ratedGames >= 5 && username) {
    expect(summary.isRanked).toBe(true);
    expect(summary.rank).not.toBeNull();
    expect(summary.position).not.toBeNull();
    // A dense-rank position is not a row offset. Only inspect the visible page.
    const visible = (await ratingLeaderboard(page)).find((entry) => entry.username === username);
    if (visible) expect([visible.rating, visible.rank, visible.position]).toEqual([summary.rating, summary.rank, summary.position]);
  } else {
    expect(summary.isRanked).toBe(false);
    expect(summary.rank).toBeNull();
    expect(summary.position).toBeNull();
    expect(summary.placementGames).toBe(Math.min(summary.ratedGames, 5));
  }
}

async function assertStableAfterReload(pages: Page[], after: RatingSummary[], roomId: string): Promise<void> {
  for (const page of pages) {
    await page.goto(`/multiplayer/${roomId}`);
    expect((await roomView(page, roomId)).room.status).toBe("finished");
    await page.goto("/profile");
  }
  for (let refresh = 0; refresh < 3; refresh += 1) {
    const latest = await Promise.all(pages.map(ratingSummary));
    for (let index = 0; index < pages.length; index += 1) {
      expect([latest[index].rating, latest[index].ratedGames, latest[index].wins,
        latest[index].losses, latest[index].forfeits, latest[index].pendingMatches])
        .toEqual([after[index].rating, after[index].ratedGames, after[index].wins,
          after[index].losses, after[index].forfeits, 0]);
    }
  }
}

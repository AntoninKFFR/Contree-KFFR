import { expect, it } from "vitest";
import { memoryMultiplayerServer, TEST_ROOM_ID } from "./helpers/nativeMultiplayerServer";
import { createRoomApi } from "../apps/mobile/src/multiplayer/api";
import { createRoomController } from "../apps/mobile/src/multiplayer/controller";
import { playableCardsForCurrentPlayer } from "../engine/game";
import { parseRoom } from "../apps/mobile/src/multiplayer/contract";
import { tableSeatsFor } from "../lib/solo/tableSeats";
import type { RoomIntent } from "../lib/roomTypes";

const who = (id: string) => ({ user: { id }, access_token: id });
const signal = () => new AbortController().signal;
for (const humans of [2, 4]) it(`web/native transport completes a real game with ${humans} humans, then rematches`, async () => {
  const server = memoryMultiplayerServer(), api = createRoomApi(server.fetcher);
  await api.create(who("web"), signal(), { presetId: "contree-kffr", overrides: { game: { targetScore: 100 } } });
  const ids = ["web", "ios", "third", "fourth"].slice(0, humans);
  expect((await api.find(who("ios"), signal(), "kffr151")).room.id).toBe(TEST_ROOM_ID);
  const clients = ids.map((owner) => createRoomController({ id: TEST_ROOM_ID, owner, identity: () => who(owner), api, onChange: () => {}, unauthorized: () => { throw new Error("401"); } }));
  const sync = () => Promise.all(clients.map((c) => c.load()));
  await Promise.all(clients.map((c) => c.resume()));
  for (let seat = 1; seat < humans; seat++) { await clients[seat].move({ type: "join-seat", seatIndex: seat as 1 }); await sync(); }
  expect(clients[0].state.room?.players).toEqual(clients[1].state.room?.players);
  for (const c of clients) { await c.move({ type: "set-ready", ready: true }); await sync(); }
  expect(await clients[0].move({ type: "start-game" })).toBe(true); await sync();
  let illegal = false, sawIosCard = false;
  for (let step = 0; step < 1500 && server.game?.phase !== "game-over"; step++) {
    const game = server.game!;
    if (game.phase === "finished") { await clients[0].move({ type: "next-round" }); }
    else if (game.currentPlayerId >= humans) { server.advance(5000); await api.tick(who("web"), signal(), TEST_ROOM_ID); }
    else {
      const c = clients[game.currentPlayerId];
      if (game.phase === "bidding") await c.move({ type: "game-action", action: game.bids.some((b) => b.action !== "pass") ? { type: "pass" } : { type: "bid", value: 80, trump: "spades" } });
      else {
        const legal = playableCardsForCurrentPlayer(game);
        const forbidden = game.hands[game.currentPlayerId].find((card) => !legal.some((x) => x.rank === card.rank && x.suit === card.suit));
        if (forbidden && !illegal) { const v = server.room.state_version; expect(await c.move({ type: "game-action", action: { type: "play-card", card: forbidden } })).toBe(false); expect(server.room.state_version).toBe(v); illegal = true; await c.load(); }
        expect(await c.move({ type: "game-action", action: { type: "play-card", card: legal[0] } })).toBe(true);
        if (game.currentPlayerId === 1) sawIosCard = true;
      }
    }
    await sync();
    expect(clients[0].state.room?.room.state_version).toBe(server.room.state_version);
    for (let i = 0; i < humans; i++) {
      const publicGame = clients[i].state.room?.game;
      expect(publicGame?.hand).toEqual(server.game?.hands[i as 0]);
      expect(publicGame).not.toHaveProperty("hands");
      expect(publicGame?.bids).toEqual(server.game?.bids);
      expect(publicGame?.totalScore).toEqual(server.game?.totalScore);
    }
    if (step === 8) { const v = server.room.state_version; clients[1].suspend(); await clients[1].resume(); expect(server.room.state_version).toBe(v); }
  }
  expect(server.game?.phase).toBe("game-over"); expect(illegal).toBe(true); expect(sawIosCard).toBe(true);
  expect(clients[0].state.room?.game?.winnerTeam).toBe(clients[1].state.room?.game?.winnerTeam);
  await clients[0].move({ type: "rematch" }); await sync(); expect(clients[1].state.room?.room.status).toBe("lobby");
  clients.forEach((c) => c.dispose());
}, 30000);

it("concurrent reservations conflict without corrupting seats; timeout, takeover, return, host transfer and forfeit stay authoritative", async () => {
  const s = memoryMultiplayerServer(), api = createRoomApi(s.fetcher);
  const guest = await api.load(who("ios"), signal(), TEST_ROOM_ID);
  const attempts = await Promise.allSettled([api.intent(who("ios"), signal(), guest, { type: "join-seat", seatIndex: 1 }), api.intent(who("other"), signal(), guest, { type: "join-seat", seatIndex: 1 })]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(s.players.filter((p) => p.user_id === "ios")).toHaveLength(1);
  const move = async (user: string, i: RoomIntent) => api.intent(who(user), signal(), await api.load(who(user), signal(), TEST_ROOM_ID), i);
  await move("web", { type: "set-ready", ready: true }); await move("ios", { type: "set-ready", ready: true });
  await move("web", { type: "start-game" });
  const before = s.room.state_version; s.advance(46000); await api.tick(who("ios"), signal(), TEST_ROOM_ID); expect(s.room.state_version).toBe(before + 1);
  s.advance(61000); await api.heartbeat(who("ios"), signal(), TEST_ROOM_ID);
  expect(s.view("ios").canClaimHost).toBe(true); await move("ios", { type: "claim-host" });
  await move("ios", { type: "enable-bot-takeover", seatIndex: 0 }); expect(s.view("ios").players[0].bot_takeover).toBe(true);
  await api.heartbeat(who("web"), signal(), TEST_ROOM_ID); expect(s.view("web").players[0].bot_takeover).toBe(false);
  await move("ios", { type: "transfer-host", targetSeatIndex: 0 }); expect(s.view("web").isHost).toBe(true);
  await move("web", { type: "forfeit-game" }); expect(s.view("ios").game?.endReason).toBe("forfeit"); expect(s.view("ios").room.status).toBe("finished");
});

it("all four viewer projections preserve real identities and reject a foreign private hand", () => {
  const s = memoryMultiplayerServer();
  for (const seat of [1, 2, 3] as const) s.intent(String(seat), s.room.state_version, { type: "join-seat", seatIndex: seat });
  for (const id of ["web", "1", "2", "3"]) s.intent(id, s.room.state_version, { type: "set-ready", ready: true });
  s.intent("web", s.room.state_version, { type: "start-game" });
  for (const [seat, id] of ["web", "1", "2", "3"].entries()) {
    const v = parseRoom(s.view(id)); expect(v.game?.viewerPlayerId).toBe(seat);
    const seats = tableSeatsFor(v.game!); expect(seats.bottom).toBe(seat); expect(seats.top).toBe((seat + 2) % 4);
    expect(() => parseRoom({ ...v, game: { ...v.game, hands: s.game?.hands } })).toThrow();
    expect(() => parseRoom({ ...v, viewerSeatIndex: (seat + 1) % 4 })).toThrow();
  }
});

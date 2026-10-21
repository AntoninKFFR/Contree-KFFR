import { expect, test } from "vitest";
import { createRoomApi } from "../apps/mobile/src/multiplayer/api";
import { createRoomController } from "../apps/mobile/src/multiplayer/controller";
import { memoryMultiplayerServer, TEST_ROOM_ID } from "./helpers/nativeMultiplayerServer";

test("two native accounts competing for one authoritative lobby seat have one winner and one explicit retry", async () => {
  const server = memoryMultiplayerServer();
  let arrivals = 0, release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const clients = ["ios", "third"].map((user) => {
    const api = createRoomApi(async (url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (body?.intent?.type === "join-seat" && arrivals < 2) { if (++arrivals === 2) release(); await gate; }
      return server.fetcher(String(url), init);
    });
    return createRoomController({ id: TEST_ROOM_ID, owner: user, identity: () => ({ user: { id: user }, access_token: user }), api, onChange: () => {}, unauthorized: () => {} });
  });
  try {
    await Promise.all(clients.map((c) => c.resume()));
    const results = await Promise.all(clients.map((c) => c.move({ type: "join-seat", seatIndex: 2 })));
    expect(results.filter(Boolean)).toHaveLength(1);
    const loser = clients[results.indexOf(false)], winner = clients[results.indexOf(true)];
    expect(winner.state.room?.viewerSeatIndex).toBe(2);
    expect(loser.state.room?.viewerSeatIndex).toBeNull();
    expect(loser.state.seatReservation?.phase).toBe("failed");
    expect(loser.state.seatReservation?.message).toBeTruthy();
    const reservations = () => server.calls.filter((c) => (c.body as { intent?: { type: string } } | null)?.intent?.type === "join-seat");
    expect(reservations()).toHaveLength(2);
    expect(server.players.filter((p) => p.seat_index === 2 && p.kind === "human")).toHaveLength(1);
    expect(await loser.move({ type: "join-seat", seatIndex: 3 })).toBe(true);
    expect(loser.state.room?.viewerSeatIndex).toBe(3); expect(reservations()).toHaveLength(3);
    await winner.load(); expect(winner.state.room?.players.filter((p) => p.kind === "human")).toHaveLength(3);
  } finally { clients.forEach((c) => c.dispose()); }
});

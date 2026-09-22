import { expect, type Page, type Response } from "@playwright/test";

export type E2EPlayerView = {
  phase: "bidding" | "playing" | "finished" | "game-over";
  currentPlayerId: number;
  hand: Array<{ rank: string; suit: string }>;
  handCounts: Record<string, number>;
  bids: Array<{ action: string; playerId: number; value?: number }>;
  currentTrick: { cards: Array<{ playerId: number; card: { rank: string; suit: string } }> };
  completedTricks: Array<{ cards: Array<{ playerId: number; card: { rank: string; suit: string } }> }>;
  contract: { contractMode?: { kind: string }; value: number } | null;
  totalScore: Record<string, number>;
  winnerTeam: number | null;
  endReason: "score" | "forfeit" | null;
  forfeitingTeam: number | null;
};

export type E2ERoomView = {
  room: {
    id: string;
    code: string;
    status: "lobby" | "playing" | "finished" | "cancelled";
    state_version: number;
    target_score: number;
    ruleset_snapshot?: { id: string; bidding: { allowNoTrump: boolean; allowAllTrump: boolean; allowGenerale: boolean } } | null;
  };
  players: Array<{
    seat_index: number;
    display_name: string | null;
    kind: string;
    is_ready: boolean;
    is_connected: boolean;
    bot_takeover: boolean;
    is_host: boolean;
    is_ranked: boolean;
    rating: number | null;
    rank: string | null;
  }>;
  isHost: boolean;
  viewerSeatIndex: number | null;
  game: E2EPlayerView | null;
};

export type RoomHttpResult = { status: number; body: { data?: E2ERoomView; error?: string } };

export async function authenticatedRoomRequest(
  page: Page,
  path: string,
  request: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<RoomHttpResult> {
  return page.evaluate(async ({ targetPath, method, requestBody }) => {
    function accessToken(): string {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
        try {
          const session = JSON.parse(localStorage.getItem(key) ?? "null") as { access_token?: unknown };
          if (typeof session?.access_token === "string") return session.access_token;
        } catch {
          // Ignore unrelated/corrupt local values. Login verification gives the actionable error.
        }
      }
      throw new Error("Authenticated E2E session is missing.");
    }
    const response = await fetch(targetPath, {
      method,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken()}`,
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    return { status: response.status, body: await response.json() };
  }, { targetPath: path, method: request.method ?? "GET", requestBody: request.body });
}

export async function roomView(page: Page, roomId: string): Promise<E2ERoomView> {
  const result = await authenticatedRoomRequest(page, `/api/multiplayer/rooms/${encodeURIComponent(roomId)}`);
  if (result.status !== 200 || !result.body.data) {
    throw new Error(`load room failed with HTTP ${result.status}: ${result.body.error ?? "unknown error"}`);
  }
  return result.body.data;
}

export function sendIntent(page: Page, roomId: string, expectedVersion: number, intent: unknown) {
  return authenticatedRoomRequest(page, `/api/multiplayer/rooms/${encodeURIComponent(roomId)}`, {
    method: "POST",
    body: { expectedVersion, intent },
  });
}

export function sendTick(page: Page, roomId: string) {
  return authenticatedRoomRequest(page, `/api/multiplayer/rooms/${encodeURIComponent(roomId)}/tick`, {
    method: "POST",
  });
}

export async function expectRoom(
  page: Page,
  roomId: string,
  label: string,
  predicate: (view: E2ERoomView) => boolean,
  timeout = 15_000,
): Promise<E2ERoomView> {
  await expect.poll(async () => predicate(await roomView(page, roomId)), { message: label, timeout }).toBe(true);
  return roomView(page, roomId);
}

export async function bestEffortFinishRoom(pages: Page[], roomId: string): Promise<void> {
  let isLobby = false;
  for (const page of pages) {
    if (page.isClosed()) continue;
    try {
      const view = await roomView(page, roomId);
      if (view.room.status === "lobby") {
        isLobby = true;
        break;
      }
      if (view.room.status !== "playing") return;
      if (view.viewerSeatIndex === null) continue;
      const result = await sendIntent(page, roomId, view.room.state_version, { type: "forfeit-game" });
      if (result.status === 200) return;
    } catch {
      // Try another open participant page in this test.
    }
  }
  if (!isLobby) return;

  for (const page of pages) {
    if (page.isClosed()) continue;
    try {
      const view = await roomView(page, roomId);
      if (view.room.status !== "lobby") return;
      if (view.viewerSeatIndex !== null) {
        await sendIntent(page, roomId, view.room.state_version, { type: "leave-seat" });
      }
    } catch {
      // Cleanup is best-effort and targets only the exact room created by this test.
    }
  }
}

function assertSafePayload(payload: unknown): void {
  let handFields = 0;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (["hands", "state", "gameState", "game_state", "server_state", "host_user_id", "active_game_id", "user_id", "email", "rating_snapshot", "k_factor", "bot_rating", "bot_rating_snapshot", "rated_games", "wins", "losses", "forfeits", "peak_rating", "ledger", "source_game_id"].includes(key)) {
        throw new Error(`Privacy violation: room API exposed forbidden field '${key}'.`);
      }
      if (key === "hand") {
        handFields += 1;
        if (!Array.isArray(nested) || nested.length > 8) throw new Error("Privacy violation: invalid player hand projection.");
      }
      visit(nested);
    }
    const record = value as Record<string, unknown>;
    if ("seat_index" in record && "kind" in record) {
      const ranked = record.is_ranked === true;
      if (ranked) {
        if (!Number.isSafeInteger(record.rating) || typeof record.rank !== "string") throw new Error("Privacy violation: invalid public rating projection.");
      } else if (record.rating !== null || record.rank !== null) {
        throw new Error("Privacy violation: provisional or bot rating exposed.");
      }
      if (record.kind !== "human" && ranked) throw new Error("Privacy violation: bot or empty seat has a public rating.");
    }
  };
  visit(payload);
  if (handFields > 1) throw new Error("Privacy violation: more than one private hand was exposed.");
}

export type RoomPrivacyMonitor = { assertSafeTraffic: () => Promise<void> };

export function monitorRoomPrivacy(page: Page): RoomPrivacyMonitor {
  const checks: Promise<void>[] = [];
  const listener = (response: Response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/multiplayer/rooms")) return;
    checks.push(response.json().then(assertSafePayload));
  };
  page.on("response", listener);
  return {
    async assertSafeTraffic() {
      await Promise.all(checks);
      expect(checks.length, "at least one real room API response was inspected").toBeGreaterThan(0);
    },
  };
}

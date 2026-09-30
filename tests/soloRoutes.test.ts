import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialGame } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { toPlayerGameView } from "@/engine/views";
import { POST as start } from "@/app/api/solo/sessions/route";
import { GET, POST as move } from "@/app/api/solo/sessions/[sessionId]/route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), rpc: vi.fn(), read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabaseAdmin", () => ({ authenticatedUserId: mocks.auth, getSupabaseAdmin: mocks.admin }));
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ sessionId: id }) };
function request(body: unknown, token = "jwt") {
  return new Request("http://localhost/api/solo/sessions", { method: "POST", headers: {
    "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockImplementation(async (req: Request) => {
    if (req.headers.get("authorization") !== "Bearer jwt") throw new Error("Authentication required.");
    return "owner-from-verified-jwt";
  });
  const state = createInitialGame(createSeededRandom(7));
  const stored = { id, engine_version: 1, state_version: 0, state };
  mocks.read.mockResolvedValue({ data: stored, error: null });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.read };
  mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: vi.fn().mockReturnValue(query) });
  mocks.rpc.mockImplementation(async (_name, params) => _name === "progression_game_xp_schema_version" ? ({data:"20260930200000",error:null}) : ({ data: { ...stored, state: params.p_state }, error: null }));
});
describe("Solo JWT routes", () => {
  it.each(["start", "get", "move"])("serializes only the public human view on %s", async (route) => {
    const response = route === "start"
      ? await start(request({ startKey: id, rules: { presetId: "contree-kffr" } }))
      : route === "get" ? await GET(request({}), context)
        : await move(request({ expectedVersion: 0, intent: { type: "pass", playerId: 0 } }), context);
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toMatch(/"hands"\s*:/);
    const { data } = JSON.parse(raw);
    const serverState = route === "get" ? createInitialGame(createSeededRandom(7))
      : mocks.rpc.mock.calls.find(([name]) => name === (route === "start" ? "create_solo_game_session" : "commit_solo_game_session"))![1].p_state;
    expect(data.state).toEqual(JSON.parse(JSON.stringify(toPlayerGameView(serverState, 0))));
    expect(data.state.hand).toEqual(serverState.hands[0]);
    for (const seat of [1, 2, 3] as const) {
      expect(data.state.handCounts[seat]).toBe(serverState.hands[seat].length);
      for (const card of serverState.hands[seat]) expect(raw).not.toContain(JSON.stringify(card));
    }
  });
  it.each(["missing", "wrong-version", "network"])("refuses connected start with 503 when schema is %s, then recovers", async (failure) => {
    const ready = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name, params) => {
      if (name !== "progression_game_xp_schema_version") return ready(name, params);
      if (failure === "network") throw new Error("private credentials");
      return failure === "missing" ? { data: null, error: { code: "PGRST202" } } : { data: "old", error: null };
    });
    const body = { startKey: id, rules: { presetId: "contree-kffr" } };
    const response = await start(request(body));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "progression_schema_not_ready" });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["progression_game_xp_schema_version"]);
    mocks.rpc.mockImplementation(ready);
    expect((await start(request(body))).status).toBe(200);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "create_solo_game_session")).toHaveLength(1);
  });
  it("creates identity and state on the server from normalized rules", async () => {
    const response = await start(request({ startKey: id, rules: { presetId: "contree-kffr" } }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("create_solo_game_session", expect.objectContaining({
      p_user_id: "owner-from-verified-jwt", p_start_key: id, p_state: expect.objectContaining({ phase: "bidding", winnerTeam: null }),
    }));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it.each([start, (req: Request) => GET(req, context), (req: Request) => move(req, context)])(
    "requires a verified JWT on every route", async (route) => {
      expect((await route(request({}, ""))).status).toBe(401);
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it.each(["won", "player_score", "amount", "user_id", "seed", "state", "rules"])(
    "rejects a fabricated %s instead of treating it as proof", async (key) => {
      expect((await move(request({ expectedVersion: 0, intent: { type: "advance-bot" }, [key]: 999 }), context)).status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown or another owner's session before a commit", async () => {
    mocks.read.mockResolvedValue({ data: null, error: null });
    expect((await move(request({ expectedVersion: 0, intent: { type: "advance-bot" } }), context)).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("resynchronizes stale revisions without executing the action again", async () => {
    expect((await move(request({ expectedVersion: 99, intent: { type: "advance-bot" } }), context)).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

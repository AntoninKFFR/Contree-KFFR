import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabaseAdmin", () => ({
  authenticatedUserId: vi.fn(async () => "jwt-user"),
}));
vi.mock("@/lib/server/trainingDuoService", () => ({
  createTrainingDuo: vi.fn(async () => ({ session: { id: "created" } })),
  joinTrainingDuo: vi.fn(async () => ({ session: { id: "joined" } })),
  trainingDuoView: vi.fn(async () => ({ session: { id: "loaded" } })),
  executeTrainingDuoIntent: vi.fn(async () => ({ session: { id: "mutated" } })),
  heartbeatTrainingDuo: vi.fn(async () => ({ session: { id: "heartbeat" } })),
}));

import { authenticatedUserId } from "@/lib/server/supabaseAdmin";
import {
  createTrainingDuo, executeTrainingDuoIntent, heartbeatTrainingDuo,
  joinTrainingDuo, trainingDuoView,
} from "@/lib/server/trainingDuoService";
import { POST as create } from "@/app/api/training/duo/sessions/route";
import { POST as join } from "@/app/api/training/duo/sessions/join/route";
import { GET as get, POST as mutate } from "@/app/api/training/duo/sessions/[sessionId]/route";
import { POST as heartbeat } from "@/app/api/training/duo/sessions/[sessionId]/presence/route";
import { TrainingDuoError } from "@/lib/server/trainingDuoError";

const ID = "a61e2320-39c4-4c98-9f98-37fb187f7a21";
const context = { params: Promise.resolve({ sessionId: ID }) };
function request(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST", headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("training duo authenticated routes", () => {
  it("creates and joins using only the JWT identity", async () => {
    const created = await create(request("/api/training/duo/sessions", { level: 4 }));
    expect(created.status).toBe(201);
    expect(created.headers.get("Cache-Control")).toBe("no-store");
    expect(createTrainingDuo).toHaveBeenCalledWith(4, "jwt-user");
    const joined = await join(request("/api/training/duo/sessions/join", { code: "abcdefghjk" }));
    expect(joined.status).toBe(200);
    expect(joinTrainingDuo).toHaveBeenCalledWith("ABCDEFGHJK", "jwt-user");
  });

  it("loads, mutates and heartbeats without client-supplied actor IDs", async () => {
    const loaded = await get(new Request(`http://localhost/${ID}`, { headers: { Authorization: "Bearer valid" } }), context);
    expect(loaded.status).toBe(200);
    expect(trainingDuoView).toHaveBeenCalledWith(ID, "jwt-user");
    const changed = await mutate(request(`/${ID}`, {
      expectedVersion: 2, intent: { type: "set-ready", ready: true },
    }), context);
    expect(changed.status).toBe(200);
    expect(executeTrainingDuoIntent).toHaveBeenCalledWith(ID, "jwt-user", 2, { type: "set-ready", ready: true });
    const beat = await heartbeat(request(`/${ID}/presence`), context);
    expect(beat.status).toBe(200);
    expect(heartbeatTrainingDuo).toHaveBeenCalledWith(ID, "jwt-user");
  });

  it("acknowledges a lobby guest leave with an empty 204 and denies a later GET", async () => {
    vi.mocked(executeTrainingDuoIntent).mockResolvedValueOnce(null);
    const departed = await mutate(request(`/${ID}`, {
      expectedVersion: 2, intent: { type: "leave" },
    }), context);
    expect(departed.status).toBe(204);
    expect(departed.headers.get("Cache-Control")).toBe("no-store");
    expect(await departed.text()).toBe("");

    vi.mocked(trainingDuoView).mockRejectedValueOnce(new TrainingDuoError("duo_session_not_found"));
    const afterLeave = await get(new Request(`http://localhost/${ID}`, {
      headers: { Authorization: "Bearer valid" },
    }), context);
    expect(afterLeave.status).toBe(404);
    expect(await afterLeave.json()).toMatchObject({ code: "duo_session_not_found" });
  });

  it("rejects forged identities, invalid codes and unauthenticated calls", async () => {
    const injected = await mutate(request(`/${ID}`, {
      expectedVersion: 2, intent: { type: "start", actorId: "partner" },
    }), context);
    expect(injected.status).toBe(400);
    expect(executeTrainingDuoIntent).not.toHaveBeenCalled();
    const invalidJoin = await join(request("/join", { code: "short" }));
    expect(invalidJoin.status).toBe(404);
    expect(await invalidJoin.json()).toMatchObject({ code: "duo_session_not_found" });
    vi.mocked(authenticatedUserId).mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = await create(request("/create", { level: 1 }));
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("Cache-Control")).toBe("no-store");
  });
});

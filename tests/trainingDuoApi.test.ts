import { afterEach, describe, expect, it, vi } from "vitest";
import { createTrainingDuoSession, fetchTrainingDuoView, joinTrainingDuoSession, sendTrainingDuoIntent,
  sendTrainingDuoIntentWithRetry, sendTrainingDuoPresence, TrainingDuoApiError } from "@/lib/trainingDuoApi";
import { duoFixture } from "@/tests/trainingDuoClientFixtures";
import type { TrainingDuoIntent, TrainingDuoView } from "@/lib/trainingDuoTypes";

const token = { access_token: "test-token" };
const view = duoFixture();
const ok = (data = view, status = 200) => new Response(JSON.stringify({ data }), { status });
const conflict = () => new Response(JSON.stringify({ code: "duo_version_conflict", error: "Conflict" }), { status: 409 });
afterEach(() => vi.unstubAllGlobals());

describe("training duo client API", () => {
  it("sends create, join, fetch, intent and presence with bearer auth and no-store", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(ok())); vi.stubGlobal("fetch", fetch);
    await createTrainingDuoSession(4, token);
    await joinTrainingDuoSession("ABCDEFGHJK", token);
    await fetchTrainingDuoView("duo-id", token);
    await sendTrainingDuoIntent("duo-id", 1, { type: "set-ready", ready: true }, token);
    await sendTrainingDuoPresence("duo-id", token);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/training/duo/sessions", "/api/training/duo/sessions/join", "/api/training/duo/sessions/duo-id",
      "/api/training/duo/sessions/duo-id", "/api/training/duo/sessions/duo-id/presence",
    ]);
    for (const [, init] of fetch.mock.calls) { expect(init.cache).toBe("no-store"); expect(init.headers.Authorization).toBe("Bearer test-token"); }
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ level: 4 });
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({ expectedVersion: 1, intent: { type: "set-ready", ready: true } });
  });
  it("handles guest leave 204 without JSON and preserves stable errors or malformed HTTP status", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "duo_session_expired", error: "Expiré" }), { status: 410 }))
      .mockResolvedValueOnce(new Response("not json", { status: 502 }));
    vi.stubGlobal("fetch", fetch);
    expect(await sendTrainingDuoIntent("duo-id", 1, { type: "leave" }, token)).toBeNull();
    await expect(fetchTrainingDuoView("duo-id", token)).rejects.toMatchObject({ code: "duo_session_expired", status: 410 });
    await expect(fetchTrainingDuoView("duo-id", token)).rejects.toMatchObject({ code: "duo_unknown_error", status: 502 });
  });
});

describe("one bounded CAS retry", () => {
  it("completes an already satisfied ready or submitted answer after GET", async () => {
    for (const [intent, changed] of [
      [{ type: "set-ready", ready: true }, { participants: [{ ...view.participants[0], isReady: true }, view.participants[1]] }],
      [{ type: "submit-answer", answer: { selectedAssertionIds: [] } }, { participants: [{ ...view.participants[0], hasAnswered: true }, view.participants[1]] }],
      [{ type: "ready-next" }, { participants: [{ ...view.participants[0], readyForNext: true }, view.participants[1]] }],
    ] as [TrainingDuoIntent, Partial<TrainingDuoView>][]) {
      const base = intent.type === "set-ready" ? view : duoFixture("active");
      if (intent.type === "ready-next") base.session.questionPhase = "revealed";
      const latest = { ...base, ...changed, session: { ...base.session, stateVersion: 2 } };
      const fetch = vi.fn().mockResolvedValueOnce(conflict()).mockResolvedValueOnce(ok(latest)); vi.stubGlobal("fetch", fetch);
      expect(await sendTrainingDuoIntentWithRetry(base, intent, token)).toEqual(latest);
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });
  it("retries once when still valid, and reports a stable second conflict", async () => {
    const latest = { ...view, session: { ...view.session, stateVersion: 2 } };
    const fetch = vi.fn().mockResolvedValueOnce(conflict()).mockResolvedValueOnce(ok(latest)).mockResolvedValueOnce(ok(latest));
    vi.stubGlobal("fetch", fetch);
    await sendTrainingDuoIntentWithRetry(view, { type: "set-ready", ready: true }, token);
    expect(JSON.parse(fetch.mock.calls[2][1].body).expectedVersion).toBe(2);
    const second = vi.fn().mockResolvedValueOnce(conflict()).mockResolvedValueOnce(ok(latest)).mockResolvedValueOnce(conflict());
    vi.stubGlobal("fetch", second);
    await expect(sendTrainingDuoIntentWithRetry(view, { type: "set-ready", ready: true }, token))
      .rejects.toMatchObject({ code: "duo_version_conflict", status: 409 });
    expect(second).toHaveBeenCalledTimes(3);
  });
  it("retries an unanswered submit once with the refreshed version", async () => {
    const base = duoFixture("active");
    const latest = duoFixture("active"); latest.session.stateVersion = 2;
    const fetch = vi.fn().mockResolvedValueOnce(conflict()).mockResolvedValueOnce(ok(latest)).mockResolvedValueOnce(ok(latest));
    vi.stubGlobal("fetch", fetch);
    await sendTrainingDuoIntentWithRetry(base, { type: "submit-answer", answer: { selectedAssertionIds: [] } }, token);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ expectedVersion: 2,
      intent: { type: "submit-answer", answer: { selectedAssertionIds: [] } } });
  });
  it("never retries start, leave or cancel", async () => {
    for (const type of ["start", "leave", "cancel"] as const) {
      const fetch = vi.fn().mockResolvedValue(conflict()); vi.stubGlobal("fetch", fetch);
      await expect(sendTrainingDuoIntentWithRetry(view, { type }, token)).rejects.toBeInstanceOf(TrainingDuoApiError);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
  it("does not replay a ready-next after the index has advanced", async () => {
    const base = duoFixture("active"); base.session.questionPhase = "revealed";
    const next = duoFixture("active"); next.session.currentIndex = 1; next.session.stateVersion = 2;
    const fetch = vi.fn().mockResolvedValueOnce(conflict()).mockResolvedValueOnce(ok(next)); vi.stubGlobal("fetch", fetch);
    expect(await sendTrainingDuoIntentWithRetry(base, { type: "ready-next" }, token)).toEqual(next);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

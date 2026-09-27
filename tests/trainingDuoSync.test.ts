// @vitest-environment jsdom
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { newerDuoView, startTrainingDuoHeartbeat, useTrainingDuoSync, type TrainingDuoSyncServices } from "@/components/training/useTrainingDuoSync";
import { TrainingDuoApiError } from "@/lib/trainingDuoApi";
import { duoFixture } from "@/tests/trainingDuoClientFixtures";

vi.stubGlobal("React", React);
afterEach(() => { cleanup(); vi.useRealTimers(); });
const token = { access_token: "token", user: { id: "user" } } as Session;

it("rejects a stale stateVersion for the same session", () => {
  const old = duoFixture(); const next = duoFixture(); next.session.stateVersion = 4;
  expect(newerDuoView(next, old)).toBe(next);
  expect(newerDuoView(old, next)).toBe(next);
});

it("loads initially, refetches after invalidation, ignores stale GET and tears down on auth loss", async () => {
  let authChanged: ((event: string, session: Session | null) => void) | null = null;
  let invalidate: (() => void | Promise<void>) | null = null;
  const stop = vi.fn();
  const client = { auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: token } }),
    onAuthStateChange: vi.fn((callback) => { authChanged = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
  } } as unknown as SupabaseClient;
  const initial = duoFixture(); const fresh = duoFixture(); fresh.session.stateVersion = 5;
  const fetchView = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(fresh).mockResolvedValueOnce(initial);
  const sendPresence = vi.fn().mockResolvedValue(initial);
  const services: TrainingDuoSyncServices = {
    getSupabaseClient: () => client,
    fetchView,
    sendPresence,
    subscribe: vi.fn((_client, _id, callback) => { invalidate = callback; return stop; }),
  };
  const { result } = renderHook(() => useTrainingDuoSync("duo-id", services));
  await waitFor(() => expect(result.current.pageState).toBe("ready"));
  expect(result.current.view?.session.stateVersion).toBe(1);
  await act(async () => { await invalidate?.(); });
  expect(result.current.view?.session.stateVersion).toBe(5);
  await act(async () => { await invalidate?.(); });
  expect(result.current.view?.session.stateVersion).toBe(5);
  act(() => { authChanged?.("SIGNED_OUT", null); });
  expect(result.current.pageState).toBe("signed-out");
  expect(result.current.view).toBeNull();
  expect(stop).toHaveBeenCalled();
});

it("ignores a late fetch for a previous session id", async () => {
  let finishOld: (view: ReturnType<typeof duoFixture>) => void = () => {};
  const oldResponse = new Promise<ReturnType<typeof duoFixture>>((resolve) => { finishOld = resolve; });
  const next = duoFixture(); next.session.id = "new-id";
  const client = { auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: token } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  } } as unknown as SupabaseClient;
  const services: TrainingDuoSyncServices = {
    getSupabaseClient: () => client,
    fetchView: vi.fn((id) => id === "old-id" ? oldResponse : Promise.resolve(next)),
    sendPresence: vi.fn().mockResolvedValue(next), subscribe: vi.fn(() => vi.fn()),
  };
  const { result, rerender } = renderHook(({ id }) => useTrainingDuoSync(id, services), { initialProps: { id: "old-id" } });
  await waitFor(() => expect(services.fetchView).toHaveBeenCalledWith("old-id", token));
  rerender({ id: "new-id" });
  await waitFor(() => expect(result.current.view?.session.id).toBe("new-id"));
  await act(async () => { finishOld(duoFixture()); });
  expect(result.current.view?.session.id).toBe("new-id");
});

it("heartbeats immediately and on interval, focus, visibility and online; transient failure does not leave", async () => {
  vi.useFakeTimers();
  const view = duoFixture("active");
  const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(view);
  const accept = vi.fn();
  const refresh = vi.fn().mockResolvedValue(undefined);
  const stop = startTrainingDuoHeartbeat("duo-id", token, send, accept, refresh);
  await act(async () => { await Promise.resolve(); });
  expect(send).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(15_000); await Promise.resolve(); });
  expect(send).toHaveBeenCalledTimes(2);
  expect(accept).toHaveBeenCalledWith(view);
  await act(async () => { window.dispatchEvent(new Event("focus")); await Promise.resolve(); });
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => { window.dispatchEvent(new Event("online")); await Promise.resolve(); });
  expect(refresh).toHaveBeenCalledTimes(3);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
  expect(send).toHaveBeenCalledTimes(5);
  expect(refresh).toHaveBeenCalledTimes(4);
  stop();
  vi.advanceTimersByTime(30_000);
  window.dispatchEvent(new Event("focus"));
  expect(send).toHaveBeenCalledTimes(5);
  expect(refresh).toHaveBeenCalledTimes(4);
});

function terminalHarness(initial: ReturnType<typeof duoFixture>, terminal: ReturnType<typeof duoFixture>) {
  let invalidate: (() => void | Promise<void>) | null = null;
  const client = { auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: token } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  } } as unknown as SupabaseClient;
  const fetchView = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(terminal);
  const sendPresence = vi.fn().mockResolvedValueOnce(initial).mockRejectedValue(new Error("heartbeat refused"));
  const services: TrainingDuoSyncServices = {
    getSupabaseClient: () => client, fetchView, sendPresence,
    subscribe: vi.fn((_client, _id, callback) => { invalidate = callback; return vi.fn(); }),
  };
  return { services, fetchView, sendPresence, invalidate: () => invalidate?.() };
}

for (const status of ["cancelled", "completed"] as const) {
  it(`recovers ${status} after a missed Realtime event and rejected resume heartbeat`, async () => {
    const local = duoFixture("active");
    const canonical = duoFixture(status); canonical.session.stateVersion = 2;
    const harness = terminalHarness(local, canonical);
    const { result } = renderHook(() => useTrainingDuoSync("duo-id", harness.services));
    await waitFor(() => expect(result.current.view?.session.status).toBe("active"));
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(result.current.view?.session.status).toBe(status));
    expect(harness.fetchView).toHaveBeenCalledTimes(2);
    expect(harness.sendPresence).toHaveBeenCalledTimes(2);
    expect(result.current.pageState).toBe("ready");
  });
}

it("maps an initial cancelled-expired view to the expired page state", async () => {
  const expired = duoFixture("cancelled"); expired.session.cancelReason = "expired";
  const harness = terminalHarness(expired, expired);
  const { result } = renderHook(() => useTrainingDuoSync("duo-id", harness.services));
  await waitFor(() => expect(result.current.pageState).toBe("expired"));
  expect(result.current.view?.session.cancelReason).toBe("expired");
});

it("maps a canonical refetch from active to cancelled-expired without keeping the old screen", async () => {
  const active = duoFixture("active");
  const expired = duoFixture("cancelled"); expired.session.cancelReason = "expired"; expired.session.stateVersion = 2;
  const harness = terminalHarness(active, expired);
  const { result } = renderHook(() => useTrainingDuoSync("duo-id", harness.services));
  await waitFor(() => expect(result.current.view?.session.status).toBe("active"));
  await act(async () => { await harness.invalidate(); });
  expect(result.current.pageState).toBe("expired");
  expect(result.current.view?.session.status).toBe("cancelled");
  act(() => { result.current.acceptView(active); });
  expect(result.current.pageState).toBe("expired");
});

it("keeps transient offline errors non-destructive and sends no leave", async () => {
  const active = duoFixture("active");
  const harness = terminalHarness(active, active);
  harness.fetchView.mockReset().mockResolvedValueOnce(active).mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useTrainingDuoSync("duo-id", harness.services));
  await waitFor(() => expect(result.current.view?.session.status).toBe("active"));
  await act(async () => { window.dispatchEvent(new Event("online")); });
  await waitFor(() => expect(result.current.error).toBe("offline"));
  expect(result.current.view?.session.status).toBe("active");
  expect(result.current.pageState).toBe("ready");
});

for (const [code, expected] of [
  ["duo_session_expired", "expired"], ["duo_version_unsupported", "unsupported"],
  ["duo_session_not_found", "missing"],
] as const) {
  it(`hides a stale interactive view immediately on terminal mutation error ${code}`, async () => {
    const active = duoFixture("active");
    const harness = terminalHarness(active, active);
    harness.fetchView.mockReset().mockResolvedValueOnce(active).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useTrainingDuoSync("duo-id", harness.services));
    await waitFor(() => expect(result.current.view?.session.status).toBe("active"));
    act(() => { expect(result.current.markTerminalError(new TrainingDuoApiError("terminal", 409, code))).toBe(true); });
    expect(result.current.pageState).toBe(expected);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.pageState).toBe(expected);
  });
}

// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressionProvider, useProgression } from "@/components/progression/ProgressionProvider";
import { notifyProgressionChanged } from "@/lib/progression/events";
import { getProgression } from "@/lib/progression/formulaV1";

const mocks = vi.hoisted(() => ({getSession:vi.fn(),subscribe:vi.fn(),query:vi.fn(),recent:vi.fn(),missions:vi.fn(),pathname:"/"}));
vi.mock("next/navigation", () => ({usePathname:() => mocks.pathname}));
vi.mock("@/lib/supabaseClient", () => ({getSupabaseClient:() => ({auth:{getSession:mocks.getSession,onAuthStateChange:mocks.subscribe}})}));
vi.mock("@/lib/progression/queries", () => ({getMyProgression:mocks.query,getMyRecentXpEvents:mocks.recent,getMyPermanentMissions:mocks.missions}));
let auth: (event: string, session: unknown) => void;
const session = (id: string) => ({user:{id}});
function Consumer() {
  const value = useProgression();
  return <><span data-testid="snapshot">{JSON.stringify(value)}</span><button onClick={value.refresh}>refresh</button></>;
}
const mount = () => render(<ProgressionProvider><Consumer /></ProgressionProvider>);
const snapshot = () => JSON.parse(screen.getByTestId("snapshot").textContent!);
beforeEach(() => {
  vi.stubGlobal("React",React);
  vi.clearAllMocks(); mocks.pathname = "/";
  mocks.subscribe.mockImplementation((callback) => {auth = callback; return {data:{subscription:{unsubscribe:vi.fn()}}};});
  mocks.getSession.mockResolvedValue({data:{session:session("a")},error:null});
  mocks.query.mockResolvedValue(getProgression(0)); mocks.recent.mockResolvedValue([]); mocks.missions.mockResolvedValue([]);
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
describe("shared progression read provider", () => {
  it("retries an initial auth failure without reloading the page", async () => {
    mocks.getSession.mockRejectedValueOnce(new Error("temporary auth failure")); mount();
    await waitFor(() => expect(snapshot().status).toBe("error"));
    act(() => screen.getByRole("button").click());
    await waitFor(() => expect(snapshot().status).toBe("ready"));
    expect(snapshot().userId).toBe("a");
  });
  it("signed-out never queries XP", async () => {
    mocks.getSession.mockResolvedValue({data:{session:null},error:null}); mount();
    await waitFor(() => expect(snapshot().status).toBe("signed-out"));
    expect(snapshot().summary).toBeNull(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([0,100,700])("loads the canonical summary for %i XP", async (xp) => {
    mocks.query.mockResolvedValue(getProgression(xp)); mount();
    await waitFor(() => expect(snapshot().status).toBe("ready"));
    expect(snapshot().summary).toEqual(getProgression(xp)); expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("recovers from error through explicit refresh", async () => {
    mocks.query.mockRejectedValueOnce(new Error("private DB details")); mount();
    await waitFor(() => expect(snapshot().status).toBe("error"));
    expect(snapshot().error).not.toContain("private DB");
    act(() => screen.getByRole("button").click());
    await waitFor(() => expect(snapshot().status).toBe("ready"));
  });
  it("coalesces repeat game notifications, and refreshes on navigation and foreground", async () => {
    const view = mount(); await waitFor(() => expect(snapshot().status).toBe("ready"));
    mocks.query.mockResolvedValue(getProgression(100));
    act(() => {notifyProgressionChanged(); notifyProgressionChanged(); notifyProgressionChanged();});
    await waitFor(() => expect(snapshot().summary.level).toBe(2));
    expect(mocks.query).toHaveBeenCalledTimes(2);
    mocks.pathname = "/progression"; view.rerender(<ProgressionProvider><Consumer /></ProgressionProvider>);
    await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(3));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(4));
  });
  it("clears old account data and ignores an obsolete response after switching accounts", async () => {
    let resolveOld!: (value: ReturnType<typeof getProgression>) => void;
    mocks.query.mockImplementationOnce(() => new Promise((resolve) => {resolveOld = resolve;}));
    mount(); await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(1));
    mocks.query.mockResolvedValue(getProgression(550));
    act(() => auth("SIGNED_IN",session("b")));
    expect(snapshot().summary).toBeNull();
    await waitFor(() => expect(snapshot().summary?.level).toBe(5));
    await act(async () => resolveOld(getProgression(1800)));
    expect(snapshot().userId).toBe("b"); expect(snapshot().summary.level).toBe(5);
    act(() => auth("SIGNED_OUT",null));
    expect(snapshot().status).toBe("signed-out"); expect(snapshot().summary).toBeNull();
  });
  it("does not let the initial getSession response override a newer auth callback", async () => {
    let resolve!: (value: unknown) => void;
    mocks.getSession.mockReturnValue(new Promise((done) => {resolve = done;}));
    mount(); act(() => auth("SIGNED_IN",session("b")));
    await act(async () => resolve({data:{session:session("a")}}));
    await waitFor(() => expect(snapshot().status).toBe("ready"));
    expect(snapshot().userId).toBe("b");
  });
  it("recent history errors do not hide the level", async () => {
    mocks.recent.mockRejectedValue(new Error("history")); mount();
    await waitFor(() => expect(snapshot().status).toBe("ready"));
    expect(snapshot().summary.level).toBe(1); expect(snapshot().recentError).toBe(true);
  });
});

it("mission read failure preserves XP and clears obsolete missions", async () => {
  mocks.missions.mockResolvedValue([{key:"first_training",rewardXp:100,completed:true,completedAt:"2026-10-01T00:00:00Z"}]);
  mount(); await waitFor(() => expect(snapshot().permanentMissions).toHaveLength(1));
  mocks.missions.mockRejectedValue(new Error("mission database"));
  act(() => notifyProgressionChanged());
  await waitFor(() => expect(snapshot().missionsError).toBe(true));
  expect(snapshot().status).toBe("ready"); expect(snapshot().summary.level).toBe(1);
  expect(snapshot().permanentMissions).toEqual([]);
});
it("refreshes missions through the shared event and clears them on sign-out", async () => {
  mount(); await waitFor(() => expect(snapshot().status).toBe("ready"));
  mocks.missions.mockResolvedValue([{key:"first_training",completed:true}]);
  act(() => {notifyProgressionChanged();notifyProgressionChanged();});
  await waitFor(() => expect(snapshot().permanentMissions).toHaveLength(1));
  expect(mocks.missions).toHaveBeenCalledTimes(2);
  act(() => auth("SIGNED_OUT",null)); expect(snapshot().permanentMissions).toEqual([]);
});

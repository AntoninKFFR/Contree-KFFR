// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressionProvider, useProgression } from "@/components/progression/ProgressionProvider";
import { notifyProgressionChanged } from "@/lib/progression/events";
import { cosmeticsFixture } from "./helpers/profileCosmetics";
import { PROFILE_COSMETICS_CHANGED_EVENT } from "@/lib/profileCosmetics";
import { getProgression } from "@/lib/progression/formulaV1";

const mocks = vi.hoisted(() => ({getSession:vi.fn(),subscribe:vi.fn(),query:vi.fn(),recent:vi.fn(),missions:vi.fn(),weekly:vi.fn(),cosmetics:vi.fn(),pathname:"/"}));
vi.mock("next/navigation", () => ({usePathname:() => mocks.pathname}));
vi.mock("@/lib/supabaseClient", () => ({getSupabaseClient:() => ({auth:{getSession:mocks.getSession,onAuthStateChange:mocks.subscribe}})}));
vi.mock("@/lib/progression/queries", () => ({getMyProgression:mocks.query,getMyRecentXpEvents:mocks.recent,getMyPermanentMissions:mocks.missions,getMyWeeklyMissions:mocks.weekly}));
vi.mock("@/lib/profileCosmetics",async importOriginal=>({...await importOriginal<typeof import("@/lib/profileCosmetics")>(),getMyProfileCosmetics:mocks.cosmetics}));
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
  mocks.cosmetics.mockResolvedValue(cosmeticsFixture());
  mocks.query.mockResolvedValue(getProgression(0)); mocks.recent.mockResolvedValue([]); mocks.missions.mockResolvedValue([]); mocks.weekly.mockResolvedValue({catalogVersion:1,weekStart:"2026-09-28",serverNow:"2098-12-30T12:00:00Z",nextResetAt:"2099-01-05T23:00:00Z",missions:[]});
});
afterEach(() => {cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();});
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
    expect(snapshot().summary).toBeNull(); expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.weekly).not.toHaveBeenCalled();expect(mocks.cosmetics).not.toHaveBeenCalled();
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

it("weekly error is isolated and shared refresh loads weekly",async()=>{
  mocks.weekly.mockRejectedValueOnce(new Error("weekly DB"));mount();await waitFor(()=>expect(snapshot().status).toBe("ready"));
  expect(snapshot().weeklyError).toBe(true);expect(snapshot().summary.level).toBe(1);expect(snapshot().missionsError).toBe(false);
  act(()=>notifyProgressionChanged());await waitFor(()=>expect(snapshot().weeklyError).toBe(false));expect(mocks.weekly).toHaveBeenCalledTimes(2);
});
it("ignores stale weekly response after account switch",async()=>{
  let resolve!: (value:unknown)=>void;mocks.weekly.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  mount();await waitFor(()=>expect(mocks.weekly).toHaveBeenCalledTimes(1));
  act(()=>auth("SIGNED_IN",session("b")));expect(snapshot().weeklySnapshot).toBeNull();
  await waitFor(()=>expect(snapshot().status).toBe("ready"));const current=snapshot().weeklySnapshot;
  await act(async()=>resolve({catalogVersion:99}));expect(snapshot().weeklySnapshot).toEqual(current);
});
it.each([0,600000,-600000])("server duration controls rollover with client clock offset %i",async offset=>{
  const strict=true;
  vi.useFakeTimers();vi.setSystemTime(new Date(Date.parse("2026-11-08T22:59:59Z")+offset));
  const missions=[{key:"regular_games",target:5,progress:4,rewardXp:300,completed:false,completedAt:null},
    {key:"wins",target:3,progress:2,rewardXp:300,completed:false,completedAt:null},
    {key:"solo_games",target:3,progress:2,rewardXp:200,completed:false,completedAt:null}];
  const weekA={catalogVersion:1,weekStart:"2026-11-02",serverNow:"2026-11-08T22:59:59Z",nextResetAt:"2026-11-08T23:00:00Z",missions};
  const weekB={...weekA,weekStart:"2026-11-09",serverNow:"2026-11-08T23:00:02Z",nextResetAt:"2026-11-15T23:00:00Z",missions:missions.map(m=>({...m,progress:0}))};
  mocks.weekly.mockResolvedValueOnce(weekA).mockResolvedValue(weekB);
  const child=<ProgressionProvider><Consumer/></ProgressionProvider>;
  const view=render(strict ? <React.StrictMode>{child}</React.StrictMode>:child);
  await act(async()=>{await vi.advanceTimersByTimeAsync(200);});expect(snapshot().weeklySnapshot.weekStart).toBe(weekA.weekStart);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1999);});expect(mocks.weekly).toHaveBeenCalledTimes(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(mocks.weekly).toHaveBeenCalledTimes(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(150);});expect(snapshot().weeklySnapshot.weekStart).toBe(weekB.weekStart);expect(snapshot().weeklySnapshot.missions).toEqual(weekB.missions);
  expect(mocks.weekly).toHaveBeenCalledTimes(2);
  const weekCDelay=Date.parse(weekB.nextResetAt)-Date.parse(weekB.serverNow)+1000;
  mocks.weekly.mockResolvedValue({...weekB,weekStart:"2026-11-16",serverNow:"2026-11-15T23:00:02Z",nextResetAt:"2026-11-22T23:00:00Z"});
  await act(async()=>{await vi.advanceTimersByTimeAsync(weekCDelay);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(150);});
  expect(mocks.weekly).toHaveBeenCalledTimes(3);view.unmount();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();
});
it("a stale reset response causes one local invalidation, never polling",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-04T21:59:59Z"));
  mocks.weekly.mockResolvedValue({catalogVersion:1,weekStart:"2026-09-28",serverNow:"2026-10-04T21:59:59Z",nextResetAt:"2026-10-04T22:00:00Z",missions:[]});
  const view=mount();await act(async()=>{await vi.advanceTimersByTimeAsync(200);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(mocks.weekly).toHaveBeenCalledTimes(2);
  act(()=>auth("SIGNED_OUT",null));expect(snapshot().weeklySnapshot).toBeNull();view.unmount();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();
});

it("a newer server snapshot of the same week rearms after an exact replay, account switch clears its timer",async()=>{
 vi.useFakeTimers();
 const a={catalogVersion:1,weekStart:"2026-09-28",serverNow:"2026-10-04T21:59:59Z",nextResetAt:"2026-10-04T22:00:00Z",missions:[]};
 mocks.weekly.mockResolvedValue(a);const view=mount();
 await act(async()=>{await vi.advanceTimersByTimeAsync(200);});
 await act(async()=>{await vi.advanceTimersByTimeAsync(2150);});expect(mocks.weekly).toHaveBeenCalledTimes(2);
 mocks.weekly.mockResolvedValue({...a,serverNow:"2026-10-04T21:59:59.500Z"});
 act(()=>notifyProgressionChanged());await act(async()=>{await vi.advanceTimersByTimeAsync(150);});
 await act(async()=>{await vi.advanceTimersByTimeAsync(1650);});expect(mocks.weekly).toHaveBeenCalledTimes(4);
 act(()=>auth("SIGNED_IN",session("b")));expect(snapshot().weeklySnapshot).toBeNull();
 await act(async()=>{await vi.advanceTimersByTimeAsync(150);});expect(snapshot().userId).toBe("b");
 expect(vi.getTimerCount()).toBe(1);
 act(()=>auth("SIGNED_OUT",null));expect(vi.getTimerCount()).toBe(0);view.unmount();
});

it("loads collection, isolates its failure, and refreshes through XP and equipment signals",async()=>{
 mount();await waitFor(()=>expect(snapshot().cosmeticsSnapshot.items).toHaveLength(24));
 mocks.cosmetics.mockRejectedValueOnce(new Error("collection private details"));
 act(()=>notifyProgressionChanged());await waitFor(()=>expect(snapshot().cosmeticsError).toBe(true));
 expect(snapshot().summary.level).toBe(1);expect(snapshot().weeklyError).toBe(false);expect(snapshot().missionsError).toBe(false);
 act(()=>window.dispatchEvent(new Event(PROFILE_COSMETICS_CHANGED_EVENT)));
 await waitFor(()=>expect(snapshot().cosmeticsError).toBe(false));expect(mocks.cosmetics).toHaveBeenCalledTimes(3);
 act(()=>auth("SIGNED_OUT",null));expect(snapshot().cosmeticsSnapshot).toBeNull();
});
it("clears collection on account switch and discards stale collection responses",async()=>{
 let resolve!:(value:unknown)=>void;mocks.cosmetics.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 mount();await waitFor(()=>expect(mocks.cosmetics).toHaveBeenCalledTimes(1));
 act(()=>auth("SIGNED_IN",session("b")));expect(snapshot().cosmeticsSnapshot).toBeNull();
 await waitFor(()=>expect(snapshot().status).toBe("ready"));const current=snapshot().cosmeticsSnapshot;
 await act(async()=>resolve(cosmeticsFixture(40)));expect(snapshot().cosmeticsSnapshot).toEqual(current);expect(snapshot().userId).toBe("b");
});

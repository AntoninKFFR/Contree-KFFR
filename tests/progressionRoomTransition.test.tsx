// @vitest-environment jsdom
import React, { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMultiplayerRoomSync, type MultiplayerRoomSyncServices } from "@/components/multiplayer/useMultiplayerRoomSync";
import { PROGRESSION_CHANGED_EVENT } from "@/lib/progression/events";
import { shouldInvalidateProgressionForRoomTransition } from "@/lib/progression/roomTransition";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/multiplayerPresence";
import type { MultiplayerRoomView } from "@/lib/roomTypes";

function view(gameId = "A", finished = false, version = 1): MultiplayerRoomView {
  return {
    gameId,
    room: {id:"room",code:"ABC123",status:finished ? "finished" : "playing",
      scoring_mode:"ffb",target_score:1000,game_phase:finished ? "game-over" : "playing",
      state_version:version,turn_deadline_at:null,created_at:"",updated_at:"",
      started_at:"",finished_at:finished ? "now" : null},
    players:[],isHost:false,canClaimHost:false,viewerSeatIndex:0,
    // Only the phase is relevant to this synchronization fixture.
    game:{phase:finished ? "game-over" : "playing"} as MultiplayerRoomView["game"],
  };
}

const signal = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  signal.mockClear();
  window.addEventListener(PROGRESSION_CHANGED_EVENT,signal);
});
afterEach(() => {
  cleanup();
  window.removeEventListener(PROGRESSION_CHANGED_EVENT,signal);
  vi.useRealTimers();
});

async function mount(initial: MultiplayerRoomView) {
  let latest = initial;
  let realtime!: () => void | Promise<void>;
  const session = {access_token:"token",user:{id:"me",user_metadata:{}}} as Session;
  const supabase = {auth:{getSession:async () => ({data:{session}}),
    onAuthStateChange:() => ({data:{subscription:{unsubscribe:vi.fn()}}})}} as unknown as SupabaseClient;
  const services: MultiplayerRoomSyncServices = {
    getSupabaseClient:() => supabase,
    ensureProfile:vi.fn(async () => "Tester"),
    fetchRoomView:vi.fn(async () => ({...latest})),
    sendPresenceHeartbeat:vi.fn(async () => ({...latest})),
    subscribeToRoomRealtime:vi.fn((_client,_id,refresh) => {realtime = refresh; return vi.fn();}),
  };
  const hook = renderHook(() => useMultiplayerRoomSync("room",services),{
    wrapper:({children}: {children: ReactNode}) => <StrictMode>{children}</StrictMode>,
  });
  await act(async () => {});
  await act(async () => {});
  expect(hook.result.current.roomWithPlayers?.gameId).toBe(initial.gameId);
  return {...hook,services,setLatest:(next: MultiplayerRoomView) => {latest = next;},
    reloadRealtime:() => realtime()};
}

describe("canonical terminal room transition", () => {
  it.each([
    [null,view("A",true),true],
    [view(),view("A",true),true],
    [view("A",true),view("A",true,2),false],
    [view("A",true),view("B"),false],
    [view("B"),view("B",true),true],
    [view("A",true),view("B",true),true],
    [view(),view("A",false,2),false],
    [null,{...view("A",true),game:null},false],
    [null,{...view("A",true),room:{...view().room,status:"playing"}},false],
  ])("compares the actual game identity and both terminal flags (%#)", (current,next,expected) => {
    expect(shouldInvalidateProgressionForRoomTransition(
      current as MultiplayerRoomView | null,next as MultiplayerRoomView,
    )).toBe(expected);
  });

  it("applies actions once, keeps ten terminal heartbeats and realtime/focus reloads silent, then handles rematch", async () => {
    const hook = await mount(view());
    expect(signal).not.toHaveBeenCalled();
    hook.setLatest(view("A",true,2));
    await act(async () => hook.result.current.setRoomWithPlayers(view("A",true,2)));
    expect(signal).toHaveBeenCalledTimes(1);
    const before = vi.mocked(hook.services.sendPresenceHeartbeat).mock.calls.length;
    for (let index = 0; index < 10; index++) {
      await act(async () => {await vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_INTERVAL_MS);});
    }
    expect(hook.services.sendPresenceHeartbeat).toHaveBeenCalledTimes(before+10);
    expect(signal).toHaveBeenCalledTimes(1);
    await act(async () => {await hook.reloadRealtime();});
    await act(async () => {window.dispatchEvent(new Event("focus"));});
    expect(signal).toHaveBeenCalledTimes(1);
    await act(async () => hook.result.current.setRoomWithPlayers(view("B",false,3)));
    expect(signal).toHaveBeenCalledTimes(1);
    await act(async () => hook.result.current.setRoomWithPlayers(view("B",true,4)));
    expect(signal).toHaveBeenCalledTimes(2);
  });

  it("initial finished load emits once even with StrictMode and repeated loads", async () => {
    const hook = await mount(view("A",true));
    expect(signal).toHaveBeenCalledTimes(1);
    await act(async () => {await hook.result.current.loadRoom({silent:true});});
    await act(async () => {await hook.reloadRealtime();});
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it.each(["realtime","heartbeat"])("observes terminal transition received through %s", async (path) => {
    const hook = await mount(view());
    hook.setLatest(view("A",true,2));
    await act(async () => {
      if (path === "realtime") await hook.reloadRealtime();
      else await vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_INTERVAL_MS);
    });
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it("does not invalidate repeated playing views or a rejected obsolete terminal load", async () => {
    const hook = await mount(view("A",false,3));
    await act(async () => {await hook.reloadRealtime();});
    await act(async () => {await vi.advanceTimersByTimeAsync(10*PRESENCE_HEARTBEAT_INTERVAL_MS);});
    hook.setLatest(view("A",true,2));
    await act(async () => {await hook.reloadRealtime();});
    expect(hook.result.current.roomWithPlayers?.room.state_version).toBe(3);
    expect(signal).not.toHaveBeenCalled();
  });
});

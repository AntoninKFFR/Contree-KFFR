// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { soloSessionTransport } from "@/lib/solo/sessionApi";
import { fetchRoomView, sendPresenceHeartbeat, sendRoomTick, sendRoomIntent } from "@/lib/multiplayerApi";
import { PROGRESSION_CHANGED_EVENT } from "@/lib/progression/events";

vi.mock("@/lib/supabaseClient", () => ({getSupabaseClient:() => ({auth:{getSession:async () => ({data:{session:{user:{id:"me"},access_token:"token"}},error:null})}})}));
const fetchMock = vi.fn();
const signal = vi.fn();
beforeEach(() => {vi.clearAllMocks(); vi.stubGlobal("fetch",fetchMock); window.addEventListener(PROGRESSION_CHANGED_EVENT,signal);});
afterEach(() => {window.removeEventListener(PROGRESSION_CHANGED_EVENT,signal); vi.unstubAllGlobals();});
describe("read-only progression invalidation at game boundaries", () => {
  it("Solo terminal server response emits a signal, ordinary moves do not", async () => {
    const session = {id:"server-session",version:3,state:{phase:"game-over"}};
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({data:session}))).mockResolvedValueOnce(new Response(JSON.stringify({data:{...session,state:{phase:"bidding"}}})));
    await soloSessionTransport.start({},"nonce"); expect(signal).toHaveBeenCalledTimes(1);
    await soloSessionTransport.start({},"another-nonce"); expect(signal).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/solo/sessions")).toBe(true);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("credit_progression_xp");
  });
  it("raw Multi reads, heartbeats, ticks and actions never dispatch even for a finished game", async () => {
    const data = {room:{status:"finished"},game:{phase:"game-over"}};
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({data})));
    await fetchRoomView("room",{access_token:"token"});
    await sendPresenceHeartbeat("room",{access_token:"token"});
    await sendRoomTick("room",{access_token:"token"});
    await sendRoomIntent("room",1,{type:"forfeit-game"},{access_token:"token"});
    expect(signal).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("progression_xp");
  });
  it("Multi nonterminal response does not invalidate progression", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({data:{room:{status:"playing"},game:{phase:"playing"}}})));
    await fetchRoomView("room",{access_token:"token"}); expect(signal).not.toHaveBeenCalled();
  });
});

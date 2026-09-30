// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialGame } from "@/engine/game";
import { toPlayerGameView } from "@/engine/views";
import { applyGameAction } from "@/engine/actions";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";
import { useSoloGameLoop } from "@/lib/solo/useSoloGameLoop";
import type { SoloSession, SoloTransport } from "@/lib/solo/sessionTypes";

function initial(): SoloSession { return { id:"server-issued-id",version:0,state:toPlayerGameView(createInitialGame(() => 0.1), 0) }; }
function adapter() {
  let state = createInitialGame(() => 0.1);
  return { load:vi.fn().mockResolvedValue(null),start:vi.fn().mockResolvedValue(initial()),
    move:vi.fn().mockImplementation(async (session,intent) => ({ ...session,version:session.version+1,
      state:toPlayerGameView(state = applyGameAction(state,intent), 0) })) } satisfies SoloTransport;
}
function mount(transport: SoloTransport) {
  return renderHook(() => useSoloGameLoop({preferences:clonePlayerPreferences(),effectiveReducedMotion:false,transport}));
}
describe("Solo connected transport compatibility", () => {
  it("never runs bot review or bidding analysis against a connected public view", async () => {
    const transport = adapter();
    const onBotDecision = vi.fn();
    const onBiddingStateChange = vi.fn();
    const {result,unmount} = renderHook(() => useSoloGameLoop({preferences:clonePlayerPreferences(),
      effectiveReducedMotion:false,transport,onBotDecision,onBiddingStateChange}));
    await waitFor(() => expect(result.current.isBusy).toBe(false));
    await act(async () => { result.current.startGame(); });
    await act(async () => { result.current.dispatchGameAction({type:"pass",playerId:0}); });
    expect(result.current.gameState).not.toHaveProperty("hands");
    expect(onBotDecision).not.toHaveBeenCalled();
    expect(onBiddingStateChange).not.toHaveBeenCalled();
    unmount();
  });

  it("uses server identity and sends only actions, with double-click suppression", async () => {
    const transport = adapter();
    const { result,unmount } = mount(transport);
    await waitFor(() => expect(result.current.isBusy).toBe(false));
    await act(async () => { result.current.startGame(); });
    expect(result.current.sessionId).toBe("server-issued-id");
    expect(result.current.gameState).toEqual(initial().state);
    await act(async () => {
      result.current.dispatchGameAction({type:"pass",playerId:0});
      result.current.dispatchGameAction({type:"pass",playerId:0});
    });
    expect(transport.move).toHaveBeenCalledTimes(1);
    expect(transport.move).toHaveBeenCalledWith(initial(),{type:"pass",playerId:0});
    expect(result.current.gameState?.currentPlayerId).toBe(1);
    unmount();
  });
  it("keeps a failed transition retryable with the same revision and no local advancement", async () => {
    const transport = adapter();
    transport.move.mockRejectedValueOnce(new Error("network"));
    const {result,unmount} = mount(transport);
    await waitFor(() => expect(result.current.isBusy).toBe(false));
    await act(async () => { result.current.startGame(); });
    await act(async () => { result.current.dispatchGameAction({type:"pass",playerId:0}); });
    expect(result.current.gameState).toEqual(initial().state);
    expect(result.current.connectionError).toBeTruthy();
    expect(result.current.humanCanBid).toBe(false);
    await act(async () => { result.current.retrySynchronization(); });
    expect(result.current.connectionError).toBeNull();
    expect(transport.move.mock.calls[0]).toEqual(transport.move.mock.calls[1]);
    unmount();
  });
  it("resumes a finished server session on reload without another completion request", async () => {
    const transport = adapter();
    const completed = initial();
    completed.version = 88;
    completed.state = {...completed.state,phase:"game-over",winnerTeam:0};
    transport.load.mockResolvedValue(completed);
    const {result,unmount} = mount(transport);
    await waitFor(() => expect(result.current.gameState?.phase).toBe("game-over"));
    expect(result.current.sessionId).toBe(completed.id);
    expect(transport.start).not.toHaveBeenCalled();
    expect(transport.move).not.toHaveBeenCalled();
    unmount();
  });
  it("keeps anonymous Solo local and does not submit local results", async () => {
    const transport = adapter();
    transport.start.mockResolvedValue(null);
    const {result,unmount} = mount(transport);
    await waitFor(() => expect(result.current.isBusy).toBe(false));
    const random = vi.spyOn(Math,"random").mockReturnValue(0.1);
    await act(async () => { result.current.startGame(); });
    expect(result.current.sessionId).toBeNull();
    act(() => result.current.dispatchGameAction({type:"pass",playerId:0}));
    expect(result.current.gameState?.currentPlayerId).toBe(1);
    expect(transport.move).not.toHaveBeenCalled();
    unmount();
    random.mockRestore();
  });
  it("does not fall back to unverified Solo after an authenticated startup failure", async () => {
    const transport = adapter();
    transport.start.mockRejectedValue(new Error("network"));
    const {result,unmount} = mount(transport);
    await waitFor(() => expect(result.current.isBusy).toBe(false));
    await act(async () => { result.current.startGame(); });
    expect(result.current.gameState).toBeNull();
    expect(result.current.connectionError).toBeTruthy();
    unmount();
  });
});

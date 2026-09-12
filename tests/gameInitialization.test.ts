import { afterEach, describe, expect, it, vi } from "vitest";
import { createSoloGame } from "@/app/solo/soloGameInitialization";
import { createInitialGame, startNextRound } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("production game initialization", () => {
  it("keeps deterministic random injection reproducible", () => {
    const first = createSoloGame(createSeededRandom(1201));
    const replay = createSoloGame(createSeededRandom(1201));

    expect(replay).toEqual(first);
  });

  it("produces different games for different injected random streams", () => {
    const first = createSoloGame(createSeededRandom(1201));
    const second = createSoloGame(createSeededRandom(1202));

    expect({
      hands: second.hands,
      names: second.playerNames,
      starter: second.startingPlayerId,
    }).not.toEqual({
      hands: first.hands,
      names: first.playerNames,
      starter: first.startingPlayerId,
    });
  });

  it("uses the runtime random source when solo does not inject one", () => {
    const runtimeRandom = vi.spyOn(Math, "random").mockReturnValue(0.25);

    const state = createSoloGame();

    expect(runtimeRandom).toHaveBeenCalled();
    expect(state.startingPlayerId).toBe(1);
  });

  it("keeps the next-round starter rotation while reshuffling", () => {
    const initial = createInitialGame(createSeededRandom(1301));
    const finished = { ...initial, phase: "finished" as const };
    const next = startNextRound(finished, createSeededRandom(1302));

    expect(next.startingPlayerId).toBe((initial.startingPlayerId + 1) % 4);
    expect(next.hands).not.toEqual(initial.hands);
    expect(next.playerNames).toEqual(initial.playerNames);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createInitialGame, playableCardsForCurrentPlayer } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { createGameSettings } from "@/engine/rulesets/resolve";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { advanceSoloState, parseSoloIntent } from "@/lib/server/soloGame";
import { chooseBotBid } from "@/bots/simpleBot";
import { toPlayerGameView } from "@/engine/views";
import { soloLegalHumanCards } from "@/lib/solo/publicState";
import type { GameAction } from "@/engine/actions";

vi.mock("server-only", () => ({}));

describe("authoritative Solo actions", () => {
  it.each([
    { won: true }, { type: "finish", winnerTeam: 0 }, { type: "pass", playerId: 1 },
    { type: "pass", playerId: 0, xp: 30 }, { type: "advance-bot", state: { phase: "game-over" } },
    { type: "play-card", playerId: 0, card: { suit: "clubs", rank: "fake" } },
    { type: "bid", playerId: 0, value: "80", trump: "clubs" },
    { type: "bid", playerId: 0, value: 80, contractMode: { kind: "suit", suit: "clubs", seed: 2 } },
  ])("rejects forged intent %j", (input) => expect(() => parseSoloIntent(input)).toThrow());

  it("requires the actual stored turn and rejects an illegal card", () => {
    const state = createInitialGame(createSeededRandom(7));
    if (state.currentPlayerId === 0) {
      expect(() => advanceSoloState(state, { type: "advance-bot" })).toThrow("human_solo_turn");
    } else {
      expect(() => advanceSoloState(state, { type: "pass", playerId: 0 })).toThrow("not_solo_turn");
    }
    expect(() => advanceSoloState(state, { type: "start-next-round" })).toThrow("wrong_solo_phase");
    expect(() => advanceSoloState(state, { type: "play-card", playerId: 0, card: { rank: "A", suit: "clubs" } })).toThrow();
  });

  it("runs genuine complete games through unchanged rules and server-controlled bots", () => {
    const outcomes = new Set<number>();
    for (let seed = 1; seed <= 8 && outcomes.size < 2; seed += 1) {
      let state = createInitialGame(createSeededRandom(seed), createGameSettings({ ruleset: buildCustomRuleset({
        presetId: "contree-kffr", overrides: { game: { targetScore: 100 } },
      }) }));
      for (let step = 0; step < 500 && state.phase !== "game-over"; step += 1) {
        if (state.phase === "finished") state = advanceSoloState(state, { type: "start-next-round" });
        else if (state.currentPlayerId !== 0) state = advanceSoloState(state, { type: "advance-bot" });
        else if (state.phase === "playing") {
          expect(soloLegalHumanCards(toPlayerGameView(state, 0))).toEqual(playableCardsForCurrentPlayer(state));
          state = advanceSoloState(state, {
          type: "play-card", playerId: 0, card: soloLegalHumanCards(toPlayerGameView(state, 0))[0],
        });
        } else {
          const bid = chooseBotBid(state);
          state = advanceSoloState(state, { ...bid, type: bid.action, playerId: 0 } as GameAction);
        }
      }
      expect(state.phase).toBe("game-over");
      expect(state.totalScore[state.winnerTeam!]).toBeGreaterThanOrEqual(100);
      expect(advanceSoloState(state, { type: "advance-bot" })).toBe(state);
      outcomes.add(state.winnerTeam!);
    }
    expect([...outcomes].sort()).toEqual([0, 1]);
  }, 30_000);
});

// Test-only: generate genuine states with the web engine. Never bundled in Expo.
import { createInitialGame } from "../../engine/game";
import { applyGameAction } from "../../engine/actions";
import { getLegalCards } from "../../engine/rules";
import { resolveContractMode } from "../../engine/contractMode";
import { resolveGameRules } from "../../engine/rulesets/resolve";
import type { GameState } from "../../engine/types";
import { buildCustomRuleset } from "../../engine/rulesets/custom";
import { createGameSettings } from "../../engine/rulesets/resolve";

export function soloParityStates(): Record<"bidding" | "start" | "trick" | "result", GameState> {
  let seed = 741;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  // The first draw determines the opening player, then all deals are seeded.
  let first = true;
  const bidding = createInitialGame(() => { if (first) { first = false; return .1; } return random(); }, { targetScore: 10000 });
  bidding.playerNames = { 0: "Antonin", 1: "Léa", 2: "Hugo", 3: "Emma" };
  let state = applyGameAction(bidding, { type: "bid", playerId: 0, value: 90, contractMode: { kind: "suit", suit: "hearts" } });
  while (state.phase === "bidding") state = applyGameAction(state, { type: "pass", playerId: state.currentPlayerId });
  const start = state;
  let trick: GameState | undefined;
  while (state.phase === "playing") {
    const mode = resolveContractMode(state); if (!mode) throw new Error("A playing parity state needs a real contract mode");
    const card = getLegalCards(state.hands[state.currentPlayerId], state.currentTrick, state.currentPlayerId, mode, resolveGameRules(state.settings).cardPlay)[0];
    state = applyGameAction(state, { type: "play-card", playerId: state.currentPlayerId, card });
    if (!trick && state.phase === "playing" && state.currentPlayerId === 0 && state.currentTrick.cards.length > 0) trick = state;
  }
  if (!trick || !state.result) throw new Error("Parity seed must cover a human turn inside a trick and a scored round");
  return { bidding, start, trick, result: state };
}

export function soloParityBiddingStates() {
  const initial = (opening: number, specials = true) => {
    let first = true, seed = 741;
    return createInitialGame(() => { if (first) { first = false; return opening / 4 + .01; } return ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); }, createGameSettings({ ruleset: buildCustomRuleset({ presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: specials, allowAllTrump: specials, allowGenerale: specials, allowCapot: specials, generaleAllowNoTrump: specials, generaleAllowAllTrump: specials } } }) }));
  };
  const passes = (game: GameState, count: number) => { for (let i = 0; i < count; i++) game = applyGameAction(game, { type: "pass", playerId: game.currentPlayerId }); return game; };
  const advanced = initial(0);
  const coinche = passes(applyGameAction(initial(1), { type: "bid", playerId: 1, value: 90, contractMode: { kind: "suit", suit: "hearts" } }), 2);
  const surcoinche = passes(applyGameAction(applyGameAction(initial(0), { type: "bid", playerId: 0, value: 90, contractMode: { kind: "suit", suit: "hearts" } }), { type: "coinche", playerId: 1 }), 2);
  const actionOnly = passes(applyGameAction(initial(1, false), { type: "bid", playerId: 1, value: 160, contractMode: { kind: "suit", suit: "hearts" } }), 2);
  for (const game of [advanced, coinche, surcoinche, actionOnly]) { if (game.currentPlayerId !== 0 || game.phase !== "bidding") throw new Error("Bidding parity states must be human turns"); }
  return { advanced, coinche, surcoinche, actionOnly };
}

export function soloParityIllegalState(): GameState {
  for (let seedIndex = 1; seedIndex <= 100; seedIndex++) {
    let seed = seedIndex, first = true;
    let state = createInitialGame(() => { if (first) { first = false; return .01; } return ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); });
    state = applyGameAction(state, { type: "bid", playerId: 0, value: 80, contractMode: { kind: "suit", suit: "hearts" } });
    while (state.phase === "bidding") state = applyGameAction(state, { type: "pass", playerId: state.currentPlayerId });
    while (state.phase === "playing") {
      const mode = resolveContractMode(state); if (!mode) throw new Error("Playing fixture requires a contract");
      const legal = getLegalCards(state.hands[state.currentPlayerId], state.currentTrick, state.currentPlayerId, mode, resolveGameRules(state.settings).cardPlay);
      if (state.currentPlayerId === 0 && state.hands[0].length > legal.length) return state;
      state = applyGameAction(state, { type: "play-card", playerId: state.currentPlayerId, card: legal[0] });
    }
  }
  throw new Error("The parity seed must include a genuine illegal human card");
}

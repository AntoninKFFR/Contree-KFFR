import { resolveContractMode } from "@/engine/contractMode";
import { inactivePlayerId } from "@/engine/activePlayers";
import { getLegalCards } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import type { Card, GameState, PlayerId } from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";

export type SoloDisplayState = GameState | PlayerGameView;

export function soloHumanHand(state: SoloDisplayState, playerId: PlayerId): Card[] {
  return "hands" in state ? state.hands[playerId] : state.hand;
}

export function soloLegalHumanCards(state: SoloDisplayState): Card[] {
  if ("hands" in state) {
    const mode = resolveContractMode(state);
    if (state.phase !== "playing" || state.currentPlayerId === inactivePlayerId(state) || !mode) return [];
    return getLegalCards(state.hands[state.currentPlayerId], state.currentTrick, state.currentPlayerId, mode,
      resolveGameRules(state.settings).cardPlay);
  }
  const mode = resolveContractMode(state);
  if (state.phase !== "playing" || state.currentPlayerId !== state.viewerPlayerId
    || state.currentPlayerId === state.inactivePlayerId || !mode) return [];
  return getLegalCards(state.hand, state.currentTrick, state.viewerPlayerId, mode,
    resolveGameRules(state.settings).cardPlay);
}

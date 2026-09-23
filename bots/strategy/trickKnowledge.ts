import type { GameState } from "@/engine/types";
import {
  getVisibleCards as tableGetVisibleCards,
  getPlayedCards as tableGetPlayedCards,
  inferVoidSuitsByPlayer as tableInferVoidSuitsByPlayer,
  getPlayedTrumps as tableGetPlayedTrumps,
  getRemainingTrumps as tableGetRemainingTrumps,
  getMasterCardsStillOutBySuit as tableGetMasterCardsStillOutBySuit,
  getRemainingCardsBySuit as tableGetRemainingCardsBySuit,
  getCutRiskBySuit as tableGetCutRiskBySuit,
  getDeadSuits as tableGetDeadSuits,
  getWeakenedSuits as tableGetWeakenedSuits,
  buildTableKnowledge,
} from "@/engine/knowledge/tableKnowledge";
export type { CutRiskInfo, CutRiskLevel, TrickKnowledge } from "@/engine/knowledge/tableKnowledge";

export function getVisibleCards(state: GameState): ReturnType<typeof tableGetVisibleCards> {
  return tableGetVisibleCards(state, state.currentPlayerId);
}

export function getPlayedCards(state: GameState): ReturnType<typeof tableGetPlayedCards> {
  return tableGetPlayedCards(state, state.currentPlayerId);
}

export function inferVoidSuitsByPlayer(state: GameState): ReturnType<typeof tableInferVoidSuitsByPlayer> {
  return tableInferVoidSuitsByPlayer(state, state.currentPlayerId);
}

export function getPlayedTrumps(state: GameState): ReturnType<typeof tableGetPlayedTrumps> {
  return tableGetPlayedTrumps(state, state.currentPlayerId);
}

export function getRemainingTrumps(state: GameState): ReturnType<typeof tableGetRemainingTrumps> {
  return tableGetRemainingTrumps(state, state.currentPlayerId);
}

export function getMasterCardsStillOutBySuit(state: GameState): ReturnType<typeof tableGetMasterCardsStillOutBySuit> {
  return tableGetMasterCardsStillOutBySuit(state, state.currentPlayerId);
}

export function getRemainingCardsBySuit(state: GameState): ReturnType<typeof tableGetRemainingCardsBySuit> {
  return tableGetRemainingCardsBySuit(state, state.currentPlayerId);
}

export function getCutRiskBySuit(state: GameState): ReturnType<typeof tableGetCutRiskBySuit> {
  return tableGetCutRiskBySuit(state, state.currentPlayerId);
}

export function getDeadSuits(state: GameState): ReturnType<typeof tableGetDeadSuits> {
  return tableGetDeadSuits(state, state.currentPlayerId);
}

export function getWeakenedSuits(state: GameState): ReturnType<typeof tableGetWeakenedSuits> {
  return tableGetWeakenedSuits(state, state.currentPlayerId);
}

export function buildTrickKnowledge(state: GameState): ReturnType<typeof buildTableKnowledge> {
  return buildTableKnowledge(state, state.currentPlayerId);
}

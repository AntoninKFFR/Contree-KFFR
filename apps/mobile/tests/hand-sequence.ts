import fixtures from "./hand/states.json";
import { parsePlayerGameView, type Card } from "../src/solo/contract";
import type { PlayerId } from "../../../engine/types";
export function handSequence(viewer: PlayerId = 0) {
  const sequence = fixtures.sequences[viewer];
  return { states: sequence.states.map(parsePlayerGameView), plays: sequence.plays as Card[] };
}

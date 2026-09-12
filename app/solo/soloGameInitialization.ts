import { createInitialGame } from "@/engine/game";
import { createGameSettings } from "@/engine/rulesets/resolve";
import type { GameState } from "@/engine/types";

export function createSoloGame(random = Math.random): GameState {
  return createInitialGame(random, createGameSettings());
}

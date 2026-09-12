import { createInitialGame } from "@/engine/game";
import type { GameState } from "@/engine/types";
import { PRODUCT_SCORING_MODE } from "@/lib/productGame";

export function createSoloGame(random = Math.random): GameState {
  return createInitialGame(random, {
    scoringMode: PRODUCT_SCORING_MODE,
  });
}

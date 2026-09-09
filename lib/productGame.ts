import type { ScoringMode } from "@/engine/types";

export const PRODUCT_SCORING_MODE = "ffb" as const satisfies ScoringMode;
export const PRODUCT_GAME_LABEL = "Contrée classique";

export function scoringModeLabel(value: string | null): string {
  if (value === PRODUCT_SCORING_MODE) return PRODUCT_GAME_LABEL;
  if (value === "made-points") return "Points faits (ancien mode)";
  if (value === "announced-points") return "Points annoncés (ancien mode)";
  return value ?? "Mode inconnu";
}

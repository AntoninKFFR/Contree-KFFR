import { trainingAxes } from "@/engine/training/axes";
import type { InGameAxisId } from "@/engine/training/inGame";

export function inGameAxisLabel(id: InGameAxisId): string {
  return id === "opponent-voids" ? "Couleurs prouvées" : trainingAxes.resolve(id).label;
}

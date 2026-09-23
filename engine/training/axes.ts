import { createTrainingAxisRegistry } from "@/engine/training/registry";
import { trickValueAxis } from "@/engine/training/trickValue";

export const trainingAxes = createTrainingAxisRegistry([trickValueAxis]);

export function isTrainingAxisId(axisId: string): boolean {
  return trainingAxes.list().some((axis) => axis.id === axisId);
}

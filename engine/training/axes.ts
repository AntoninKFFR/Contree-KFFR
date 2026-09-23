import { createTrainingAxisRegistry } from "@/engine/training/registry";
import { roundCountAxis } from "@/engine/training/roundCount";
import { runningScoreAxis } from "@/engine/training/runningScore";
import { trickValueAxis } from "@/engine/training/trickValue";

export const trainingAxes = createTrainingAxisRegistry([trickValueAxis, roundCountAxis, runningScoreAxis]);

export function isTrainingAxisId(axisId: string): boolean {
  return trainingAxes.list().some((axis) => axis.id === axisId);
}

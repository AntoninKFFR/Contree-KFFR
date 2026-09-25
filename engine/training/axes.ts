import { pileCountAxis } from "@/engine/training/pileCount";
import { createTrainingAxisRegistry } from "@/engine/training/registry";
import { trickValueAxis } from "@/engine/training/trickValue";
import { createMemoryExercise, MEMORY_AXIS_IDS, MEMORY_LABELS } from "@/engine/training/memory";
import { opponentVoidsAxis } from "@/engine/training/opponentVoids";
import { memoryInGame, opponentVoidsInGame, trickValueInGame } from "@/engine/training/inGame";

export const trainingAxes = createTrainingAxisRegistry([
  Object.assign(trickValueAxis, { inGame: trickValueInGame }),
  pileCountAxis,
  Object.assign(opponentVoidsAxis, { inGame: opponentVoidsInGame }),
  ...MEMORY_AXIS_IDS.map((id) => ({ id, label: MEMORY_LABELS[id], createExercise: (position: Parameters<typeof trickValueAxis.createExercise>[0]) =>
    createMemoryExercise(id, 1, position.state, position.seed), inGame: memoryInGame(id) })),
]);

export function isTrainingAxisId(axisId: string): boolean {
  return trainingAxes.list().some((axis) => axis.id === axisId);
}

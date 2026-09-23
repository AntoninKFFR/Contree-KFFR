import type { TrainingPosition } from "@/engine/training/generator";

export type TrainingAxis<TExercise = unknown> = {
  id: string;
  label: string;
  createExercise: (position: TrainingPosition) => TExercise;
};

export function createTrainingAxisRegistry(axes: readonly TrainingAxis[] = []) {
  const byId = new Map<string, TrainingAxis>();

  function register(axis: TrainingAxis): void {
    if (!axis.id.trim()) throw new Error("Training axis id cannot be empty.");
    if (byId.has(axis.id)) throw new Error(`Training axis already registered: ${axis.id}`);
    byId.set(axis.id, axis);
  }

  axes.forEach(register);
  return {
    register,
    resolve(id: string): TrainingAxis {
      const axis = byId.get(id);
      if (!axis) throw new Error(`Unknown training axis: ${id}`);
      return axis;
    },
    list(): TrainingAxis[] {
      return [...byId.values()];
    },
  };
}

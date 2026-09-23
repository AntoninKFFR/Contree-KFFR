import { performance } from "node:perf_hooks";
import { generatorVersion } from "@/engine/training/generator";
import { generateTrickValueSeries, type TrickValueLevel } from "@/engine/training/trickValue";

for (const level of [1, 2] as const satisfies readonly TrickValueLevel[]) {
  const timings: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    const start = performance.now();
    const exercises = generateTrickValueSeries({ seed: 480000 + level * 100000 + index * 10, generatorVersion, level });
    timings.push(performance.now() - start);
    if (exercises.length !== 10) throw new Error("Incomplete trick-value series.");
  }
  const sorted = [...timings].sort((left, right) => left - right);
  console.log(`Level ${level}: first ${timings[0].toFixed(1)} ms, median ${sorted[10].toFixed(1)} ms, max ${sorted.at(-1)!.toFixed(1)} ms (20 series of 10, local runtime)`);
}

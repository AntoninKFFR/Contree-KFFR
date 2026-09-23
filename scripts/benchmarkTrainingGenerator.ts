import { performance } from "node:perf_hooks";
import { generateTrainingSeries, generatorVersion } from "@/engine/training/generator";

const seed = 370037;
const count = 10;
const start = performance.now();
const positions = generateTrainingSeries({ seed, generatorVersion, count });
const elapsedMs = performance.now() - start;
console.log(JSON.stringify({ seed, generatorVersion, count: positions.length, elapsedMs }, null, 2));

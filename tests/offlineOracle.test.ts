import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialGame } from "@/engine/game";
import { createSeededRandom } from "@/engine/random";
import { oracleCardValues, decisionRegret } from "@/simulation/offlineOracle";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"));
}

describe("offline perfect-information oracle", () => {
  it("evaluates every legal card and computes non-negative regret", () => {
    const initial = createInitialGame(createSeededRandom(42));
    const state = { ...initial, phase: "playing" as const, trump: "hearts" as const, contract: { playerId: 0 as const, teamId: 0 as const, value: 80 as const, trump: "hearts" as const, status: "normal" as const } };
    const oracle = oracleCardValues(state);
    expect(oracle.values.length).toBeGreaterThan(0);
    expect(decisionRegret(oracle, oracle.bestCard)).toBe(0);
  });

  it("is isolated from production bot and server modules", () => {
    const roots = [join(process.cwd(), "bots"), join(process.cwd(), "lib", "server")];
    for (const file of roots.flatMap(sourceFiles)) {
      expect(readFileSync(file, "utf8")).not.toContain("offlineOracle");
    }
  });
});

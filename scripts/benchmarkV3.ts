import { runSimulation } from "@/simulation/simulator";
import type { BotProfileId } from "@/bots/profiles";

const mode = process.argv.find((argument) => argument.startsWith("--mode="))?.split("=")[1]?.toUpperCase() ?? "FAST";
const gamesPerSide = mode === "FULL" ? 50 : 10;
const seed = Number(process.argv.find((argument) => argument.startsWith("--seed="))?.split("=")[1] ?? 20260908);
const targetScore = 300;

function run(v3Team: 0 | 1) {
  const profiles: Record<0 | 1, BotProfileId> = v3Team === 0
    ? { 0: "main_montecarlo_v3", 1: "main_montecarlo_v2" }
    : { 0: "main_montecarlo_v2", 1: "main_montecarlo_v3" };
  const started = performance.now();
  const decisions: Record<string, number[]> = { main_montecarlo_v2: [], main_montecarlo_v3: [] };
  const summary = runSimulation({
    games: gamesPerSide, seed, settings: { targetScore }, teamProfiles: profiles,
    onDecision: (profile, elapsedMs, kind) => { if (kind === "card") decisions[profile]?.push(elapsedMs); },
  });
  return { summary, decisions, elapsedMs: performance.now() - started, v3Team };
}

const runs = [run(0), run(1)];
const games = gamesPerSide * 2;
const v3Wins = runs.reduce((sum, result) => sum + result.summary.wins[result.v3Team], 0);
const v2Wins = games - v3Wins;
const v3Scores = runs.reduce((sum, result) => sum + result.summary.totalScore[result.v3Team], 0);
const v2Scores = runs.reduce((sum, result) => sum + result.summary.totalScore[result.v3Team === 0 ? 1 : 0], 0);
const v3Stats = runs.map((result) => result.summary.profileStats.main_montecarlo_v3);
const v2Stats = runs.map((result) => result.summary.profileStats.main_montecarlo_v2);
const aggregate = (stats: typeof v3Stats, field: keyof (typeof v3Stats)[number]) => stats.reduce((sum, item) => sum + item[field], 0);
const elapsedMs = runs.reduce((sum, result) => sum + result.elapsedMs, 0);
const timings = (profile: "main_montecarlo_v2" | "main_montecarlo_v3") => runs.flatMap((result) => result.decisions[profile]).sort((a, b) => a - b);
const timing = (profile: "main_montecarlo_v2" | "main_montecarlo_v3") => {
  const values = timings(profile);
  return {
    decisions: values.length,
    averageMs: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
    p95Ms: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] ?? 0,
  };
};

console.log(JSON.stringify({
  mode, seed, games, gamesPerSide, targetScore,
  v3: {
    wins: v3Wins, winRate: v3Wins / games, averageScore: v3Scores / games,
    attackAverage: aggregate(v3Stats, "attackScore") / Math.max(1, aggregate(v3Stats, "attackRounds")),
    defenseAverage: aggregate(v3Stats, "defenseScore") / Math.max(1, aggregate(v3Stats, "defenseRounds")),
    contractsSucceeded: aggregate(v3Stats, "contractsSucceeded"),
    contractsAttempted: aggregate(v3Stats, "contractsAttempted"),
    contractsFailed: aggregate(v3Stats, "contractsFailed"),
  },
  v2: {
    wins: v2Wins, winRate: v2Wins / games, averageScore: v2Scores / games,
    attackAverage: aggregate(v2Stats, "attackScore") / Math.max(1, aggregate(v2Stats, "attackRounds")),
    defenseAverage: aggregate(v2Stats, "defenseScore") / Math.max(1, aggregate(v2Stats, "defenseRounds")),
    contractsSucceeded: aggregate(v2Stats, "contractsSucceeded"),
    contractsAttempted: aggregate(v2Stats, "contractsAttempted"),
    contractsFailed: aggregate(v2Stats, "contractsFailed"),
  },
  coinches: runs.reduce((sum, result) => sum + result.summary.coinchesAttempted, 0),
  performance: { elapsedMs, averageGameMs: elapsedMs / games, v2: timing("main_montecarlo_v2"), v3: timing("main_montecarlo_v3") },
}, null, 2));

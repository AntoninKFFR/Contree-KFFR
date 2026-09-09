import { ALL_BOT_STRATEGIES, findBotStrategy } from "@/simulation/botRegistry";
import { formatTournament, runRoundRobin } from "@/simulation/tournament";

const read = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const seed = Number(read("seed") ?? 20260909);
const explicitGames = Number(read("games") ?? 0);
const games = explicitGames || (process.argv.includes("--full") ? 100 : 20);
const requested = read("profiles")?.split(",").filter(Boolean);
const profiles = requested?.length ? requested.map(findBotStrategy) : ALL_BOT_STRATEGIES;
const result = runRoundRobin(profiles, games, seed, (completed, total, matchup) => {
  if (!process.argv.includes("--json")) {
    console.error(`[${completed}/${total}] ${matchup.first} ${matchup.firstWins}-${matchup.secondWins} ${matchup.second}`);
  }
});

if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else console.log(formatTournament(result));

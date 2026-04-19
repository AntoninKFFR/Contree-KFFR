import { BOT_PROFILES, type BotProfileId } from "@/bots/profiles";
import type { ScoringMode } from "@/engine/types";
import { runSimulation } from "@/simulation/simulator";
import { formatSimulationSummary } from "@/simulation/stats";

type CliOptions = {
  games: number;
  team0: BotProfileId;
  team1: BotProfileId;
  scoringMode: ScoringMode;
  seed: number;
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readProfile(name: string, fallback: BotProfileId): BotProfileId {
  const value = readArg(name);
  if (!value) return fallback;

  if (value in BOT_PROFILES) {
    return value as BotProfileId;
  }

  throw new Error(
    `Profil inconnu: ${value}. Profils possibles: main, main_montecarlo, prudent, balanced, aggressive.`,
  );
}

function readOptions(): CliOptions {
  const games = Number(readArg("games") ?? 100);
  const scoring = readArg("scoring") ?? "made-points";

  if (!Number.isInteger(games) || games <= 0) {
    throw new Error("Utilise un nombre positif pour --games, par exemple --games=1000.");
  }

  if (scoring !== "made-points" && scoring !== "announced-points") {
    throw new Error("Utilise --scoring=made-points ou --scoring=announced-points.");
  }

  return {
    games,
    team0: readProfile("team0", "balanced"),
    team1: readProfile("team1", "aggressive"),
    scoringMode: scoring,
    seed: Number(readArg("seed") ?? 1),
  };
}

const options = readOptions();
const summary = runSimulation({
  games: options.games,
  seed: options.seed,
  settings: { scoringMode: options.scoringMode },
  teamProfiles: {
    0: options.team0,
    1: options.team1,
  },
});

console.log(formatSimulationSummary(summary));

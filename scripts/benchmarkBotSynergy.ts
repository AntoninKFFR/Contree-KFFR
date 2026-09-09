import { findBotStrategy, type BotStrategyDefinition } from "@/simulation/botRegistry";
import { playTournamentGame } from "@/simulation/tournament";

type Lineup = { id: string; first: BotStrategyDefinition; partner: BotStrategyDefinition };
const seed = Number(process.argv.find((argument) => argument.startsWith("--seed="))?.split("=")[1] ?? 20262309);
const games = Number(process.argv.find((argument) => argument.startsWith("--games="))?.split("=")[1] ?? 40);
if (games % 4 !== 0) throw new Error("Le benchmark synergy exige un multiple de 4 parties.");

const v1 = findBotStrategy("main_montecarlo");
const v2 = findBotStrategy("main_montecarlo_v2");
const v3 = findBotStrategy("main_montecarlo_v3");
const v31 = findBotStrategy("main_montecarlo_v3_1");
const champion: Lineup = { id: "v1+v1", first: v1, partner: v1 };
const challengers: Lineup[] = [
  { id: "v1+v2", first: v1, partner: v2 },
  { id: "v1+v3", first: v1, partner: v3 },
  { id: "v1+v31", first: v1, partner: v31 },
  { id: "v2+v3", first: v2, partner: v3 },
];

function play(first: Lineup, second: Lineup, dealSeed: number, swapTeams: boolean, swapPartners: boolean): string {
  const team0 = swapTeams ? second : first;
  const team1 = swapTeams ? first : second;
  const team0Seats = swapPartners ? [team0.partner, team0.first] : [team0.first, team0.partner];
  const team1Seats = swapPartners ? [team1.partner, team1.first] : [team1.first, team1.partner];
  const game = playTournamentGame({
    seed: dealSeed,
    teamStrategies: { 0: team0.first, 1: team1.first },
    seatStrategies: { 0: team0Seats[0], 2: team0Seats[1], 1: team1Seats[0], 3: team1Seats[1] },
  });
  return game.winnerTeam === 0 ? team0.id : team1.id;
}

const results = challengers.map((challenger, matchup) => {
  let challengerWins = 0;
  for (let block = 0; block < games / 4; block += 1) {
    const dealSeed = seed + matchup * 10_000 + block;
    for (const swapTeams of [false, true]) {
      for (const swapPartners of [false, true]) {
        if (play(challenger, champion, dealSeed, swapTeams, swapPartners) === challenger.id) challengerWins += 1;
      }
    }
  }
  console.error(`[${matchup + 1}/${challengers.length}] ${challenger.id}: ${challengerWins}-${games - challengerWins} ${champion.id}`);
  return { lineup: challenger.id, opponent: champion.id, games, wins: challengerWins, winRate: challengerWins / games };
});

console.log(JSON.stringify({ seed, results }, null, 2));

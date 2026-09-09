import { composeStrategy, findBotStrategy } from "@/simulation/botRegistry";
import { runRoundRobin } from "@/simulation/tournament";

const seed = Number(process.argv.find((argument) => argument.startsWith("--seed="))?.split("=")[1] ?? 20262109);
const main = findBotStrategy("main");
const v1 = findBotStrategy("main_montecarlo");
const v2 = findBotStrategy("main_montecarlo_v2");
const v3 = findBotStrategy("main_montecarlo_v3");
const v31 = findBotStrategy("main_montecarlo_v3_1");
const mcBid = findBotStrategy("main_montecarlo_bidding");
const legacy = findBotStrategy("legacy_heuristic_v0");

const biddingStrategies = [
  composeStrategy("bid_main_card_v2", "Bidding main + card V2", main, v2),
  composeStrategy("bid_mc_card_v2", "Bidding MC + card V2", mcBid, v2),
  composeStrategy("bid_legacy_card_v2", "Bidding legacy + card V2", legacy, v2),
];
const cardStrategies = [
  composeStrategy("card_main", "Bidding main + card main", main, main),
  composeStrategy("card_v1", "Bidding main + card V1", main, v1),
  composeStrategy("card_v2", "Bidding main + card V2", main, v2),
  composeStrategy("card_v3", "Bidding main + card V3", main, v3),
  composeStrategy("card_v31", "Bidding main + card V3.1", main, v31),
  composeStrategy("card_legacy", "Bidding main + card legacy", main, legacy),
];

const bidding = runRoundRobin(biddingStrategies, 40, seed);
console.error("[components] bidding-only complete");
const card = runRoundRobin(cardStrategies, 20, seed + 100_000);
console.error("[components] card-play-only complete");

console.log(JSON.stringify({ seed, biddingOnly: bidding, cardPlayOnly: card }, null, 2));

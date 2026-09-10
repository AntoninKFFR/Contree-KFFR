import {
  ACTIVE_BOT_STRATEGIES,
  createHybridStrategy,
  type BotStrategyDefinition,
} from "@/simulation/botRegistry";

const humanDoctrineV2No110 = createHybridStrategy("human_doctrine_v2_no110", "monte_carlo_v1", {
  id: "human_doctrine_v2_no110_mc_v1",
  label: "Human Doctrine V2 sans 110 + Monte Carlo V1",
  status: "experimental",
});

export const FFB_RECALIBRATION_STRATEGIES: BotStrategyDefinition[] = [
  ...ACTIVE_BOT_STRATEGIES,
  humanDoctrineV2No110,
];

export type BotProfileId = "main" | "main_montecarlo" | "prudent" | "balanced" | "aggressive";

export type BotProfile = {
  id: string;
  label: string;
  bidRisk: number;
  cardRisk: number;
  bidOffset: number;
  raiseMargin: number;
  coincheMargin: number;
  surcoincheMargin: number;
  preserveStrongCards: number;
};

export const BOT_PROFILES: Record<BotProfileId, BotProfile> = {
  main: {
    id: "main",
    label: "Bot principal",
    bidRisk: 0.9,
    cardRisk: 0.82,
    bidOffset: 11,
    raiseMargin: 8,
    coincheMargin: 34,
    surcoincheMargin: 42,
    preserveStrongCards: 1.25,
  },
  main_montecarlo: {
    id: "main_montecarlo",
    label: "Bot principal Monte Carlo",
    bidRisk: 0.9,
    cardRisk: 0.82,
    bidOffset: 11,
    raiseMargin: 8,
    coincheMargin: 34,
    surcoincheMargin: 42,
    preserveStrongCards: 1.25,
  },
  prudent: {
    id: "prudent",
    label: "Prudent",
    bidRisk: 0.85,
    cardRisk: 0.7,
    bidOffset: 15,
    raiseMargin: 12,
    coincheMargin: 34,
    surcoincheMargin: 42,
    preserveStrongCards: 1.35,
  },
  balanced: {
    id: "balanced",
    label: "Equilibre",
    bidRisk: 0.95,
    cardRisk: 0.95,
    bidOffset: 6,
    raiseMargin: 4,
    coincheMargin: 30,
    surcoincheMargin: 38,
    preserveStrongCards: 1.1,
  },
  aggressive: {
    id: "aggressive",
    label: "Agressif",
    bidRisk: 0.99,
    cardRisk: 1.1,
    bidOffset: 4,
    raiseMargin: -6,
    coincheMargin: 28,
    surcoincheMargin: 36,
    preserveStrongCards: 0.95,
  },
};

export function getBotProfile(profileId: BotProfileId = "balanced"): BotProfile {
  return BOT_PROFILES[profileId];
}

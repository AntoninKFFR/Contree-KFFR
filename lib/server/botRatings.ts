import { OFFICIAL_BOT_PROFILE_ID } from "@/bots/profiles";

/** Server configuration. Never expose this registry in a client bundle. */
export const BOT_RATING_FALLBACK = Object.freeze({ version: "fallback-v1", rating: 1000 });

const BOT_RATING_REGISTRY: Readonly<Record<string, Readonly<{ version: string; rating: number }>>> = Object.freeze({
  advanced_rules_v4: Object.freeze({ version: "advanced_rules_v4-calibration-v1", rating: 1000 }),
});

export type BotRatingSnapshot = {
  botProfileId: string;
  botVersion: string;
  botRating: number;
};

export function resolveBotRating(profileId: string = OFFICIAL_BOT_PROFILE_ID): BotRatingSnapshot {
  const config = BOT_RATING_REGISTRY[profileId] ?? BOT_RATING_FALLBACK;
  return { botProfileId: profileId, botVersion: config.version, botRating: config.rating };
}

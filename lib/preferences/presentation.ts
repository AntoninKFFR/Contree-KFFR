import type { PlayerPreferences } from "./playerPreferences";

export type PreferenceAnimation = "deal" | "card-play" | "trick" | "bidding";

export function isPreferenceAnimationEnabled(
  preferences: PlayerPreferences,
  animation: PreferenceAnimation,
  systemReducedMotion = false,
): boolean {
  if (!preferences.visual.animations || preferences.visual.reducedMotion || systemReducedMotion) return false;
  if (animation === "deal") return preferences.visual.dealAnimation;
  if (animation === "card-play") return preferences.visual.cardPlayAnimation;
  if (animation === "trick") return preferences.visual.trickAnimation;
  return preferences.visual.biddingAnimation;
}

export function getTrickPresentationPolicy(preferences: PlayerPreferences): {
  autoCollect: boolean;
  delayMs: number;
} {
  return {
    autoCollect: preferences.gameplay.autoCollectTricks,
    delayMs: preferences.gameplay.trickDisplayMs,
  };
}

import type { PlayerPreferences } from "./playerPreferences";
export type PreferenceSound = "card-play" | "trick-collect" | "bid" | "ui" | "training-correct" | "training-wrong";

export function canPlayPreferenceSound(sound: PreferenceSound, preferences: PlayerPreferences): boolean {
  if (!preferences.audio.enabled || preferences.audio.volume <= 0) return false;
  if (sound === "card-play" || sound === "trick-collect") return preferences.audio.cardSounds;
  if (sound === "bid") return preferences.audio.biddingSounds;
  return preferences.audio.uiSounds;
}

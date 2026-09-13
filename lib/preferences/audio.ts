import type { PlayerPreferences } from "./playerPreferences";

export type PreferenceSound = "card-play" | "trick-collect" | "bid" | "ui";

export function canPlayPreferenceSound(sound: PreferenceSound, preferences: PlayerPreferences): boolean {
  if (!preferences.audio.enabled || preferences.audio.volume <= 0) return false;
  if (sound === "card-play" || sound === "trick-collect") return preferences.audio.cardSounds;
  if (sound === "bid") return preferences.audio.biddingSounds;
  return preferences.audio.uiSounds;
}

export function playPreferenceSound(sound: PreferenceSound, preferences: PlayerPreferences): void {
  if (typeof window === "undefined" || !canPlayPreferenceSound(sound, preferences)) return;
  try {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequency = sound === "bid" ? 520 : sound === "ui" ? 420 : sound === "trick-collect" ? 180 : 260;
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(Math.min(0.08, preferences.audio.volume * 0.08), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.07);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.075);
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
  } catch {
    // Browsers may block audio until a user gesture. Audio feedback is always best effort.
  }
}

import type { PlayerPreferences } from "./playerPreferences";

import { canPlayPreferenceSound, type PreferenceSound } from "./sound";
export { canPlayPreferenceSound, type PreferenceSound } from "./sound";
let sharedAudioContext: AudioContext | null = null;

export function playPreferenceSound(sound: PreferenceSound, preferences: PlayerPreferences): void {
  if (typeof window === "undefined" || !canPlayPreferenceSound(sound, preferences)) return;
  try {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = sharedAudioContext && sharedAudioContext.state !== "closed" ? sharedAudioContext : new AudioContextClass();
    sharedAudioContext = context;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequency = sound === "training-correct" ? 880
      : sound === "training-wrong" ? 220
        : sound === "bid" ? 520 : sound === "ui" ? 420 : sound === "trick-collect" ? 180 : 260;
    oscillator.frequency.value = frequency;
    oscillator.type = sound === "training-wrong" ? "triangle" : "sine";
    const duration = sound === "training-correct" ? 0.11 : sound === "training-wrong" ? 0.09 : 0.07;
    gain.gain.setValueAtTime(Math.min(0.08, preferences.audio.volume * 0.08), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.005);
  } catch {
    // Browsers may block audio until a user gesture. Audio feedback is always best effort.
  }
}

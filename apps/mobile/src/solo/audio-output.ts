import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { canPlayPreferenceSound, type PreferenceSound } from "../../../../lib/preferences/sound";
import { MUSIC_TRACKS, nextMusicTrackIndex, previousMusicTrackIndex } from "../../../../lib/preferences/musicTracks";
import type { PlayerPreferences } from "../../../../lib/preferences/playerPreferences";
import { SOLO_ORIGIN } from "./api";
import card from "../../assets/solo-audio/card-play.wav";
import collect from "../../assets/solo-audio/trick-collect.wav";
import bid from "../../assets/solo-audio/bid.wav";
import ui from "../../assets/solo-audio/ui.wav";
const sources = { "card-play": card, "trick-collect": collect, bid, ui };

/** Native media handles belong to this adapter, never to React state. Allocated on user interaction. */
export function createSoloAudioOutput() {
  let snapshot = { index: 0, playing: false }, enabled = true, volume = .15;
  let effects: AudioPlayer | null = null, music: AudioPlayer | null = null, loadedTrack: number | null = null;
  let subscription: { remove: () => void } | null = null;
  const listeners = new Set<() => void>();
  function publish(next: typeof snapshot) { snapshot = next; listeners.forEach((listener) => listener()); }
  function pause() { music?.pause(); effects?.pause(); if (snapshot.playing) publish({ ...snapshot, playing: false }); }
  function start() {
    if (!enabled) return;
    try {
      if (!music) {
        music = createAudioPlayer(null);
        subscription = music.addListener("playbackStatusUpdate", (status) => { if (status.didJustFinish) change(nextMusicTrackIndex(snapshot.index, MUSIC_TRACKS.length)); });
      }
      music.volume = volume;
      if (loadedTrack !== snapshot.index) { music.replace({ uri: SOLO_ORIGIN + MUSIC_TRACKS[snapshot.index].src }); loadedTrack = snapshot.index; }
      music.play(); if (!snapshot.playing) publish({ ...snapshot, playing: true });
    } catch { pause(); }
  }
  function change(index: number) { const playing = snapshot.playing; publish({ index, playing }); if (playing) start(); }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure(preferences: PlayerPreferences) { enabled = preferences.audio.musicEnabled; volume = preferences.audio.musicVolume; if (music) music.volume = volume; if (!enabled) pause(); },
    sound(kind: PreferenceSound, preferences: PlayerPreferences) {
      if (!(kind in sources) || !canPlayPreferenceSound(kind, preferences)) return;
      try { effects ??= createAudioPlayer(null); effects.volume = preferences.audio.volume; effects.replace(sources[kind as keyof typeof sources]); effects.play(); } catch { /* Sound never blocks gameplay. */ }
    },
    toggle: () => snapshot.playing ? pause() : start(),
    next: () => change(nextMusicTrackIndex(snapshot.index, MUSIC_TRACKS.length)),
    previous: () => change(previousMusicTrackIndex(snapshot.index, MUSIC_TRACKS.length)),
    pause,
    dispose() { pause(); subscription?.remove(); subscription = null; effects?.remove(); music?.remove(); effects = null; music = null; loadedTrack = null; },
  };
}

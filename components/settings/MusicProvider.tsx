"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MUSIC_TRACKS, MusicPlaylistController, type MusicSnapshot } from "@/lib/preferences/music";
import { usePlayerPreferences } from "./PlayerPreferencesProvider";

type MusicContextValue = MusicSnapshot & {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
};

const noop = () => undefined;
const MusicContext = createContext<MusicContextValue>({
  playing: false, index: 0, track: MUSIC_TRACKS[0],
  play: noop, pause: noop, togglePlay: noop, next: noop, previous: noop,
});

export function MusicProvider({ children }: { children: ReactNode }) {
  const { preferences, setPreferences } = usePlayerPreferences();
  const audioRef = useRef<HTMLAudioElement>(null);
  const controllerRef = useRef<MusicPlaylistController | null>(null);
  const [snapshot, setSnapshot] = useState<MusicSnapshot>({ playing: false, index: 0, track: MUSIC_TRACKS[0] });

  useEffect(() => {
    if (!audioRef.current) return;
    const controller = new MusicPlaylistController(audioRef.current, setSnapshot);
    controllerRef.current = controller;
    controller.configure(preferences.audio.musicEnabled, preferences.audio.musicVolume);
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
    // The player is created exactly once per full page load. Preferences are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.configure(preferences.audio.musicEnabled, preferences.audio.musicVolume);
  }, [preferences.audio.musicEnabled, preferences.audio.musicVolume]);

  const play = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (!preferences.audio.musicEnabled) {
      controller.configure(true, preferences.audio.musicVolume);
      setPreferences((current) => ({ ...current, audio: { ...current.audio, musicEnabled: true } }));
    }
    controller.play();
  }, [preferences.audio.musicEnabled, preferences.audio.musicVolume, setPreferences]);
  const pause = useCallback(() => controllerRef.current?.pause(), []);
  const next = useCallback(() => controllerRef.current?.next(), []);
  const previous = useCallback(() => controllerRef.current?.previous(), []);
  const togglePlay = useCallback(() => {
    if (snapshot.playing) pause();
    else play();
  }, [pause, play, snapshot.playing]);

  return <MusicContext.Provider value={{ ...snapshot, play, pause, togglePlay, next, previous }}>
    <audio aria-hidden="true" className="hidden" data-background-music preload="metadata" ref={audioRef} />
    {children}
  </MusicContext.Provider>;
}

export function useMusic(): MusicContextValue {
  return useContext(MusicContext);
}

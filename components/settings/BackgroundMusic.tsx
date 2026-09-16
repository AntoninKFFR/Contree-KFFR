"use client";

import { useEffect, useRef } from "react";
import { MusicPlaylistController } from "@/lib/preferences/music";
import { usePlayerPreferences } from "./PlayerPreferencesProvider";

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const controllerRef = useRef<MusicPlaylistController | null>(null);
  const { preferences } = usePlayerPreferences();

  useEffect(() => {
    if (!audioRef.current) return;
    const controller = new MusicPlaylistController(audioRef.current);
    controllerRef.current = controller;
    const activate = () => controller.activate();
    window.addEventListener("pointerdown", activate, { passive: true });
    window.addEventListener("keydown", activate);
    return () => {
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", activate);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.configure(preferences.audio.musicEnabled, preferences.audio.musicVolume);
  }, [preferences.audio.musicEnabled, preferences.audio.musicVolume]);

  return <audio aria-hidden="true" className="hidden" data-background-music preload="metadata" ref={audioRef} />;
}

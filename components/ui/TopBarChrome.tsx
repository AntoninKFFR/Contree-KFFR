"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { useMusic } from "@/components/settings/MusicProvider";
import { MUSIC_TRACKS, nextMusicTrackIndex, previousMusicTrackIndex } from "@/lib/preferences/music";
import { KffrLogo } from "./KffrLogo";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  contextLabel: string;
  menuId: string;
  menuOpen: boolean;
  menuLabel: string;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenMenu: () => void;
};

function TrackIcon({ direction }: { direction: "previous" | "next" }) {
  return <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
    {direction === "previous" ? <path d="M3 3.5h2v13H3zm13.5.8v11.4a.8.8 0 0 1-1.2.7L6.4 10.7a.8.8 0 0 1 0-1.4l8.9-5.7a.8.8 0 0 1 1.2.7Z" /> : <path d="M15 3.5h2v13h-2zM3.5 4.3a.8.8 0 0 1 1.2-.7l8.9 5.7a.8.8 0 0 1 0 1.4l-8.9 5.7a.8.8 0 0 1-1.2-.7Z" />}
  </svg>;
}

function PlaybackIcon({ playing }: { playing: boolean }) {
  return playing
    ? <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4.5 3.5h4v13h-4zm7 0h4v13h-4z" /></svg>
    : <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5.5 3.6a.8.8 0 0 1 1.2-.7l9 6.4a.8.8 0 0 1 0 1.4l-9 6.4a.8.8 0 0 1-1.2-.7z" /></svg>;
}

export function TopBarChrome({ contextLabel, menuId, menuOpen, menuLabel, menuButtonRef, onOpenMenu }: Props) {
  const { playing, index, track, volume, setVolume, previous, next, togglePlay } = useMusic();
  const trackTitle = `${track.title} — ${track.artist}`;
  const previousTrack = MUSIC_TRACKS[previousMusicTrackIndex(index, MUSIC_TRACKS.length)];
  const nextTrack = MUSIC_TRACKS[nextMusicTrackIndex(index, MUSIC_TRACKS.length)];
  return <header className="coinche-game-topbar coinche-global-header sticky top-0 z-50 flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3 shadow-lg backdrop-blur-md sm:px-5">
    <div className="flex min-w-0 items-center gap-3">
      <Link aria-label="Accueil — KFFR Contrée" className="shrink-0" href="/"><KffrLogo className="h-7 w-[4.65rem] sm:h-8 sm:w-[5.25rem]" variant="compact" /></Link>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/15" />
      <span className="truncate text-xs font-semibold text-white/55">{contextLabel}</span>
    </div>
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <span className="hidden max-w-40 truncate text-right text-[11px] font-medium text-[var(--text-secondary)] lg:block xl:max-w-56" data-current-track>{trackTitle}</span>
      <button aria-label="Piste précédente" className="coinche-chrome-icon" onClick={previous} title={`${previousTrack.title} — ${previousTrack.artist}`} type="button"><TrackIcon direction="previous" /></button>
      <button aria-label={playing ? "Mettre la musique en pause" : "Lire la musique"} className="coinche-chrome-icon" onClick={togglePlay} type="button"><PlaybackIcon playing={playing} /></button>
      <button aria-label="Piste suivante" className="coinche-chrome-icon" onClick={next} title={`${nextTrack.title} — ${nextTrack.artist}`} type="button"><TrackIcon direction="next" /></button>
      <div className="hidden items-center gap-1.5 text-[var(--text-secondary)] sm:flex">
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 20 20"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3zM13 7a4 4 0 0 1 0 6M15 4.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>
        <input aria-label="Volume musique" className="w-[72px] accent-[var(--accent)]" max={100} min={0} onChange={(event) => setVolume(Number(event.target.value) / 100)} step={1} type="range" value={Math.round(volume * 100)} />
      </div>
      <ThemeToggle />
      <button aria-controls={menuId} aria-expanded={menuOpen} aria-label={menuLabel} className="coinche-chrome-icon" onClick={onOpenMenu} ref={menuButtonRef} type="button">☰</button>
    </div>
  </header>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useMusic } from "@/components/settings/MusicProvider";

function SpeakerIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3zM13 7a4 4 0 0 1 0 6M15 4.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>;
}

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

export function AudioPopover() {
  const { playing, track, volume, setVolume, previous, next, togglePlay } = useMusic();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") setOpen(false);
      if (event instanceof PointerEvent && !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  return <div className="relative" ref={rootRef}>
    <button aria-controls="audio-popover" aria-expanded={open} aria-label="Contrôles audio" className="coinche-chrome-icon" onClick={() => setOpen((value) => !value)} type="button"><SpeakerIcon /></button>
    {open ? <div aria-label="Lecteur audio" className="coinche-popover absolute right-0 top-[calc(100%+0.6rem)] z-[70] w-72 rounded-2xl border p-4 shadow-2xl" id="audio-popover" role="dialog">
      <p className="truncate text-sm font-bold text-[var(--text-primary)]">{track.title}</p>
      <p className="truncate text-xs text-[var(--text-secondary)]">{track.artist}</p>
      <div className="mt-4 flex items-center justify-center gap-5">
        <button aria-label="Piste précédente" className="coinche-chrome-icon" onClick={previous} type="button"><TrackIcon direction="previous" /></button>
        <button aria-label={playing ? "Mettre la musique en pause" : "Lire la musique"} className="coinche-chrome-icon" onClick={togglePlay} type="button"><PlaybackIcon playing={playing} /></button>
        <button aria-label="Piste suivante" className="coinche-chrome-icon" onClick={next} type="button"><TrackIcon direction="next" /></button>
      </div>
      <label className="mt-4 flex items-center gap-3 text-xs font-semibold text-[var(--text-secondary)]">Volume
        <input aria-label="Volume musique" className="min-w-0 flex-1 accent-[var(--accent)]" max={100} min={0} onChange={(event) => setVolume(Number(event.target.value) / 100)} step={1} type="range" value={Math.round(volume * 100)} />
      </label>
    </div> : null}
  </div>;
}

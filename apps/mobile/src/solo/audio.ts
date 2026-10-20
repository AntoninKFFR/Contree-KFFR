import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { MUSIC_TRACKS } from "@/lib/preferences/musicTracks";
import type { PreferenceSound } from "@/lib/preferences/sound";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";
import { createSoloAudioOutput } from "./audio-output";
import type { NativeSoloSession } from "./contract";

export function useSoloAudio(preferences: PlayerPreferences, session: NativeSoloSession | null, collectedKey: string | null) {
  const [output] = useState(createSoloAudioOutput);
  const music = useSyncExternalStore(output.subscribe, output.getSnapshot, output.getSnapshot);
  const observed = useRef<{ id: string; round: number; bids: number; plays: number } | null>(null), observedCollection = useRef<string | null>(null);
  const sound = useCallback((kind: PreferenceSound) => output.sound(kind, preferences), [output, preferences]);
  useEffect(() => output.configure(preferences), [output, preferences]);
  useEffect(() => {
    const game = session?.state;
    if (!game || !session) { observed.current = null; output.pause(); return; }
    const next = { id: session.id, round: game.roundNumber, bids: game.bids.length, plays: game.completedTricks.reduce((n, t) => n + t.cards.length, 0) + game.currentTrick.cards.length };
    const previous = observed.current; observed.current = next;
    if (!previous || previous.id !== next.id || previous.round !== next.round) return;
    if (next.bids > previous.bids) sound("bid");
    if (next.plays > previous.plays) sound("card-play");
  }, [session, sound, output]);
  useEffect(() => { if (collectedKey && observedCollection.current !== collectedKey) sound("trick-collect"); observedCollection.current = collectedKey; }, [collectedKey, sound]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => { if (state !== "active") output.pause(); });
    return () => { listener.remove(); output.dispose(); };
  }, [output]);
  return { sound, music: { title: `${MUSIC_TRACKS[music.index].title} · ${MUSIC_TRACKS[music.index].artist}`, playing: music.playing, toggle: output.toggle, next: output.next, previous: output.previous } };
}

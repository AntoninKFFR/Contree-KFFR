export const MUSIC_TRACKS = [
  { title: "Echoes", artist: "Allan", src: "/audio/music/echoes-allan.mp3" },
  { title: "Ena", artist: "Allan", src: "/audio/music/ena-allan.mp3" },
  { title: "Estrella", artist: "Allan", src: "/audio/music/estrella-allan.mp3" },
  { title: "Get like thiz", artist: "Allan", src: "/audio/music/get-like-thiz-allan.mp3" },
  { title: "I saw you dancin", artist: "Allan", src: "/audio/music/i-saw-you-dancin-allan.mp3" },
  { title: "Noche en paris", artist: "Allan", src: "/audio/music/noche-en-paris-allan.mp3" },
  { title: "Not the same", artist: "Allan", src: "/audio/music/not-the-same-allan.mp3" },
  { title: "Roots", artist: "Allan", src: "/audio/music/roots-allan.mp3" },
  { title: "Your way", artist: "Allan", src: "/audio/music/your-way-allan.mp3" },
] as const;

export function nextMusicTrackIndex(current: number, count: number): number {
  return count > 0 ? (current + 1) % count : 0;
}

export function previousMusicTrackIndex(current: number, count: number): number {
  return count > 0 ? (current - 1 + count) % count : 0;
}

export type MusicSnapshot = { playing: boolean; index: number; track: typeof MUSIC_TRACKS[number] };

export class MusicPlaylistController {
  private index = 0;
  private enabled = false;
  private volume = 0.25;
  private playing = false;
  private playRequest = 0;
  private disposed = false;

  constructor(private readonly audio: HTMLAudioElement, private readonly onChange: (snapshot: MusicSnapshot) => void = () => undefined) {
    audio.preload = "metadata";
    audio.src = MUSIC_TRACKS[0].src;
    audio.addEventListener("ended", this.handleEnded);
  }

  get snapshot(): MusicSnapshot {
    return { playing: this.playing, index: this.index, track: MUSIC_TRACKS[this.index] };
  }

  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.25));
    this.audio.volume = this.volume;
    if (!enabled) this.pause();
  }

  play(): void {
    if (this.disposed || !this.enabled) return;
    this.playing = true;
    this.notify();
    this.startPlayback();
  }

  pause(): void {
    this.playing = false;
    this.playRequest++;
    this.audio.pause();
    this.notify();
  }

  next(): void {
    this.changeTrack(nextMusicTrackIndex(this.index, MUSIC_TRACKS.length));
  }

  previous(): void {
    this.changeTrack(previousMusicTrackIndex(this.index, MUSIC_TRACKS.length));
  }

  dispose(): void {
    this.disposed = true;
    this.audio.removeEventListener("ended", this.handleEnded);
    this.pause();
  }

  private readonly handleEnded = (): void => {
    if (!this.disposed) this.next();
  };

  private changeTrack(index: number): void {
    if (this.disposed) return;
    this.playRequest++;
    this.index = index;
    this.audio.src = MUSIC_TRACKS[this.index].src;
    this.notify();
    if (this.playing) this.startPlayback();
  }

  private startPlayback(): void {
    if (this.disposed || !this.playing || !this.enabled || !this.audio.paused) return;
    const request = ++this.playRequest;
    try {
      void Promise.resolve(this.audio.play()).then(() => {
        if (!this.playing || !this.enabled || this.disposed) this.audio.pause();
      }).catch(() => {
        // A browser may reject playback; leave the UI paused without console noise.
        if (request !== this.playRequest) return;
        this.playing = false;
        this.notify();
      });
    } catch {
      this.playing = false;
      this.notify();
    }
  }

  private notify(): void {
    this.onChange(this.snapshot);
  }
}

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

export class MusicPlaylistController {
  private index = 0;
  private enabled = false;
  private volume = 0.25;
  private activated = false;
  private playPending = false;
  private disposed = false;

  constructor(private readonly audio: HTMLAudioElement) {
    audio.preload = "metadata";
    audio.src = MUSIC_TRACKS[0].src;
    audio.addEventListener("ended", this.handleEnded);
  }

  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.25));
    this.audio.volume = this.volume;
    if (!enabled || this.volume === 0) this.audio.pause();
    else this.tryPlay();
  }

  activate(): void {
    this.activated = true;
    this.tryPlay();
  }

  dispose(): void {
    this.disposed = true;
    this.audio.removeEventListener("ended", this.handleEnded);
    this.audio.pause();
  }

  private readonly handleEnded = (): void => {
    if (this.disposed) return;
    this.index = nextMusicTrackIndex(this.index, MUSIC_TRACKS.length);
    this.audio.src = MUSIC_TRACKS[this.index].src;
    this.tryPlay();
  };

  private tryPlay(): void {
    if (this.disposed || !this.activated || !this.enabled || this.volume === 0 || !this.audio.paused || this.playPending) return;
    try {
      this.playPending = true;
      void this.audio.play().then(() => {
        this.playPending = false;
        if (!this.enabled || this.volume === 0 || this.disposed) this.audio.pause();
      }).catch(() => {
        // Autoplay can be denied; the next user interaction retries silently.
        this.playPending = false;
      });
    } catch {
      this.playPending = false;
    }
  }
}

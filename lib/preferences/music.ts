import { MUSIC_TRACKS, nextMusicTrackIndex, previousMusicTrackIndex } from "./musicTracks";
export { MUSIC_TRACKS, nextMusicTrackIndex, previousMusicTrackIndex } from "./musicTracks";

export type MusicSnapshot = { playing: boolean; index: number; track: typeof MUSIC_TRACKS[number] };

export class MusicPlaylistController {
  private index = 0;
  private enabled = false;
  private volume = 0.15;
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
    this.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.15));
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

import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MUSIC_TRACKS, MusicPlaylistController, nextMusicTrackIndex } from "@/lib/preferences/music";

class FakeAudio {
  src = "";
  preload = "";
  volume = 1;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  rejectPlay = false;
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    const group = this.listeners.get(name) ?? new Set();
    group.add(listener);
    this.listeners.set(name, group);
  }
  removeEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(name)?.delete(listener);
  }
  play() {
    this.playCalls++;
    if (this.rejectPlay) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.pauseCalls++;
    this.paused = true;
  }
  end() {
    this.paused = true;
    for (const listener of this.listeners.get("ended") ?? []) {
      if (typeof listener === "function") listener(new Event("ended"));
      else listener.handleEvent(new Event("ended"));
    }
  }
}

const controllerFor = (audio: FakeAudio) => new MusicPlaylistController(audio as unknown as HTMLAudioElement);

describe("background music playlist", () => {
  it("references every bundled MP3 exactly once", () => {
    const disk = readdirSync(path.join(process.cwd(), "public/audio/music")).sort();
    const playlist = MUSIC_TRACKS.map((track) => path.basename(track.src)).sort();
    expect(disk).toEqual(playlist);
    expect(new Set(playlist).size).toBe(playlist.length);
  });

  it("starts only after interaction and advances sequentially, looping after the last song", async () => {
    const audio = new FakeAudio();
    const controller = controllerFor(audio);
    controller.configure(true, 0.25);
    expect(audio.playCalls).toBe(0);
    expect(audio.src).toBe(MUSIC_TRACKS[0].src);
    expect(audio.preload).toBe("metadata");
    controller.activate();
    await Promise.resolve();
    expect(audio.playCalls).toBe(1);
    for (let index = 1; index <= MUSIC_TRACKS.length; index++) {
      audio.end();
      await Promise.resolve();
      expect(audio.src).toBe(MUSIC_TRACKS[index % MUSIC_TRACKS.length].src);
    }
    expect(audio.playCalls).toBe(MUSIC_TRACKS.length + 1);
    expect(nextMusicTrackIndex(MUSIC_TRACKS.length - 1, MUSIC_TRACKS.length)).toBe(0);
    controller.dispose();
  });

  it("applies independent volume immediately and stops/resumes without resetting the song", async () => {
    const audio = new FakeAudio();
    const controller = controllerFor(audio);
    controller.configure(true, 0.25);
    controller.activate();
    await Promise.resolve();
    controller.configure(true, 0.6);
    expect(audio.volume).toBe(0.6);
    controller.configure(false, 0.6);
    expect(audio.paused).toBe(true);
    const song = audio.src;
    controller.configure(true, 0.6);
    await Promise.resolve();
    expect(audio.paused).toBe(false);
    expect(audio.src).toBe(song);
    controller.dispose();
  });

  it("silently tolerates blocked playback and retries on a later interaction", async () => {
    const audio = new FakeAudio();
    audio.rejectPlay = true;
    const controller = controllerFor(audio);
    controller.configure(true, 0.25);
    controller.activate();
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.paused).toBe(true);
    audio.rejectPlay = false;
    controller.activate();
    await Promise.resolve();
    expect(audio.paused).toBe(false);
    controller.dispose();
  });

  it("does not advance after disposal", () => {
    const audio = new FakeAudio();
    const controller = controllerFor(audio);
    controller.dispose();
    audio.end();
    expect(audio.src).toBe(MUSIC_TRACKS[0].src);
  });
});

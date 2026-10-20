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

// Reproduce the sine oscillator/envelope in lib/preferences/audio.ts as local PCM.
import { mkdirSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
const directory = new URL("../assets/solo-audio/", import.meta.url);
mkdirSync(directory, { recursive: true });
for (const [name, frequency] of [["card-play", 260], ["trick-collect", 180], ["bid", 520], ["ui", 420]]) {
  const rate = 22050, duration = .07, frames = Math.round(rate * (duration + .005));
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + frames * 2, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / rate, amplitude = .08 * Math.exp(Math.log(.0001 / .08) * Math.min(t / duration, 1));
    buffer.writeInt16LE(Math.round(32767 * amplitude * Math.sin(2 * Math.PI * frequency * t)), 44 + i * 2);
  }
  writeFileSync(new URL(`${name}.wav`, directory), buffer);
}

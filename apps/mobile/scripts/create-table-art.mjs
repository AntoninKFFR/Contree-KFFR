// Original, deterministic felt artwork; no downloaded texture or image dependency.
// Run from apps/mobile with: node scripts/create-table-art.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
const width = 1280, height = 720;
let seed = 146;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const pixels = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const dx = (x / width - 0.39) * 1.3, dy = (y / height - 0.42);
    const light = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)) ** 2;
    const grain = noise() * 3 + ((x + y) % 3 === 0 ? 0.7 : -0.3);
    const i = y * (width * 3 + 1) + 1 + x * 3;
    pixels[i] = 7 + light * 10 + grain;
    pixels[i + 1] = 27 + light * 25 + grain;
    pixels[i + 2] = 21 + light * 15 + grain;
  }
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
writeFileSync(new URL("../assets/felt-table.png", import.meta.url), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
]));

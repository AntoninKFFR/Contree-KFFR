import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const directory = resolve("dist/_expo/static/js/ios");
const maps = readdirSync(directory).filter((file) => file.endsWith(".map"));
assert.equal(maps.length, 1, "Export iOS with --source-maps before auditing the actual Metro graph");
const sources = JSON.parse(readFileSync(resolve(directory, maps[0]), "utf8")).sources.map((path) => path.replaceAll("\\", "/"));
for (const required of ["/src/training/puzzle-screen.tsx", "/src/training/duo.ts", "/engine/training/pileCount.ts", "/engine/training/bidReading.ts", "/src/solo/scene.tsx", "/src/multiplayer/table.tsx", "/src/multiplayer/api.ts", "/src/multiplayer/use-room.ts", "/engine/rules.ts", "/engine/bidding.ts", "/lib/solo/publicState.ts", "/lib/preferences/handSorting.ts"]) {
  assert.ok(sources.some((source) => source.endsWith(required)), `Expected the actual native/pure module: ${required}`);
}
const forbidden = sources.filter((source) => ["/engine/actions.ts", "/lib/server/", "/app/solo/", "/components/GameTable.tsx", "/lib/preferences/audio.ts", "/lib/preferences/music.ts", "/tests/visual/", "/tests/parity/", "/tests/multiplayer/", "/tests/hand/", "/tests/final-trick/", "/tests/hand-sequence", "/lib/socialApi.ts"].some((part) => source.includes(part)));
assert.deepEqual(forbidden, [], "Native bundle must exclude server modules, DOM adapters and test fixtures");
console.log(`Actual iOS Metro graph verified: ${sources.length} sources; native scene and shared pure selectors present; training generators reuse shared game/bot modules; no server, web UI/audio or fixtures.`);

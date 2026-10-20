// Reproduce the measured native hooks before/after without switching the app,
// its branch, or the live Expo server. No production request is made.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const baseline = resolve(app, "tests/.solo-bot-baseline.tsx");
const configFile = resolve(tmpdir(), `solo-bot-benchmark-${randomUUID()}.json`);
if (existsSync(baseline)) throw new Error("A benchmark baseline already exists; preserve it before running again.");
const source = execFileSync("git", ["show", "6a5af6a26ed04a5fc29931361984e92980b2725a:apps/mobile/src/app/(connected)/solo.tsx"], { cwd: app });
const config = { ...require("../jest.config.cjs"), rootDir: app };
config.moduleNameMapper = { "^\\.\\./src/app/\\(connected\\)/solo$": baseline, ...config.moduleNameMapper };
const jest = resolve(app, "node_modules/jest/bin/jest.js");
function run(before) {
  const env = { ...process.env };
  if (before) env.SOLO_BOT_BASELINE = "1"; else delete env.SOLO_BOT_BASELINE;
  const args = [jest, "--runInBand", "--testNamePattern=Solo bot latency", "--config", before ? configFile : resolve(app, "jest.config.cjs")];
  const result = spawnSync(process.execPath, args, { cwd: app, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Bot benchmark failed (${before ? "before" : "after"}).`);
}
try {
  writeFileSync(baseline, source, { flag: "wx" });
  writeFileSync(configFile, JSON.stringify(config), { flag: "wx" });
  run(true);
} finally {
  if (existsSync(baseline)) unlinkSync(baseline);
  if (existsSync(configFile)) unlinkSync(configFile);
}
run(false);

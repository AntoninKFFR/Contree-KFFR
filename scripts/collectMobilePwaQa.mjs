import { mkdir, readdir, readFile, stat, copyFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(root, entry.name)) : join(root, entry.name)))).flat();
}
const destination = "test-results/mobile-pwa-final-qa";
const sourceFiles = (await files("test-results")).filter(path => !path.startsWith(join("test-results", "mobile-pwa-final-qa")) && !/[\\/]attachments[\\/]/.test(path));
const reports = await Promise.all(sourceFiles.filter(path => path.endsWith("mobile-pwa-qa-report.json")).map(async path => JSON.parse(await readFile(path, "utf8"))));
const latestScenarios = new Map();
for (const report of reports) {
  const key = `${report.engine}:${report.scenario}`;
  if (!latestScenarios.has(key) || report.retry > latestScenarios.get(key).retry) latestScenarios.set(key, report);
}
const finalScenarios = [...latestScenarios.values()];
const screenshotAttempts = sourceFiles.filter(path => /^qa-.*\.png$/.test(path.split(/[\\/]/).at(-1)));
const latestScreenshots = new Map();
for (const path of screenshotAttempts) {
  const name = path.split(/[\\/]/).at(-1);
  const modified = (await stat(path)).mtimeMs;
  if (!latestScreenshots.has(name) || modified > latestScreenshots.get(name).modified) latestScreenshots.set(name, { path, modified });
}
const screenshots = [...latestScreenshots.values()].map(entry => entry.path);
await mkdir(destination, { recursive: true });
const names = screenshots.map(path => path.split(/[\\/]/).at(-1));
if (screenshots.length > 20) throw new Error("Excessive final QA screenshots");
for (const path of screenshots) await copyFile(path, join(destination, path.split(/[\\/]/).at(-1)));
const chunks = await files(".next/static/chunks");
const chunkSizes = await Promise.all(chunks.map(async path => ({ path: relative(".next", path).replaceAll("\\", "/"), bytes: (await stat(path)).size })));
const publicSizes = await Promise.all((await files("public")).map(async path => ({ path: path.replaceAll("\\", "/"), bytes: (await stat(path)).size })));
const manifest = JSON.parse(await readFile(".next/app-build-manifest.json", "utf8").catch(() => '{"pages":{}}'));
const initialHome = [...new Set([...(manifest.pages["/layout"] ?? []), ...(manifest.pages["/page"] ?? [])])];
const initialSizes = await Promise.all(initialHome.map(async path => {
  const data = await readFile(join(".next", path));
  return { path, bytes: data.length, gzipBytes: gzipSync(data).length };
}));
const report = {
  commit: process.env.QA_COMMIT ?? process.env.GITHUB_SHA ?? null,
  testedCommit: process.env.GITHUB_SHA ?? process.env.QA_COMMIT ?? null,
  generatedAt: new Date().toISOString(),
  total: reports.length,
  uniqueScenarios: finalScenarios.length,
  passedScenarios: finalScenarios.filter(report => report.status === "passed").length,
  passed: reports.filter(report => report.status === "passed").length,
  failed: reports.filter(report => report.status === "failed").length,
  retries: reports.filter(report => report.retry > 0).map(report => ({ engine: report.engine, scenario: report.scenario, retry: report.retry })),
  screenshots: names.sort(), screenshotAttempts: screenshotAttempts.length, scenarios: reports,
  assets: { staticChunksBytes: chunkSizes.reduce((sum, entry) => sum + entry.bytes, 0), staticChunksCount: chunks.length,
    initialHomeBytes: initialSizes.reduce((sum, entry) => sum + entry.bytes, 0),
    initialHomeGzipBytes: initialSizes.reduce((sum, entry) => sum + entry.gzipBytes, 0), initialHome: initialSizes,
    largestChunks: chunkSizes.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
    publicBytes: publicSizes.reduce((sum, entry) => sum + entry.bytes, 0), publicCount: publicSizes.length,
    largestPublicAssets: publicSizes.sort((a, b) => b.bytes - a.bytes).slice(0, 10) },
};
await writeFile(join(destination, "mobile-pwa-qa-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed,
  uniqueScenarios: report.uniqueScenarios, passedScenarios: report.passedScenarios,
  screenshots: names.length, retryAttempts: report.retries.length, assets: { chunksBytes: report.assets.staticChunksBytes,
    initialHomeGzipBytes: report.assets.initialHomeGzipBytes, publicBytes: report.assets.publicBytes } }));
// Preserve diagnostics first, including failed attempts, then enforce complete
// coverage. A green run cannot silently omit a final scenario or selected view.
if (report.uniqueScenarios !== 54 || report.passedScenarios !== 54 || names.length !== 18) {
  throw new Error(`Incomplete final QA: ${report.passedScenarios}/${report.uniqueScenarios} scenarios, ${names.length}/18 screenshots`);
}

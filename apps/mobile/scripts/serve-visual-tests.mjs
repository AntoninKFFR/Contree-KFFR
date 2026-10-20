import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const vite = resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js");
const config = resolve(root, "tests/visual/vite.config.ts"), output = resolve(root, ".visual-build");
// Only this dedicated, generated directory may be cleared by Vite's build.
if (dirname(output) !== resolve(root) || !output.endsWith(".visual-build")) throw new Error("Unexpected visual-test output directory");
const built = spawnSync(process.execPath, [vite, "build", "--config", config, "--outDir", output, "--emptyOutDir"], { cwd: root, stdio: "inherit" });
if (built.status !== 0) process.exit(built.status ?? 1);
// Serve one bundled harness instead of opening hundreds of development module
// sockets per browser context (Windows can exhaust its ephemeral socket pool).
const server = spawn(process.execPath, [vite, "preview", "--config", config, "--outDir", output, "--host", "127.0.0.1", "--port", "8091", "--strictPort"], { cwd: root, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server.kill(signal); });
server.on("exit", (code) => process.exit(code ?? 0));

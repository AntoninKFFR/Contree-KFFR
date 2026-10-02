import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("offline artifact uses the shared foundation", () => {
  const html = readFileSync("public/pwa-offline.html", "utf8");
  const globals = readFileSync("app/globals.css", "utf8");
  it("embeds the canonical safe-area/viewport inputs and both theme palettes", () => {
    const viewport = globals.slice(globals.indexOf("/* Viewport and safe-area inputs."), globals.indexOf(".coinche-page-shell"));
    const palette = globals.slice(globals.indexOf(":root,\n:root[data-theme"), globals.indexOf("\n* {"));
    expect(html).toContain(viewport);
    expect(html).toContain(palette);
    expect(html).toContain('class="coinche-fullscreen-safe"');
  });
  it("does not depend on application bundles, APIs, tokens or external assets", () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link|<img|supabase|access_token|\/api\//i);
    expect(html).toContain("Connexion nécessaire");
    expect(html).toContain("Réessayer");
  });
  it("versions the worker from the actual offline document bytes", () => {
    const revision = createHash("sha256").update(html).digest("hex").slice(0, 16);
    expect(readFileSync("public/sw.js", "utf8")).toContain(`kffr-offline-v1-${revision}`);
  });
});

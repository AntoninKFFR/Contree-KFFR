import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { KffrLogo } from "@/components/ui/KffrLogo";

vi.stubGlobal("React", React);

describe("KFFR branding", () => {
  it("renders theme-aware full and compact lockups with one accessible name", () => {
    const full = renderToStaticMarkup(React.createElement(KffrLogo));
    const compact = renderToStaticMarkup(React.createElement(KffrLogo, { variant: "compact" }));

    for (const markup of [full, compact]) {
      expect(markup.match(/alt="KFFR Contrée"/g)).toHaveLength(1);
      expect(markup.match(/aria-hidden="true"/g)).toHaveLength(1);
      expect(markup).toContain("coinche-brand-logo__image--dark");
      expect(markup).toContain("coinche-brand-logo__image--light");
    }
    expect(full).toContain("kffr-logo-dark.png");
    expect(full).toContain("kffr-logo-light.png");
    expect(compact).toContain("kffr-wordmark-light.png");
  });

  it("keeps favicon metadata assets local and sized for browsers", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("themeBootstrap");
    expect(readFileSync("app/icon.png").byteLength).toBeLessThan(20_000);
    expect(readFileSync("app/apple-icon.png").byteLength).toBeLessThan(100_000);
  });

  it("uses the full KFFR logo instead of playing cards as the home hero visual", () => {
    const markup = renderToStaticMarkup(React.createElement(HomePage));
    const homeSource = readFileSync("app/page.tsx", "utf8");
    const shellSource = readFileSync("components/ui/AppShell.tsx", "utf8");

    expect(markup.match(/coinche-brand-logo--full/g)).toHaveLength(1);
    expect(markup).not.toMatch(/[♣♦♠♥]/);
    expect(homeSource).not.toMatch(/radial-gradient|blur-3xl|drop-shadow/);
    expect(shellSource).not.toMatch(/blur-3xl|backdrop-blur/);
    expect(markup).toContain("La contrée, en solo ou entre amis");
    expect(markup).toContain("Jouer en solo");
    expect(markup).toContain("Multijoueur");
  });
});

import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppTopNav, appNavigationLinks } from "@/components/AppTopNav";
import { MusicProvider } from "@/components/settings/MusicProvider";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.stubGlobal("React", React);

describe("unified application navigation", () => {
  it("renders direct public navigation without the old drawer", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PlayerPreferencesProvider, null,
        React.createElement(MusicProvider, null, React.createElement(AppTopNav))),
    );
    expect(markup).toContain('aria-label="Navigation principale"');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/rules"');
    expect(markup).toContain('href="/training"');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain("Se connecter");
    expect(markup).toContain("Contrôles audio");
    expect(markup).not.toContain("coinche-app-drawer");
  });

  it("defines the two game destinations and authenticated direct links", () => {
    const source = readFileSync("components/AppTopNav.tsx", "utf8");
    for (const href of ["/solo", "/multiplayer", "/training", "/leaderboard", "/friends", "/history", "/rules", "/profile"]) {
      expect(source).toContain(`\"${href}\"`);
    }
    expect(source).toContain('aria-current={pathname === "/solo" ? "page" : undefined}');
    expect(source).toContain("PROFILE_CHANGED_EVENT");
    expect(appNavigationLinks(false).map((link) => link.href)).toEqual(["/", "/training", "/rules"]);
    expect(appNavigationLinks(true).map((link) => link.href)).toEqual(["/", "/leaderboard", "/friends", "/history", "/training", "/rules"]);
    const profile = readFileSync("app/profile/page.tsx", "utf8");
    expect(profile).toContain("Se déconnecter");
    expect(profile).toContain("auth.signOut()");
  });
});

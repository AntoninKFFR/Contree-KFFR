import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";

vi.stubGlobal("React", React);

describe("navigation theme toggle", () => {
  it("renders a keyboard-accessible moon and sun switch", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PlayerPreferencesProvider, null, React.createElement(ThemeToggle)),
    );
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).toContain('aria-label="Activer le thème clair"');
    expect(markup.match(/<svg/g)).toHaveLength(2);
    expect(markup).toContain("coinche-theme-toggle__moon");
    expect(markup).toContain("coinche-theme-toggle__sun");
  });

  it("reflects the shared light preference without a second state", () => {
    const preferences = clonePlayerPreferences();
    preferences.visual.theme = "light";
    const markup = renderToStaticMarkup(
      React.createElement(
        PlayerPreferencesProvider,
        { initialPreferences: preferences },
        React.createElement(ThemeToggle),
      ),
    );
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-label="Activer le thème sombre"');
  });
});

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GameTopBar } from "@/components/GameTopBar";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { IconCloseButton } from "@/components/ui/IconCloseButton";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.stubGlobal("React", React);

const noop = () => undefined;

describe("shared close button", () => {
  it("renders the compact premium SVG control", () => {
    const markup = renderToStaticMarkup(
      React.createElement(IconCloseButton, { label: "Fermer les détails" }),
    );
    expect(markup).toContain('aria-label="Fermer les détails"');
    expect(markup).toContain("h-9 w-9");
    expect(markup).toContain("coinche-icon-button");
    expect(markup).toContain("<svg");
    expect(markup).not.toContain(">×<");
  });

  it("stays available to modal dialogs while navigation uses compact panels", () => {
    const dialog = renderToStaticMarkup(
      React.createElement(AccessibleDialog, {
        description: "Test",
        onClose: noop,
        title: "Test",
      } as React.ComponentProps<typeof AccessibleDialog>, React.createElement("div")),
    );
    const gameDrawer = renderToStaticMarkup(React.createElement(GameTopBar, {
      contextLabel: "Solo",
      focusMode: false,
      onOpenPreferences: noop,
      onToggleFocusMode: noop,
    }));
    expect(dialog).toContain("h-9 w-9");
    expect(dialog).toContain("<svg");
    expect(dialog).not.toContain(">×<");
    expect(gameDrawer).toContain("coinche-theme-toggle");
    expect(gameDrawer).toContain("coinche-nav-section-label");
    expect(gameDrawer).toContain("game-menu-panel");
    expect(gameDrawer).not.toContain("coinche-app-drawer");
  });
});

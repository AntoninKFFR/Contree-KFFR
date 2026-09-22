import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GameMenuPanel } from "@/components/GameMenuPopover";
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
    const gameMenu = renderToStaticMarkup(React.createElement(GameMenuPanel, {
      focusMode: false,
      onOpenPreferences: noop,
      onSelect: noop,
      onToggleFocusMode: noop,
    }));
    expect(dialog).toContain("h-9 w-9");
    expect(dialog).toContain("<svg");
    expect(dialog).not.toContain(">×<");
    expect(gameMenu).toContain("coinche-nav-section-label");
    expect(gameMenu).toContain("game-menu-panel");
    expect(gameMenu).not.toContain("coinche-app-drawer");
  });
});

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppDrawerNav } from "@/components/AppDrawerNav";
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

  it("is reused by dialogs and both application drawers", () => {
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
    const appDrawer = renderToStaticMarkup(React.createElement(AppDrawerNav));

    for (const markup of [dialog, gameDrawer, appDrawer]) {
      expect(markup).toContain("h-9 w-9");
      expect(markup).toContain("<svg");
      expect(markup).not.toContain(">×<");
    }
  });
});

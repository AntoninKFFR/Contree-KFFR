import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AppEmptyState,
  AppPageHeader,
  AppSurface,
  appBadgeClass,
  appInputClass,
  appPrimaryActionClass,
  appSecondaryActionClass,
  appSegmentedItemClass,
} from "@/components/ui/AppShell";

vi.stubGlobal("React", React);
const { createElement } = React;

describe("shared visual system", () => {
  it("keeps sections on the canvas and reserves a surface for functional groups", () => {
    const plain = renderToStaticMarkup(createElement(AppSurface, { variant: "plain" } as React.ComponentProps<typeof AppSurface>, createElement("h2", null, "Parties récentes")));
    const panel = renderToStaticMarkup(createElement(AppSurface, {} as React.ComponentProps<typeof AppSurface>, createElement("h2", null, "Créer une partie")));
    expect(plain).toContain('class="coinche-app-section');
    expect(plain).not.toContain("coinche-app-surface");
    expect(panel).toContain("coinche-app-surface border");
  });

  it("uses the canonical header without decorative suits for top-level pages", () => {
    const markup = renderToStaticMarkup(createElement(AppPageHeader, { eyebrow: "Historique", title: "Toutes les parties", description: "Les plus récentes d’abord." }));
    expect(markup).toContain("coinche-page-header-main");
    expect(markup).toContain("coinche-page-header--hero");
    expect(markup).toContain("<h1>Toutes les parties</h1>");
    expect(markup).not.toContain("coinche-suit-backdrop");
    expect(markup).not.toContain("♠ ♥ ♦ ♣");
    expect(markup).not.toContain("coinche-app-surface");
  });

  it("shares control classes and keeps empty states concise", () => {
    expect(appPrimaryActionClass).toContain("coinche-action");
    expect(appSecondaryActionClass).toContain("coinche-action");
    expect(appInputClass).toContain("coinche-input");
    expect(appSegmentedItemClass).toContain("coinche-segmented-item");
    expect(appBadgeClass).toContain("coinche-status-badge");
    const empty = renderToStaticMarkup(createElement(AppEmptyState, { title: "Aucune partie", description: "Lance une partie pour commencer." }));
    expect(empty).toContain("coinche-empty-state");
    expect(empty).toContain("<h2>Aucune partie</h2>");
  });

  it("keeps the trick-value levels in one card without a repeated resume panel", () => {
    const hub = readFileSync("components/training/TrainingHubClient.tsx", "utf8");
    const ui = readFileSync("components/training/TrainingUI.tsx", "utf8");
    expect(hub).toContain("recordLabel");
    expect(hub).not.toContain('className="training-resume"');
    expect(hub.match(/<TrainingLevelTrack title="Valeur d’un pli"/g)).toHaveLength(1);
    expect(ui).toContain('className="sr-only"');
  });
});

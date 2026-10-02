// @vitest-environment jsdom
import React, { StrictMode, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

afterEach(cleanup);
const tab = (target: HTMLElement, shiftKey = false) => fireEvent.keyDown(target, { key: "Tab", shiftKey });

describe("AccessibleDialog native sequential focus boundaries", () => {
  it("leaves interior Tab and Shift+Tab native, including the first summary", () => {
    render(<StrictMode><AccessibleDialog title="Paramètres" onClose={() => {}}>
      <button>Avant</button><details><summary>Réglages avancés</summary><input aria-label="Délai" /></details><button>Après</button>
    </AccessibleDialog></StrictMode>);
    const summary = screen.getByText("Réglages avancés");
    summary.focus();
    expect(document.activeElement).toBe(summary);
    expect(tab(summary)).toBe(true);
    expect(tab(summary, true)).toBe(true);
    expect(document.activeElement).toBe(summary); // Actual native movement is verified in Playwright.
  });

  it("wraps to the summary when closed and to its last input when open", () => {
    render(<StrictMode><AccessibleDialog title="Paramètres" onClose={() => {}}>
      <details><summary>Réglages avancés</summary><input aria-label="Délai" /></details>
    </AccessibleDialog></StrictMode>);
    const close = screen.getByRole("button", { name: "Fermer Paramètres" });
    const summary = screen.getByText("Réglages avancés");
    const details = summary.parentElement as HTMLDetailsElement;
    const input = screen.getByLabelText("Délai");
    expect(tab(close, true)).toBe(false); expect(document.activeElement).toBe(summary);
    expect(tab(summary)).toBe(false); expect(document.activeElement).toBe(close);
    details.open = true;
    expect(tab(close, true)).toBe(false); expect(document.activeElement).toBe(input);
    expect(tab(input, true)).toBe(true); // Browser returns to summary, without interception.
    expect(tab(input)).toBe(false); expect(document.activeElement).toBe(close);
    details.open = false;
    expect(tab(close, true)).toBe(false); expect(document.activeElement).toBe(summary);
  });

  it("excludes nested closed details and CSS-hidden, inert, disabled and negative-tabindex controls", () => {
    render(<AccessibleDialog title="Paramètres" onClose={() => {}}>
      <details><summary>Réglages avancés</summary><details open><summary>Section interne</summary><input /></details></details>
      <div style={{ display: "none" }}><button>CSS masqué</button></div>
      <div inert><button>Inerte</button></div><fieldset disabled><input /></fieldset><button tabIndex={-1}>Hors parcours</button>
    </AccessibleDialog>);
    const close = screen.getByRole("button", { name: "Fermer Paramètres" });
    tab(close, true); expect(document.activeElement).toBe(screen.getByText("Réglages avancés"));
  });

  it("uses positive tabindex order and the selected radio only at the boundaries", () => {
    render(<AccessibleDialog title="Paramètres" onClose={() => {}}>
      <button tabIndex={2}>Second</button><button tabIndex={1}>Premier</button>
      <input aria-label="Choix A" type="radio" name="choice" defaultChecked /><input aria-label="Choix B" type="radio" name="choice" />
    </AccessibleDialog>);
    const first = screen.getByRole("button", { name: "Premier" }); first.focus();
    expect(tab(first)).toBe(true); expect(document.activeElement).toBe(first);
    expect(tab(first, true)).toBe(false); expect(document.activeElement).toBe(screen.getByLabelText("Choix A"));
    expect(tab(screen.getByLabelText("Choix A"))).toBe(false); expect(document.activeElement).toBe(first);
  });

  it("keeps the superposed dialog in sole control and restores the underlying summary", () => {
    function Dialogs() {
      const [top, setTop] = useState(false);
      return <><AccessibleDialog title="Paramètres" onClose={() => {}}>
        <button onClick={() => setTop(true)}>Ouvrir confirmation</button>
        <details><summary>Réglages avancés</summary><input aria-label="Délai" /></details>
      </AccessibleDialog>{top ? <AccessibleDialog title="Confirmation" onClose={() => setTop(false)}><button>Confirmer</button></AccessibleDialog> : null}</>;
    }
    render(<StrictMode><Dialogs /></StrictMode>);
    const summary = screen.getByText("Réglages avancés"); summary.focus();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir confirmation" }));
    const top = screen.getByRole("dialog", { name: "Confirmation" });
    const close = within(top).getByRole("button", { name: "Fermer Confirmation" });
    expect(document.activeElement).toBe(close);
    summary.focus(); expect(document.activeElement).toBe(close);
    tab(close, true); expect(document.activeElement).toBe(within(top).getByRole("button", { name: "Confirmer" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Confirmation" })).toBeNull();
    expect(document.activeElement).toBe(summary); expect(document.body.style.overflow).toBe("hidden");
    tab(summary); expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fermer Paramètres" }));
  });

  it("keeps an empty dialog focused and restores its opener on unmount", () => {
    const opener = document.createElement("button"); document.body.append(opener); opener.focus();
    const view = render(<StrictMode><AccessibleDialog title="Vide" showCloseButton={false} onClose={() => {}}><button disabled>Indisponible</button></AccessibleDialog></StrictMode>);
    const panel = screen.getByRole("dialog", { name: "Vide" }).querySelector("section")!;
    expect(document.activeElement).toBe(panel); expect(tab(panel)).toBe(false); expect(document.activeElement).toBe(panel);
    view.unmount(); expect(document.activeElement).toBe(opener); opener.remove();
  });
});

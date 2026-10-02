// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppPage, AppPageHeader, AppSurface, appFieldClass, appFormClass, appInputClass, appMetadataClass, appPrimaryActionClass, appRowClass, appSecondaryActionClass, appSegmentedGroupClass, appSegmentedItemClass, appTableScrollClass } from "@/components/ui/AppShell";
vi.stubGlobal("React", React);
afterEach(cleanup);

describe("AppShell responsive primitives", () => {
  it.each([["narrow", "max-w-xl"], ["medium", "max-w-4xl"], ["wide", "max-w-6xl"]] as const)("preserves %s width, a shared section stack and safe bottom", (width, expected) => {
    render(<AppPage width={width} className="custom-stack"><AppPageHeader title="Progression" /></AppPage>);
    const main = screen.getByRole("main");
    expect(main.classList.contains("coinche-safe-bottom")).toBe(true);
    expect(main.classList.contains("coinche-content-min")).toBe(true);
    expect(main.firstElementChild?.classList.contains(expected)).toBe(true);
    expect(main.firstElementChild?.classList.contains("coinche-page-stack")).toBe(true);
    expect(main.firstElementChild?.classList.contains("custom-stack")).toBe(true);
  });
  it("keeps all header information, heading hierarchy and independent actions", () => {
    const action = vi.fn();
    render(<AppPageHeader eyebrow="Espace social" title="Historique des parties" description="Une description complète, conservée sur téléphone." actions={<><button className={appPrimaryActionClass} onClick={action}>Continuer</button><button className={appSecondaryActionClass} disabled>En attente</button></>}><p>XP supplémentaires</p></AppPageHeader>);
    expect(screen.getByRole("heading", {level:1}).textContent).toBe("Historique des parties");
    expect(screen.getByText("Espace social").classList.contains("coinche-app-eyebrow")).toBe(true);
    expect(screen.getByText("Une description complète, conservée sur téléphone.")).toBeTruthy();
    expect(screen.getByText("XP supplémentaires")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name:"Continuer"})); expect(action).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", {name:"En attente"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps plain sections and panel surfaces distinct, including explicit overrides", () => {
    render(<><AppSurface className="custom-panel !p-4"><h2>Panel</h2></AppSurface><AppSurface variant="plain"><h2>Section</h2></AppSurface></>);
    expect(screen.getByText("Panel").parentElement?.classList.contains("coinche-app-surface")).toBe(true);
    expect(screen.getByText("Panel").parentElement?.classList.contains("!p-4")).toBe(true);
    expect(screen.getByText("Section").parentElement?.classList.contains("coinche-app-section")).toBe(true);
    expect(screen.getByText("Section").parentElement?.classList.contains("coinche-app-surface")).toBe(false);
  });
  it("retains actual labels, native form controls and form submission", () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form className={appFormClass} onSubmit={submit}><label className={appFieldClass}>Email<input className={appInputClass} type="email" /></label><label className={appFieldClass}>Message<textarea className={appInputClass} /></label><button className={appPrimaryActionClass} type="submit">Envoyer</button></form>);
    fireEvent.change(screen.getByLabelText("Email"), {target:{value:"mobile@example.test"}});
    fireEvent.change(screen.getByLabelText("Message"), {target:{value:"Réglages conservés"}});
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("mobile@example.test");
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Réglages conservés");
    fireEvent.click(screen.getByRole("button", {name:"Envoyer"})); expect(submit).toHaveBeenCalledOnce();
  });
  it("offers explicit group, row, metadata and locally scrollable table compositions", () => {
    render(<><div className={appSegmentedGroupClass} role="group" aria-label="Modes"><button className={appSegmentedItemClass} aria-pressed>Solo</button><button className={appSegmentedItemClass}>Multijoueur</button></div><div className={appRowClass}><strong>Un joueur</strong><div className={appMetadataClass}>Niveau 15 · 12345 XP</div></div><div className={appTableScrollClass} tabIndex={0} role="region" aria-label="Classement détaillé"><table><caption>Classement</caption><tbody><tr><th scope="row">Un joueur</th><td>1000 Elo</td></tr></tbody></table></div></>);
    expect(within(screen.getByRole("group", {name:"Modes"})).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", {name:"Solo"}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("region", {name:"Classement détaillé"}).tabIndex).toBe(0);
    expect(screen.getByRole("table", {name:"Classement"})).toBeTruthy();
  });
});

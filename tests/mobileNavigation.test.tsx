// @vitest-environment jsdom
import React, { StrictMode, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTopNav } from "@/components/AppTopNav";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { getProgression } from "@/lib/progression/formulaV1";

const mocks = vi.hoisted(() => ({ pathname: "/", session: null as unknown, username: "X".repeat(40), progression: vi.fn(), reads: vi.fn(), listeners: new Set<() => void>(), desktop: false }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/components/progression/ProgressionProvider", () => ({ useProgression: mocks.progression }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => { mocks.reads(); return { data: { session: mocks.session } }; }, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } }) }));
vi.mock("@/lib/profiles", () => ({ ensureProfile: async () => { mocks.reads(); return mocks.username; }, getProfileUsername: async () => mocks.username, PROFILE_CHANGED_EVENT: "profile" }));
vi.mock("@/components/ui/AudioPopover", () => ({ AudioPopover: () => <button>Audio</button> }));
vi.mock("@/components/ui/ThemeToggle", () => ({ ThemeToggle: () => <button>Thème</button> }));
vi.mock("@/components/social/SocialNotifications", () => ({ SocialNotificationTrigger: () => null }));

beforeEach(() => {
  mocks.pathname = "/"; mocks.session = null; mocks.desktop = false; mocks.listeners.clear(); mocks.reads.mockClear();
  mocks.progression.mockReturnValue({ status: "ready", userId: "me", summary: getProgression(700) });
  document.body.style.overflow = "auto";
  vi.stubGlobal("matchMedia", () => ({ get matches() { return mocks.desktop; }, addEventListener: (_event: string, listener: () => void) => mocks.listeners.add(listener), removeEventListener: (_event: string, listener: () => void) => mocks.listeners.delete(listener) }));
});
afterEach(() => { cleanup(); document.body.style.overflow = ""; vi.unstubAllGlobals(); });
const open = () => { const burger = screen.getByRole("button", { name: "Ouvrir le menu" }); fireEvent.click(burger); return burger; };
const drawer = () => screen.getByRole("dialog", { name: "Navigation KFFR" });

describe("mobile drawer lifecycle in StrictMode", () => {
  it.each(["close", "escape", "backdrop"])("locks once, contains focus and restores it on %s", (method) => {
    render(<StrictMode><AppTopNav /></StrictMode>);
    const burger = open(); const dialog = drawer();
    const close = within(dialog).getByRole("button", { name: "Fermer le menu" });
    const last = within(dialog).getByRole("link", { name: "Se connecter" });
    expect(document.body.style.overflow).toBe("hidden");
    expect(burger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" }); expect(document.activeElement).toBe(close);
    burger.focus(); expect(document.activeElement).toBe(close);
    if (method === "close") fireEvent.click(close);
    if (method === "escape") fireEvent.keyDown(close, { key: "Escape" });
    if (method === "backdrop") fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(burger);
    expect(document.body.style.overflow).toBe("auto");
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(mocks.listeners.size).toBe(0);
  });
  it("does not fetch at drawer open and keeps the real progression and full username", async () => {
    mocks.session = { user: { id: "me" } };
    render(<StrictMode><AppTopNav /></StrictMode>); await screen.findByText(mocks.username);
    const reads = mocks.reads.mock.calls.length; open();
    const nav = within(drawer()).getByRole("navigation", { name: "Navigation mobile" });
    expect(within(nav).getByText("Niv. 5 · 150 / 200 XP")).toBeTruthy();
    expect(within(nav).getByRole("link", { name: /X{40}/ }).getAttribute("title")).toBe(mocks.username);
    expect(mocks.reads.mock.calls.length).toBe(reads);
  });
  it("derives Training expansion at every opening, then allows a local collapse", () => {
    mocks.pathname = "/training/puzzle/bidding";
    render(<StrictMode><AppTopNav /></StrictMode>); const burger = open();
    const training = within(drawer()).getByRole("button", { name: "Entraînement" });
    expect(training.getAttribute("aria-expanded")).toBe("true");
    expect(within(drawer()).getByRole("link", { name: "Annoncer" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(training); expect(training.getAttribute("aria-expanded")).toBe("false");
    expect(within(drawer()).queryByRole("link", { name: "Annoncer" })).toBeNull();
    fireEvent.keyDown(training, { key: "Escape" }); fireEvent.click(burger);
    expect(within(drawer()).getByRole("button", { name: "Entraînement" }).getAttribute("aria-expanded")).toBe("true");
  });
  it("starts collapsed outside Training and closes even for a same-route link", () => {
    render(<StrictMode><AppTopNav /></StrictMode>); const burger = open();
    expect(within(drawer()).getByRole("button", { name: "Entraînement" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(within(drawer()).getByRole("link", { name: "Accueil" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(burger);
  });
  it("cleans up locks, media and keyboard listeners on route changes and unmount", () => {
    const view = render(<StrictMode><AppTopNav /></StrictMode>); const burger = open();
    mocks.pathname = "/rules"; view.rerender(<StrictMode><AppTopNav /></StrictMode>);
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(burger);
    expect(document.body.style.overflow).toBe("auto"); expect(mocks.listeners.size).toBe(0);
    open(); view.unmount(); expect(document.body.style.overflow).toBe("auto"); expect(mocks.listeners.size).toBe(0);
    fireEvent.keyDown(document, { key: "Escape" });
  });
  it("leaves a critical dialog above navigation in sole control of Escape and focus", () => {
    function Critical() {
      const [shown, setShown] = useState(true);
      return shown ? <AccessibleDialog onClose={() => setShown(false)} title="Confirmation critique"><button>Confirmer</button></AccessibleDialog> : null;
    }
    render(<StrictMode><AppTopNav /></StrictMode>); open();
    const critical = render(<StrictMode><Critical /></StrictMode>);
    const closeCritical = screen.getByRole("button", { name: "Fermer Confirmation critique" });
    expect(document.activeElement).toBe(closeCritical);
    fireEvent.keyDown(closeCritical, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Confirmation critique" })).toBeNull();
    expect(drawer()).toBeTruthy(); expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(within(drawer()).getByRole("button", { name: "Fermer le menu" }));
    fireEvent.keyDown(document, { key: "Escape" }); expect(document.body.style.overflow).toBe("auto"); critical.unmount();
  });
  it("exposes the future compact-game API without changing the default mode", () => {
    const view = render(<AppTopNav variant="compact-game" />);
    expect(view.container.querySelector("header")?.dataset.headerVariant).toBe("compact-game");
    view.rerender(<AppTopNav />); expect(view.container.querySelector("header")?.dataset.headerVariant).toBe("default");
  });
});

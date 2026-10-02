// @vitest-environment jsdom
import { useEffect } from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileInstallGate } from "@/components/pwa/MobileInstallGate";

const mocks = vi.hoisted(() => ({ mount: vi.fn(), pathname: "/", replace: vi.fn(), callback: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("next/image", () => ({ default: () => <span>KFFR</span> }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({}) }));
vi.mock("@/lib/authCallback", () => ({ completeAuthCallback: mocks.callback }));
let updateMedia: (() => void) | undefined;
let standalone = false;
function ProductProviders() {
  useEffect(() => { mocks.mount(); }, []);
  return <p>Application métier</p>;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.pathname = "/"; standalone = false;
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "iPhone Version/18.0 Mobile Safari/604.1" });
  Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  vi.stubGlobal("matchMedia", () => ({ get matches() { return standalone; }, addEventListener: (_type: string, listener: () => void) => { updateMedia = listener; }, removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("root install gate lifecycle", () => {
  it("SSR emits a neutral shell with no product HTML before detection", () => {
    const html = renderToString(<MobileInstallGate><ProductProviders /></MobileInstallGate>);
    expect(html).toContain("Chargement de KFFR");
    expect(html).not.toContain("Application métier");
    expect(mocks.mount).not.toHaveBeenCalled();
  });
  it("does not mount product providers on a browser phone", async () => {
    render(<MobileInstallGate><ProductProviders /></MobileInstallGate>);
    expect(await screen.findByRole("heading", { name: "Installer KFFR pour continuer" })).toBeTruthy();
    expect(screen.queryByText("Application métier")).toBeNull();
    expect(mocks.mount).not.toHaveBeenCalled();
  });
  it("reacts to standalone media changes without reload", async () => {
    render(<MobileInstallGate><ProductProviders /></MobileInstallGate>);
    await act(async () => { standalone = true; updateMedia?.(); });
    expect(screen.getByText("Application métier")).toBeTruthy();
    expect(mocks.mount).toHaveBeenCalledOnce();
    await act(async () => { standalone = false; updateMedia?.(); });
    expect(screen.queryByText("Application métier")).toBeNull();
  });
  it("appinstalled never authorizes the browser tab", async () => {
    render(<MobileInstallGate><ProductProviders /></MobileInstallGate>);
    await act(async () => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.getByRole("status").textContent).toContain("Ouvre maintenant");
    expect(mocks.mount).not.toHaveBeenCalled();
  });
  it("only performs the actual auth callback while providers remain gated", async () => {
    mocks.pathname = "/auth/callback";
    mocks.callback.mockResolvedValue("/friends");
    render(<MobileInstallGate><ProductProviders /></MobileInstallGate>);
    await act(async () => {});
    expect(mocks.callback).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/friends");
    expect(mocks.mount).not.toHaveBeenCalled();
  });
});

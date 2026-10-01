// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTopNav } from "@/components/AppTopNav";
import { withEquipment } from "./helpers/profileCosmetics";
import { getProgression } from "@/lib/progression/formulaV1";

const mocks = vi.hoisted(() => ({progression:vi.fn(),session:null as unknown,username:"Antonin"}));
vi.mock("next/navigation", () => ({usePathname:() => "/"}));
vi.mock("@/components/progression/ProgressionProvider", () => ({useProgression:mocks.progression}));
vi.mock("@/lib/supabaseClient", () => ({getSupabaseClient:() => ({auth:{getSession:async () => ({data:{session:mocks.session}}),onAuthStateChange:() => ({data:{subscription:{unsubscribe:vi.fn()}}})}})}));
vi.mock("@/lib/profiles", () => ({ensureProfile:async () => mocks.username,getProfileUsername:async () => mocks.username,PROFILE_CHANGED_EVENT:"profile"}));
vi.mock("@/components/ui/AudioPopover", () => ({AudioPopover:() => <button>Audio</button>}));
vi.mock("@/components/ui/ThemeToggle", () => ({ThemeToggle:() => <button>Thème</button>}));
vi.mock("@/components/social/SocialNotifications", () => ({SocialNotificationTrigger:() => <button>Social</button>}));
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  mocks.session = {user:{id:"me"}}; mocks.username = "Antonin";
  mocks.progression.mockReturnValue({status:"ready",userId:"me",summary:getProgression(700)});
});
afterEach(cleanup);
describe("compact progression navigation", () => {
  it("keeps signed-out navigation unchanged", () => {
    mocks.session = null; render(<AppTopNav />);
    expect(screen.getByRole("link",{name:"Se connecter"})).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/Niv\./)).toBeNull();
  });
  it("shows username, real level and mini bar linking to profile", async () => {
    render(<AppTopNav />); await screen.findByText("Antonin");
    expect(screen.getByText("Niv. 5")).toBeTruthy();
    expect(screen.getByRole("link",{name:/Antonin/}).getAttribute("href")).toBe("/profile");
    expect(screen.getByRole("progressbar").className).toContain("progression-bar--mini");
  });
  it("retains the complete accessible long name and separates the nonshrinking level", async () => {
    mocks.username = "UnPseudoTrèsLongPourVérifierLaNavigation"; render(<AppTopNav />);
    const link = await screen.findByRole("link",{name:/UnPseudo/});
    expect(link.getAttribute("title")).toBe(mocks.username);
    expect(link.querySelector(".progression-account-name")?.textContent).toBe(mocks.username);
    expect(link.querySelector(".progression-level-badge")?.textContent).toBe("Niv. 5");
  });
  it("places details in the mobile menu and isolates them from the compact account line", async () => {
    render(<AppTopNav />); await screen.findByText("Antonin");
    fireEvent.click(screen.getByRole("button",{name:"Ouvrir le menu"}));
    const menu = screen.getByRole("navigation",{name:"Navigation mobile"});
    expect(within(menu).getByText("Niv. 5 · 150 / 200 XP")).toBeTruthy();
    expect(within(menu).getByRole("progressbar")).toBeTruthy();
    expect(within(menu).getByRole("link",{name:"Ma progression"}).getAttribute("href")).toBe("/progression");
  });
  it.each(["loading","error"])("preserves account and controls when progression is %s", async (status) => {
    mocks.progression.mockReturnValue({status,userId:"me",summary:null}); render(<AppTopNav />);
    await screen.findByText("Antonin"); expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("button",{name:"Audio"})).toBeTruthy();
  });
});

it("decorates desktop/mobile identity with miniature badge/frame, never title, preserving XP",async()=>{
 mocks.progression.mockReturnValue({...mocks.progression(),cosmeticsSnapshot:withEquipment()});
 render(<AppTopNav/>);await screen.findByText("Antonin");
 expect(document.querySelector('.coinche-account-link .profile-frame')).toBeTruthy();
 expect(document.querySelector('.coinche-account-link .profile-badge--mini')).toBeTruthy();expect(document.querySelector('.profile-title')).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Ouvrir le menu"}));const menu=screen.getByRole("navigation",{name:"Navigation mobile"});
 expect(menu.querySelector('.profile-frame')).toBeTruthy();expect(menu.querySelector('.profile-badge--mini')).toBeTruthy();expect(within(menu).getByRole("progressbar")).toBeTruthy();
});

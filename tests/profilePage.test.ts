// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "@/app/profile/page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), signOut: vi.fn().mockResolvedValue({ error: null }),
  saveUsername: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "me", email: "me@example.test" } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signOut: mocks.signOut,
  } }),
}));
vi.mock("@/lib/profiles", () => ({ ensureProfile: async () => "Antonin", saveProfileUsername: mocks.saveUsername }));
vi.mock("@/lib/stats", () => ({ getUserGames: async () => ({ data: [{ id: "solo", won: true }], error: null }) }));
vi.mock("@/lib/multiplayerHistory", () => ({ getUserMultiplayerGames: async () => ({ data: [], error: null }) }));
vi.mock("@/lib/rating/queries", () => ({ getMyRatingSummary: async () => ({
  rating: 1000, ratedGames: 0, wins: 0, losses: 0, forfeits: 0, peakRating: 1000,
  rank: null, position: null, placementGames: 0, isRanked: false, pendingMatches: 0,
}) }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  mocks.saveUsername.mockResolvedValue({ username: "Arthur", error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("own player profile", () => {
  it("defaults to Solo, switches the existing dashboard and exposes Elo only in Multijoueur", async () => {
    render(React.createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Antonin" });
    const panel = screen.getByRole("tabpanel");
    const total = () => within(panel).getByText("Parties jouées").parentElement?.textContent;
    expect(screen.getByRole("tab", { name: "Solo" }).getAttribute("aria-selected")).toBe("true");
    expect(total()).toBe("Parties jouées1");
    expect(screen.queryByText("Elo officiel")).toBeNull();
    expect(screen.getByRole("link", { name: "Voir mon historique" }).getAttribute("href")).toBe("/history");

    fireEvent.click(screen.getByRole("tab", { name: "Multijoueur" }));
    expect(total()).toBe("Parties jouées0");
    await screen.findByText("0 / 5 parties");
    expect(screen.getByRole("tab", { name: "Multijoueur" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Solo" }));
    expect(total()).toBe("Parties jouées1");
    expect(screen.queryByText("Elo officiel")).toBeNull();
  });

  it("keeps username editing, cancellation, saving and sign-out available", async () => {
    render(React.createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Antonin" });
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Pseudo" }), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect((screen.getByRole("textbox", { name: "Pseudo" }) as HTMLInputElement).value).toBe("Antonin");
    fireEvent.change(screen.getByRole("textbox", { name: "Pseudo" }), { target: { value: "Arthur" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByRole("heading", { name: "Arthur" });
    expect(mocks.saveUsername).toHaveBeenCalledWith(expect.anything(), "me", "Arthur");
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

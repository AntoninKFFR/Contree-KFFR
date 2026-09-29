// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FriendsPageClient } from "@/app/friends/FriendsPageClient";
import { MultiplayerApiError } from "@/lib/multiplayerApi";

vi.stubGlobal("React", React);
const push = vi.fn();
const createRoom = vi.fn();
const invite = vi.fn();
const session = { access_token: "token", user: { id: "host" } };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/social/useFriendPresence", () => ({ useFriendPresence: () => new Set(["alice"]) }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({ auth: {
  getSession: async () => ({ data: { session } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} }) }));
vi.mock("@/lib/multiplayerApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/multiplayerApi")>()),
  createMultiplayerRoom: (...args: unknown[]) => createRoom(...args),
}));
vi.mock("@/lib/socialApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/socialApi")>()),
  fetchSocialSnapshot: async () => ({
    friends: [
      { userId: "alice", username: "Alice", createdAt: "now" },
      { userId: "bob", username: "Bob", createdAt: "now" },
    ],
    received: [], sent: [], counts: { friends: 2, received: 0, sent: 0 },
  }),
  fetchGameInvitations: async () => ({ invitations: [], counts: { receivedPending: 0, sentPending: 0 } }),
  sendGameInvitation: (...args: unknown[]) => invite(...args),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  createRoom.mockResolvedValue({ room: { id: "new-room" } });
  invite.mockResolvedValue({});
});

async function friendRow(username: string) {
  const name = await screen.findByText(username);
  return within(name.closest("li")!);
}

describe("play with a friend", () => {
  it("creates a standard room, invites the selected friend and navigates", async () => {
    render(React.createElement(FriendsPageClient));
    fireEvent.click((await friendRow("Alice")).getByRole("button", { name: "Jouer" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multiplayer/new-room"));
    expect(createRoom).toHaveBeenCalledExactlyOnceWith({ rules: { presetId: "contree-kffr" } }, session);
    expect(invite).toHaveBeenCalledExactlyOnceWith("new-room", "alice", session);
    expect(createRoom.mock.invocationCallOrder[0]).toBeLessThan(invite.mock.invocationCallOrder[0]);
    expect(invite.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it("locks concurrent social actions and creates only one room on double click", async () => {
    let resolveRoom!: (value: { room: { id: string } }) => void;
    createRoom.mockImplementation(() => new Promise((resolve) => { resolveRoom = resolve; }));
    render(React.createElement(FriendsPageClient));
    const button = (await friendRow("Alice")).getByRole("button", { name: "Jouer" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Création…" })).toHaveProperty("disabled", true);
    expect((await friendRow("Bob")).getByRole("button", { name: "Jouer" })).toHaveProperty("disabled", true);
    for (const remove of screen.getAllByRole("button", { name: "Supprimer" })) expect(remove).toHaveProperty("disabled", true);
    expect(invite).not.toHaveBeenCalled();
    resolveRoom({ room: { id: "new-room" } });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multiplayer/new-room"));
    fireEvent.click(button);
    expect(createRoom).toHaveBeenCalledTimes(1);
  });

  it("keeps offline friends playable", async () => {
    render(React.createElement(FriendsPageClient));
    const row = await friendRow("Bob");
    expect(row.getByText("Hors ligne")).toBeTruthy();
    const button = row.getByRole("button", { name: "Jouer" });
    expect(button).toHaveProperty("disabled", false);
    fireEvent.click(button);
    await waitFor(() => expect(invite).toHaveBeenCalledWith("new-room", "bob", session));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multiplayer/new-room"));
  });

  it("shows creation errors, sends no invitation and unlocks for retry", async () => {
    createRoom.mockRejectedValue(new MultiplayerApiError("Création impossible.", 500, "creation_failed"));
    render(React.createElement(FriendsPageClient));
    fireEvent.click((await friendRow("Alice")).getByRole("button", { name: "Jouer" }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Création impossible.");
    expect(invite).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect((await friendRow("Alice")).getByRole("button", { name: "Jouer" })).toHaveProperty("disabled", false);
  });

  it("navigates to the created lobby even when the invitation fails", async () => {
    invite.mockRejectedValue(new Error("Invitation failed"));
    render(React.createElement(FriendsPageClient));
    fireEvent.click((await friendRow("Alice")).getByRole("button", { name: "Jouer" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/multiplayer/new-room"));
    fireEvent.click((await friendRow("Bob")).getByRole("button", { name: "Jouer" }));
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(invite).toHaveBeenCalledTimes(1);
  });
});

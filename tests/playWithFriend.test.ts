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
const createDuo = vi.fn();
const inviteDuo = vi.fn();
const session = { access_token: "token", user: { id: "host" } };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/trainingDuoApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trainingDuoApi")>()),
  createTrainingDuoSession: (...args: unknown[]) => createDuo(...args),
}));
vi.mock("@/lib/trainingDuoInvitationsApi", () => ({ sendTrainingDuoInvitation: (...args: unknown[]) => inviteDuo(...args) }));
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
  createDuo.mockResolvedValue({ session: { id: "created-duo" } });
  inviteDuo.mockResolvedValue({ status: "pending" });
});

describe("train with a friend", () => {
  async function open(username = "Alice") {
    render(React.createElement(FriendsPageClient));
    const button = (await friendRow(username)).getByRole("button", { name: "S’entraîner" });
    expect(button).toHaveProperty("disabled", false);
    fireEvent.click(button);
    return screen.getByRole("dialog", { name: `S’entraîner avec ${username}` });
  }
  it("creates the selected level and invites an offline friend before navigating", async () => {
    const dialog = await open("Bob");
    expect(within(dialog).getByRole("combobox", { name: "Niveau" }).querySelectorAll("option")).toHaveLength(4);
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Niveau" }), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le duo" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/training/duo/created-duo"));
    expect(createDuo).toHaveBeenCalledExactlyOnceWith(2, session);
    expect(inviteDuo).toHaveBeenCalledExactlyOnceWith("created-duo", "bob", session);
    expect(createRoom).not.toHaveBeenCalled();
  });
  it("blocks double clicks and concurrent social actions until navigation", async () => {
    let resolve!: (value: { session: { id: string } }) => void;
    createDuo.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const dialog = await open();
    const button = within(dialog).getByRole("button", { name: "Créer le duo" });
    fireEvent.click(button); fireEvent.click(button);
    expect(createDuo).toHaveBeenCalledTimes(1);
    expect(button).toHaveProperty("textContent", "Création…");
    expect((await friendRow("Bob")).getByRole("button", { name: "Jouer" })).toHaveProperty("disabled", true);
    resolve({ session: { id: "created-duo" } });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/training/duo/created-duo"));
    fireEvent.click(button); expect(createDuo).toHaveBeenCalledTimes(1);
  });
  it("stays on friends with an error and no invitation when creation fails", async () => {
    createDuo.mockRejectedValue(new Error("Duo indisponible."));
    const dialog = await open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer le duo" }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Duo indisponible.");
    expect(push).not.toHaveBeenCalled(); expect(inviteDuo).not.toHaveBeenCalled();
    expect((await friendRow("Alice")).getByRole("button", { name: "S’entraîner" })).toHaveProperty("disabled", false);
  });
  it("keeps the created duo and requests the retry dialog when invitation fails", async () => {
    inviteDuo.mockRejectedValue(new Error("Invitation failed"));
    const dialog = await open();
    const button = within(dialog).getByRole("button", { name: "Créer le duo" });
    fireEvent.click(button);
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/training/duo/created-duo?inviteFriends=1"));
    fireEvent.click(button); expect(createDuo).toHaveBeenCalledTimes(1); expect(inviteDuo).toHaveBeenCalledTimes(1);
  });
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

  it("navigates to the same lobby with the invitation retry flag when the invitation fails", async () => {
    invite.mockRejectedValue(new Error("Invitation failed"));
    render(React.createElement(FriendsPageClient));
    fireEvent.click((await friendRow("Alice")).getByRole("button", { name: "Jouer" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/multiplayer/new-room?inviteFriends=1"));
    fireEvent.click((await friendRow("Bob")).getByRole("button", { name: "Jouer" }));
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(invite).toHaveBeenCalledTimes(1);
  });
});

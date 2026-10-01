// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      { userId: "alice", username: "Alice", createdAt: "now", level: 1 },
      { userId: "bob", username: "Bob", createdAt: "now", level: 1 },
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe.each(["play", "training"] as const)("%s deferred friendGamePath regression", (flow) => {
  function delayCreation() {
    const result = deferred<{ room: { id: string }; session: { id: string } }>();
    (flow === "play" ? createRoom : createDuo).mockImplementationOnce(() => result.promise);
    return result;
  }
  async function start() {
    const view = render(React.createElement(FriendsPageClient));
    const row = await friendRow("Alice");
    expect(row.getByRole("link", { name: "Voir le profil" })).toHaveProperty("href", expect.stringContaining("/friends/alice"));
    fireEvent.click(row.getByRole("button", { name: flow === "play" ? "Jouer" : "S’entraîner" }));
    if (flow === "training") fireEvent.click(screen.getByRole("button", { name: "Créer le duo" }));
    return view;
  }
  const resolved = { room: { id: "delayed-room" }, session: { id: "delayed-duo" } };
  const path = flow === "play" ? "/multiplayer/delayed-room" : "/training/duo/delayed-duo";

  it("removes active profile links while pending and navigates exactly once on success", async () => {
    const result = delayCreation();
    await start();
    expect(screen.queryAllByRole("link", { name: "Voir le profil" })).toHaveLength(0);
    for (const button of screen.getAllByRole("button", { name: "Voir le profil" })) {
      expect(button).toHaveProperty("disabled", true);
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.hasAttribute("href")).toBe(false);
      fireEvent.click(button);
    }
    fireEvent.click((await friendRow("Bob")).getByRole("button", { name: "Jouer" }));
    expect(createRoom.mock.calls.length + createDuo.mock.calls.length).toBe(1);
    expect(push).not.toHaveBeenCalled();
    await act(async () => { result.resolve(resolved); await result.promise; });
    expect(push).toHaveBeenCalledExactlyOnceWith(path);
    // Keep the successful creation locked until router navigation unmounts Friends.
    expect(screen.queryAllByRole("link", { name: "Voir le profil" })).toHaveLength(0);
    fireEvent.click((await friendRow("Bob")).getByRole("button", { name: "Jouer" }));
    expect(createRoom.mock.calls.length + createDuo.mock.calls.length).toBe(1);
  });

  it("ignores late navigation after leaving Friends, including a fresh mount", async () => {
    const result = delayCreation();
    const view = await start();
    view.unmount();
    // A new Friends instance must not make the old instance's result valid again.
    render(React.createElement(FriendsPageClient));
    await friendRow("Alice");
    await act(async () => { result.resolve(resolved); await result.promise; });
    expect(push).not.toHaveBeenCalled();
    expect((await friendRow("Alice")).getByRole("link", { name: "Voir le profil" })).toBeTruthy();
  });

  it("releases the lock and restores profile links on a deferred error, allowing retry", async () => {
    const result = delayCreation();
    await start();
    await act(async () => { result.reject(new Error("Création échouée.")); await result.promise.catch(() => undefined); });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getAllByRole("link", { name: "Voir le profil" })).toHaveLength(2);
    const row = await friendRow("Alice");
    const button = row.getByRole("button", { name: flow === "play" ? "Jouer" : "S’entraîner" });
    expect(button).toHaveProperty("disabled", false);
    fireEvent.click(button);
    if (flow === "training") fireEvent.click(screen.getByRole("button", { name: "Créer le duo" }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(flow === "play" ? createRoom : createDuo).toHaveBeenCalledTimes(2);
  });

  it("ignores a late rejection after unmount without affecting a new creation", async () => {
    const result = delayCreation();
    const view = await start();
    view.unmount();
    const fresh = await start();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    await act(async () => { result.reject(new Error("Ancienne création échouée.")); await result.promise.catch(() => undefined); });
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("link", { name: "Voir le profil" })).toHaveLength(0);
    fresh.unmount();
  });
});

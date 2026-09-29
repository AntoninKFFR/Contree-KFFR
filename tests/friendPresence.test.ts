// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FriendsView } from "@/components/friends/FriendsView";
import { GameInvitationDialog } from "@/components/multiplayer/GameInvitationDialog";
import { filterFriendsBySearch, sortFriendsByPresence } from "@/lib/friendPresence";
import type { SocialSnapshot } from "@/lib/socialApi";

const mocks = vi.hoisted(() => ({
  online: new Set<string>(),
  list: vi.fn(),
  invite: vi.fn(),
}));
vi.mock("@/components/social/useFriendPresence", () => ({ useFriendPresence: () => mocks.online }));
vi.mock("@/lib/socialApi", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listInvitableFriends: mocks.list,
  sendGameInvitation: mocks.invite,
}));

vi.stubGlobal("React", React);
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.online = new Set(); });

const friends = [
  { userId: "alice", username: "Alice" },
  { userId: "zoe", username: "Zoé" },
  { userId: "charlie", username: "Charlie" },
  { userId: "bob", username: "Bob" },
];

describe("friend presence ordering", () => {
  it("sorts online first, alphabetically within both groups, then reacts to status changes", () => {
    expect(sortFriendsByPresence(friends, new Set(["charlie", "zoe"])).map((f) => f.username)).toEqual(["Charlie", "Zoé", "Alice", "Bob"]);
    expect(sortFriendsByPresence(friends, new Set()).map((f) => f.username)).toEqual(["Alice", "Bob", "Charlie", "Zoé"]);
    expect(sortFriendsByPresence(friends, new Set(friends.map((f) => f.userId))).map((f) => f.username)).toEqual(["Alice", "Bob", "Charlie", "Zoé"]);
    expect(sortFriendsByPresence(friends, new Set(["bob"])).map((f) => f.username)[0]).toBe("Bob");
  });

  it("matches accents and case locally with stable userId ties", () => {
    expect(filterFriendsBySearch(friends, " ZOE ").map((f) => f.userId)).toEqual(["zoe"]);
    const equal = [{ userId: "b", username: "éMILE" }, { userId: "a", username: "Emile" }];
    expect(sortFriendsByPresence(equal, new Set()).map((f) => f.userId)).toEqual(["a", "b"]);
  });
});

it("renders compact friend groups and keeps public search free of presence labels", () => {
  const snapshot: SocialSnapshot = {
    friends: friends.map((friend) => ({ ...friend, createdAt: "now" })), received: [], sent: [],
    counts: { friends: 4, received: 0, sent: 0 },
  };
  const onRemove = vi.fn();
  const view = render(React.createElement(FriendsView, { state: "ready", snapshot, onlineIds: new Set(["zoe", "charlie"]), query: "David", searchResults: [{ userId: "david", username: "David" }], searchState: "ready", onRemove }));
  expect(screen.getByRole("heading", { name: "En ligne · 2" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Hors ligne · 2" })).toBeTruthy();
  expect([...view.container.querySelectorAll(".friend-presence-name")].map((node) => node.textContent)).toEqual(["Charlie", "Zoé", "Alice", "Bob"]);
  expect(view.container.querySelectorAll(".friend-presence-dot--online")).toHaveLength(2);
  expect(view.container.querySelector(".friend-presence-scroll")).toBeTruthy();
  expect(view.container.querySelectorAll(".friend-presence-row .coinche-app-card")).toHaveLength(0);
  expect(view.container.querySelector("li.coinche-social-row")?.textContent).toBe("DavidAjouter");
  fireEvent.click(screen.getAllByRole("button", { name: "Supprimer" })[0]);
  expect(onRemove).toHaveBeenCalledWith("charlie", "Charlie");
});

it("filters invitable friends locally and allows online and offline invitations", async () => {
  mocks.online = new Set(["zoe", "charlie"]);
  mocks.list.mockResolvedValue(friends);
  mocks.invite.mockResolvedValue({ status: "pending" });
  const session = { access_token: "test" } as Parameters<typeof GameInvitationDialog>[0]["session"];
  const view = render(React.createElement(GameInvitationDialog, { onClose: () => {}, roomId: "room", session }));
  await waitFor(() => expect(view.container.querySelectorAll(".friend-presence-row")).toHaveLength(4));
  expect([...view.container.querySelectorAll(".friend-presence-name")].map((node) => node.textContent)).toEqual(["Charlie", "Zoé", "Alice", "Bob"]);
  fireEvent.click(view.container.querySelectorAll(".friend-presence-row button")[0]);
  await waitFor(() => expect(screen.getByText("Invitation envoyée")).toBeTruthy());
  fireEvent.click([...view.container.querySelectorAll(".friend-presence-row")].find((row) => row.textContent?.includes("Alice"))!.querySelector("button")!);
  await waitFor(() => expect(mocks.invite).toHaveBeenCalledWith("room", "alice", session));
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un ami" }), { target: { value: "ZOE" } });
  expect([...view.container.querySelectorAll(".friend-presence-name")].map((node) => node.textContent)).toEqual(["Zoé"]);
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un ami" }), { target: { value: "absent" } });
  expect(screen.getByText("Aucun ami correspondant.")).toBeTruthy();
  expect(mocks.list).toHaveBeenCalledWith("room", session);
});

it("keeps the already-invited row state when another seated friend invited first", async () => {
  mocks.list.mockResolvedValue([friends[0]]);
  mocks.invite.mockResolvedValue({ status: "already_invited" });
  const session = { access_token: "test" } as Parameters<typeof GameInvitationDialog>[0]["session"];
  render(React.createElement(GameInvitationDialog, { onClose: () => {}, roomId: "room", session }));
  fireEvent.click(await screen.findByRole("button", { name: /^Inviter$/ }));
  expect(await screen.findByText("Déjà invité")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Inviter$/ })).toBeNull();
});

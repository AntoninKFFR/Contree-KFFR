// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FriendsView } from "@/components/friends/FriendsView";
import type { SocialSnapshot } from "@/lib/socialApi";

vi.stubGlobal("React", React);
afterEach(cleanup);

const snapshot: SocialSnapshot = {
  friends: [{ userId: "alice", username: "Alice", createdAt: "now" }],
  received: [{ id: "r1", userId: "bob", username: "Bob", createdAt: "now" }],
  sent: [{ id: "r2", userId: "carol", username: "Carol", createdAt: "now" }],
  counts: { friends: 1, received: 1, sent: 1 },
};

it("keeps social content in one centered column of simple rows with working actions", () => {
  const onRemove = vi.fn();
  const onAccept = vi.fn();
  const onDecline = vi.fn();
  const onCancel = vi.fn();
  const onSend = vi.fn();
  const onQueryChange = vi.fn();
  const view = render(React.createElement(FriendsView, { state: "ready", snapshot, query: "Dave", searchResults: [{ userId: "dave", username: "Dave" }],
    searchState: "ready", onRemove, onAccept, onDecline, onCancel, onSend, onQueryChange }));
  expect(view.container.querySelector(".max-w-4xl")).not.toBeNull();
  expect(view.container.querySelectorAll(".coinche-social-row")).toHaveLength(4);
  expect(view.container.querySelector(".coinche-app-card")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
  fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
  fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Pseudo" }), { target: { value: "David" } });
  expect(onRemove).toHaveBeenCalledWith("alice", "Alice");
  expect(onAccept).toHaveBeenCalledWith("r1");
  expect(onDecline).toHaveBeenCalledWith("r1");
  expect(onCancel).toHaveBeenCalledWith("r2");
  expect(onSend).toHaveBeenCalledWith("dave");
  expect(onQueryChange).toHaveBeenCalledWith("David");
});

it("hides empty invitation panels and collapses empty requests", () => {
  const view = render(React.createElement(FriendsView, { state: "ready", snapshot: { friends: [], received: [], sent: [], counts: { friends: 0, received: 0, sent: 0 } },
    gameInvitations: { invitations: [], counts: { receivedPending: 0, sentPending: 0 } }, currentUserId: "viewer", query: "", searchResults: [], searchState: "idle" }));
  expect(screen.getByText("Demandes · aucune en attente")).toBeTruthy();
  expect(screen.queryByText("Invitations de partie")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Pseudo" })).toBeTruthy();
  expect(view.container.querySelector(".coinche-app-card")).toBeNull();
});

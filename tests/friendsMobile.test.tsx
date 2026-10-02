// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FriendsView } from "@/components/friends/FriendsView";
import { FriendsPageClient } from "@/app/friends/FriendsPageClient";
import { FriendPresenceList } from "@/components/social/FriendPresenceList";
import type { SocialSnapshot } from "@/lib/socialApi";

vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), remove: vi.fn(), push: vi.fn() }));
const session = { access_token: "test", user: { id: "viewer" } };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/social/useFriendPresence", () => ({ useFriendPresence: () => new Set(["alice"]) }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({ auth: {
  getSession: async () => ({ data: { session } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} }) }));
vi.mock("@/lib/socialApi", async (original) => ({ ...(await original<object>()),
  fetchSocialSnapshot: mocks.snapshot, removeFriend: mocks.remove,
  fetchGameInvitations: async () => ({ invitations: [], counts: { receivedPending: 0, sentPending: 0 } }),
}));
const longName = "Pseudo".repeat(6) + "Long";
const snapshot: SocialSnapshot = {
  friends: [{ userId: "alice", username: "Alice", level: 1, createdAt: "now" }, { userId: "bob", username: longName, level: 311, createdAt: "now" }],
  received: [{ id: "r1", userId: "carol", username: "Carol", createdAt: "now" }], sent: [], counts: { friends: 2, received: 1, sent: 0 },
};
const props = { state: "ready" as const, snapshot, onlineIds: new Set(["alice"]), query: "Carol", searchState: "ready" as const, searchResults: [{userId:"carol", username:"Carol"}] };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.clearAllMocks(); mocks.snapshot.mockResolvedValue(snapshot); mocks.remove.mockResolvedValue({ status: "removed" }); });

describe("compact friends identity and More interaction", () => {
  it("uses accessible identity links beside actions, with full long names, level and textual presence", () => {
    const view = render(<FriendsView {...props} />);
    const profile = screen.getByRole("link", { name: `Voir le profil de ${longName}`, description: "Niv. 311 Hors ligne" });
    expect(profile.getAttribute("href")).toBe("/friends/bob"); expect(profile.title).toBe(longName);
    expect(profile.getAttribute("tabindex")).toBe("0");
    expect(profile.querySelector("button")).toBeNull();
    expect(within(profile).getByText("Niv. 311")).toBeTruthy(); expect(within(profile).getByText("Hors ligne")).toBeTruthy();
    expect(screen.getByRole("heading", {name:"En ligne · 1"})).toBeTruthy();
    expect(screen.getByRole("heading", {name:"Hors ligne · 1"})).toBeTruthy();
    expect(view.container.querySelectorAll(".friend-presence-row")).toHaveLength(2);
    expect(screen.queryByText("Supprimer de mes amis")).toBeNull();
  });

  it("opens from the keyboard, focuses the destructive action and restores focus on Escape or second tap", () => {
    render(<FriendsView {...props} />);
    const trigger = screen.getByRole("button", {name:"Plus d’actions pour Alice"}); trigger.focus();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.keyDown(trigger, {key:"ArrowDown"});
    const item = screen.getByRole("menuitem", {name:"Supprimer de mes amis"});
    expect(document.activeElement).toBe(item); expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(trigger.getAttribute("aria-controls")!)).toBe(screen.getByRole("menu"));
    fireEvent.keyDown(item, {key:"Escape"});
    expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger); fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(trigger);
  });

  it("refocuses the item with either arrow after returning to the trigger of an already-open menu", () => {
    render(<FriendsView {...props} />);
    const trigger=screen.getByRole("button",{name:"Plus d’actions pour Alice"}); fireEvent.click(trigger);
    const item=screen.getByRole("menuitem",{name:"Supprimer de mes amis"});
    for(const key of ["ArrowUp","ArrowDown"]){
      act(()=>trigger.focus()); expect(screen.getByRole("menu")).toBeTruthy();
      fireEvent.keyDown(trigger,{key}); expect(document.activeElement).toBe(item);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("allows only one inline menu and closes on outside click or native focus navigation", () => {
    render(<FriendsView {...props} />);
    const first = screen.getByRole("button", {name:"Plus d’actions pour Alice"});
    const second = screen.getByRole("button", {name:`Plus d’actions pour ${longName}`});
    fireEvent.click(first);
    fireEvent.pointerDown(second); act(() => second.focus());
    expect(screen.getByRole("menu", {name:"Actions pour Alice"})).toBeTruthy();
    fireEvent.pointerUp(second); fireEvent.click(second);
    expect(screen.getAllByRole("menu")).toHaveLength(1); expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("menu", {name:`Actions pour ${longName}`})).toBeTruthy();
    fireEvent.click(screen.getByRole("heading", {name:"Amis"}));
    expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(second);
    fireEvent.click(first); act(() => screen.getByRole("textbox", {name:"Pseudo"}).focus());
    expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(screen.getByRole("textbox", {name:"Pseudo"}));
  });

  it.each(["play:alice", "train:alice", "friend:alice"])("disables every friend identity/action and closes a menu during %s", (pendingAction) => {
    const view = render(<FriendsView {...props} />);
    fireEvent.click(screen.getByRole("button", {name:"Plus d’actions pour Alice"}));
    view.rerender(<FriendsView {...props} pendingAction={pendingAction} />);
    expect(screen.queryByRole("menu")).toBeNull(); expect(screen.queryAllByRole("link", {name:/Voir le profil/})).toHaveLength(0);
    for (const button of view.container.querySelectorAll<HTMLButtonElement>(".friend-presence-row button")) expect(button.disabled).toBe(true);
    if (pendingAction.startsWith("friend:")) expect(screen.getByRole("status").textContent).toBe("Suppression…");
    else {
      expect(screen.getByRole("button", {name:"Répondre à la demande"})).toHaveProperty("disabled", true);
      expect(screen.getByRole("button", {name:"En cours…"})).toHaveProperty("disabled", true);
    }
  });

  it("preserves the generic list's unwrapped identity and default action for other dialogs", () => {
    const view = render(<FriendPresenceList friends={snapshot.friends} onlineIds={new Set(["alice"])} action={(friend) => <button>Inviter {friend.username}</button>} />);
    expect(view.container.querySelector(".friends-identity")).toBeNull(); expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2); expect(screen.getByText("Niv. 311")).toBeTruthy();
  });

  it("contains wheel overshoot at list boundaries without intercepting interior scrolling or user zoom", () => {
    render(<FriendsView {...props} />);
    const list=screen.getByTestId("friends-presence-scroll");
    Object.defineProperties(list,{clientHeight:{value:300},scrollHeight:{value:900}});
    list.scrollTop=100;
    expect(fireEvent.wheel(list,{deltaY:100,cancelable:true})).toBe(true); expect(list.scrollTop).toBe(100);
    expect(fireEvent.wheel(list,{deltaY:700,cancelable:true})).toBe(false); expect(list.scrollTop).toBe(600);
    expect(fireEvent.wheel(list,{deltaY:-700,cancelable:true})).toBe(false); expect(list.scrollTop).toBe(0);
    expect(fireEvent.wheel(list,{deltaY:-100,ctrlKey:true,cancelable:true})).toBe(true);
    expect(fireEvent.wheel(list,{deltaY:-100,metaKey:true,cancelable:true})).toBe(true);
  });
});

describe("friend removal keeps the real client confirmation and refresh", () => {
  async function requestRemoval() {
    fireEvent.click(await screen.findByRole("button", {name:`Plus d’actions pour ${longName}`}));
    fireEvent.click(screen.getByRole("menuitem", {name:"Supprimer de mes amis"}));
  }
  it("cancels confirmation without a mutation, retaining the friendship", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FriendsPageClient />); await requestRemoval();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(`Supprimer ${longName} de tes amis ?`);
    expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", {name:`Voir le profil de ${longName}`})).toBeTruthy();
  });
  it("waits for confirmed DELETE, blocks concurrent row actions and refreshes before showing success", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let finish!: (value: {status:string}) => void;
    const response = new Promise<{status:string}>(resolve => {finish=resolve;}); mocks.remove.mockReturnValue(response);
    render(<FriendsPageClient />); await requestRemoval();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("bob", session);
    expect(screen.getByText(longName)).toBeTruthy(); expect(screen.getByRole("status").textContent).toBe("Suppression…");
    fireEvent.click(screen.getByRole("button", {name:"Plus d’actions pour Alice"})); expect(screen.queryByRole("menu")).toBeNull();
    mocks.snapshot.mockResolvedValue({...snapshot, friends:[snapshot.friends[0]], counts:{...snapshot.counts, friends:1}});
    await act(async () => {finish({status:"removed"}); await response;});
    await waitFor(() => expect(screen.queryByRole("link", {name:`Voir le profil de ${longName}`})).toBeNull());
    expect(screen.getByRole("status").textContent).toBe(`${longName} a été retiré de tes amis.`);
    expect(mocks.snapshot.mock.calls.length).toBeGreaterThan(1); expect(mocks.push).not.toHaveBeenCalled();
  });
});

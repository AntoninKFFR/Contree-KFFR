// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SocialNotificationsProvider, SocialNotificationTrigger } from "@/components/social/SocialNotifications";
import { parseTrainingDuoInvitations } from "@/lib/trainingDuoInvitationsApi";
import { pendingNotifications, newNotificationKeys, notificationKey } from "@/lib/socialNotifications";
import { notifySocialChanged } from "@/lib/socialEvents";
vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({ list: vi.fn(), push: vi.fn(), auth: null as null | ((event: string, session: unknown) => void) }));
const session = { access_token: "token", user: { id: "receiver" } };
const invitation = { id: "duo-invitation", username: "Alice", level: 2, status: "pending", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() };
const social = { friends: [], received: [], sent: [], counts: { friends: 0, received: 0, sent: 0 } };
const games = { invitations: [], counts: { receivedPending: 0, sentPending: 0 } };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/socialApi", async (importOriginal) => ({ ...(await importOriginal<object>()), fetchSocialSnapshot: async () => social, fetchGameInvitations: async () => games }));
vi.mock("@/lib/trainingDuoInvitationsApi", async (importOriginal) => ({ ...(await importOriginal<object>()), fetchTrainingDuoInvitations: (...args: unknown[]) => mocks.list(...args) }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({
  auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: (callback: typeof mocks.auth) => { mocks.auth = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: vi.fn(),
}) }));
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([invitation]); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { sessionId: "joined-duo" } })))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.stubGlobal("React", React); });
async function openCenter() {
  render(React.createElement(SocialNotificationsProvider, null, React.createElement(SocialNotificationTrigger)));
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  await screen.findByRole("button", { name: "Notifications" });
  await waitFor(() => expect(screen.getByText("1 notifications en attente")).toBeTruthy());
  expect(screen.queryByLabelText("Nouvelles notifications")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
}
it("strictly parses private-free Duo notifications and applies the first-load toast baseline", () => {
  const parsed = parseTrainingDuoInvitations([invitation]);
  const baseline = pendingNotifications(social, games, "receiver", parsed);
  expect(baseline[0].kind).toBe("duo"); expect(newNotificationKeys(null, baseline)).toEqual([]);
  expect(newNotificationKeys(new Set(), baseline)).toEqual(["duo:duo-invitation"]);
  expect(newNotificationKeys(new Set(baseline.map(notificationKey)), baseline)).toEqual([]);
  expect(() => parseTrainingDuoInvitations([{ ...invitation, code: "SECRET" }])).toThrow();
});
it("joins through the invitation endpoint and navigates after membership is committed", async () => {
  await openCenter();
  expect(screen.getByText("Alice t’invite à s’entraîner")).toBeTruthy();
  expect(screen.getByText(/Lire les enchères · Niveau 2/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Rejoindre le duo de Alice" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/training/duo/joined-duo"));
  expect(fetch).toHaveBeenCalledWith("/api/training/duo/invitations/duo-invitation/join", expect.objectContaining({ method: "POST", body: "{}" }));
});
it("declines through the invitation endpoint and removes the pending notification", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { status: "declined" } })));
  await openCenter(); mocks.list.mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Refuser l’invitation de Alice" }));
  await waitFor(() => expect(screen.queryByText("Alice t’invite à s’entraîner")).toBeNull());
  expect(fetch).toHaveBeenCalledWith("/api/training/duo/invitations/duo-invitation/decline", expect.objectContaining({ method: "POST" }));
  expect(mocks.push).not.toHaveBeenCalled();
});
it("toasts new invitations and clears them on logout", async () => {
  mocks.list.mockResolvedValue([]);
  render(React.createElement(SocialNotificationsProvider, null, React.createElement(SocialNotificationTrigger)));
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  mocks.list.mockResolvedValue([invitation]); notifySocialChanged();
  expect(await screen.findByLabelText("Nouvelles notifications")).toBeTruthy();
  mocks.auth?.("SIGNED_OUT", null);
  await waitFor(() => expect(screen.queryByLabelText("Nouvelles notifications")).toBeNull());
});

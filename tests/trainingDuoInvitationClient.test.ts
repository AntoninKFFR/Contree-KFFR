// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrainingDuoSessionClient } from "@/components/training/TrainingDuoSessionClient";
import { duoFixture } from "@/tests/trainingDuoClientFixtures";
vi.stubGlobal("React", React);
const state = vi.hoisted(() => ({ view: null as ReturnType<typeof duoFixture> | null, query: "inviteFriends=1", invite: vi.fn(), replace: vi.fn() }));
const session = { access_token: "token", user: { id: "host" } };
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }), useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/components/social/useFriendPresence", () => ({ useFriendPresence: () => new Set() }));
vi.mock("@/components/training/useTrainingDuoSync", () => ({
  duoErrorMessage: (cause: Error) => cause.message,
  useTrainingDuoSync: () => ({ pageState: "ready", session, view: state.view, error: null, setError: vi.fn(), acceptView: vi.fn(), refresh: vi.fn(), markTerminalError: vi.fn() }),
}));
vi.mock("@/lib/socialApi", () => ({ fetchSocialSnapshot: async () => ({ friends: [{ userId: "bob", username: "Bob" }] }), socialErrorMessage: (cause: Error) => cause.message }));
vi.mock("@/lib/trainingDuoInvitationsApi", () => ({ sendTrainingDuoInvitation: (...args: unknown[]) => state.invite(...args) }));
beforeEach(() => {
  vi.clearAllMocks(); state.query = "inviteFriends=1";
  state.view = duoFixture(); state.view.participants = state.view.participants.filter((person) => person.slot === 0);
  state.invite.mockResolvedValue({ status: "pending" });
});
afterEach(cleanup);
it("opens the retry dialog with the warning, invites offline friends and cleans the query on close", async () => {
  render(React.createElement(TrainingDuoSessionClient, { sessionId: "created-duo" }));
  expect(screen.getByRole("dialog", { name: "Inviter un ami" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toBe("Le duo a été créé, mais l’invitation n’a pas pu être envoyée. Réessaie depuis le lobby.");
  const invite = await screen.findByRole("button", { name: "Inviter" });
  expect(screen.getByText("Hors ligne")).toBeTruthy(); expect(invite).toHaveProperty("disabled", false);
  fireEvent.click(invite);
  await waitFor(() => expect(state.invite).toHaveBeenCalledExactlyOnceWith("created-duo", "bob", session));
  expect(await screen.findByText("Invitation envoyée")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Fermer$/ }));
  expect(state.replace).toHaveBeenCalledWith("/training/duo/created-duo", { scroll: false });
});
it("keeps the code fallback and removes the invitation action and dialog when a partner joins", async () => {
  state.query = "";
  const page = render(React.createElement(TrainingDuoSessionClient, { sessionId: "created-duo" }));
  expect(screen.getByRole("button", { name: "Copier le code" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Inviter un ami" }));
  expect(await screen.findByRole("button", { name: "Inviter" })).toBeTruthy();
  state.view = duoFixture();
  page.rerender(React.createElement(TrainingDuoSessionClient, { sessionId: "created-duo" }));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByRole("button", { name: "Inviter un ami" })).toBeNull();
});

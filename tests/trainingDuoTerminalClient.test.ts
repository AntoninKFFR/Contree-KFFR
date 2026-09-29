// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrainingDuoSessionClient } from "@/components/training/TrainingDuoSessionClient";
import { TrainingDuoApiError } from "@/lib/trainingDuoApi";
import { duoFixture } from "@/tests/trainingDuoClientFixtures";

vi.stubGlobal("React", React);
const { state, refresh, send } = vi.hoisted(() => ({
  state: { pageState: "ready", view: null as ReturnType<typeof duoFixture> | null },
  refresh: vi.fn(), send: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/training/useTrainingDuoSync", () => ({
  duoErrorMessage: (error: unknown) => String(error),
  useTrainingDuoSync: () => ({ pageState: state.pageState, session: { access_token: "token" }, view: state.view,
    error: null, setError: vi.fn(), acceptView: vi.fn(), refresh, markTerminalError: () => true }),
}));
vi.mock("@/lib/trainingDuoApi", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/trainingDuoApi")>()),
  sendTrainingDuoIntentWithRetry: (...args: unknown[]) => send(...args),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); state.pageState = "ready"; state.view = null; });

it("renders an expired canonical session with a new-session CTA", () => {
  state.pageState = "expired";
  state.view = duoFixture("cancelled"); state.view.session.cancelReason = "expired";
  render(React.createElement(TrainingDuoSessionClient, { sessionId: "duo-id" }));
  expect(screen.getByRole("heading", { name: "Cette session a expiré." })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Refaire un duo" }).getAttribute("href")).toBe("/training/duo");
  expect(screen.getByRole("link", { name: "Retour à l’entraînement" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Session interrompue" })).toBeNull();
});

for (const code of ["duo_session_expired", "duo_version_unsupported", "duo_session_not_found"]) {
  it(`refreshes the canonical view after a mutation receives ${code}`, async () => {
    state.view = duoFixture();
    send.mockRejectedValue(new TrainingDuoApiError("Terminal", 409, code));
    refresh.mockResolvedValue(undefined);
    render(React.createElement(TrainingDuoSessionClient, { sessionId: "duo-id" }));
    fireEvent.click(screen.getByRole("button", { name: "Je suis prêt" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
}

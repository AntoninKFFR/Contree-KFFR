// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrainingDuoSessionClient } from "@/components/training/TrainingDuoSessionClient";
import { duoFixture } from "@/tests/trainingDuoClientFixtures";

vi.stubGlobal("React", React);
const replace = vi.fn(); const send = vi.fn(); const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace }) }));
vi.mock("@/components/training/useTrainingDuoSync", () => ({
  duoErrorMessage: (error: unknown) => String(error),
  useTrainingDuoSync: () => ({ pageState: "ready", session: { access_token: "token" }, view: duoFixture("lobby", 1),
    error: null, setError: vi.fn(), acceptView: vi.fn(), refresh }),
}));
vi.mock("@/lib/trainingDuoApi", () => ({ sendTrainingDuoIntentWithRetry: (...args: unknown[]) => send(...args) }));
afterEach(cleanup);
it("redirects immediately after a guest 204 without refetching", async () => {
  send.mockReset().mockResolvedValue(null); replace.mockReset(); refresh.mockReset();
  render(React.createElement(TrainingDuoSessionClient, { sessionId: "duo-id" }));
  fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/training/duo"));
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ viewerSlot: 1 }), { type: "leave" }, expect.anything());
  expect(refresh).not.toHaveBeenCalled();
});

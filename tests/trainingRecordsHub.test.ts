// @vitest-environment jsdom
import React, { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readAccount: vi.fn(), onAuth: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/trainingRecordsClient", () => ({ readAccountTrainingRecords: mocks.readAccount }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: mocks.client }));
vi.mock("@/components/training/progress", async (original) => {
  const actual = await original<typeof import("@/components/training/progress")>();
  return { ...actual, readTrainingProgress: () => {
    const progress = actual.emptyTrainingProgress();
    progress.axes["trick-value"].levels[1] = { bestScore: 8, completedSeries: 1 };
    return progress;
  } };
});

import { TrainingHubClient } from "@/components/training/TrainingHubClient";

vi.stubGlobal("React", React);
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { onAuthStateChange: mocks.onAuth } });
  mocks.onAuth.mockReturnValue({ data: { subscription: { unsubscribe: () => {} } } });
});

describe("training hub account records", () => {
  it("keeps the local score visible next to the account record and perfect time", async () => {
    mocks.readAccount.mockResolvedValue({ signedIn: true, failed: false, records: [
      { axisId: "trick-value", level: 1, bestScore: 10, bestDurationMs: 42_300 },
    ] });
    render(createElement(TrainingHubClient));
    await waitFor(() => expect(screen.getByText(/Record compte : 10 \/ 10/)).toBeTruthy());
    expect(screen.getByText("Meilleur score : 8 / 10")).toBeTruthy();
    expect(screen.getByText(/Meilleur temps : 42,3 s/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Jouer le niveau 1" })).toBeTruthy();
  });

  it("keeps anonymous puzzles accessible and shows no account record", async () => {
    mocks.readAccount.mockResolvedValue({ signedIn: false, failed: false, records: [] });
    render(createElement(TrainingHubClient));
    await waitFor(() => expect(screen.getByText(/Connecte-toi pour sauvegarder/)).toBeTruthy());
    expect(screen.queryByText(/Record compte :/)).toBeNull();
    expect(screen.getByRole("link", { name: "Jouer le niveau 1" })).toBeTruthy();
  });
});

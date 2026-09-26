// @vitest-environment jsdom
import React, { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/trainingLeaderboardClient", () => ({ readFriendsTrainingLeaderboard: mocks.read }));
import { TrainingFriendsLeaderboard } from "@/components/training/TrainingFriendsLeaderboard";
import type { TrainingLeaderboardResult } from "@/lib/trainingLeaderboardClient";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

vi.stubGlobal("React", React);
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ status: "ready", entries: [] });
});

describe("friends training leaderboard on the hub", () => {
  it("shows a connection prompt without querying for a signed-out player", () => {
    render(createElement(TrainingFriendsLeaderboard, { signedIn: false, authEpoch: 0, authGeneration: { current: 0 } }));
    expect(screen.getByText("Connecte-toi pour comparer tes records avec ceux de tes amis.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Classement entre amis" })).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("keeps RPC order and shows fractional scores and French durations", async () => {
    mocks.read.mockResolvedValue({ status: "ready", entries: [
      { username: "Béatrice", bestScore: 10, bestDurationMs: 18_400 },
      { username: "Alice", bestScore: 9.75, bestDurationMs: null },
    ] });
    render(createElement(TrainingFriendsLeaderboard, { signedIn: true, authEpoch: 0, authGeneration: { current: 0 } }));
    const list = await screen.findByRole("list", { name: "Classement entre amis" });
    const rows = [...list.querySelectorAll("li")].map((item) => item.textContent);
    expect(rows[0]).toContain("1.Béatrice10 / 1018,4 s");
    expect(rows[1]).toContain("2.Alice9,75 / 10");
    expect(rows[1]).not.toContain("null");
  });

  it("displays eighth-point records without rounding them", async () => {
    mocks.read.mockResolvedValue({ status: "ready", entries: [
      { username: "Camille", bestScore: 9.875, bestDurationMs: null },
    ] });
    render(createElement(TrainingFriendsLeaderboard, { signedIn: true, authEpoch: 0, authGeneration: { current: 0 } }));
    expect(await screen.findByText("9,875 / 10")).toBeTruthy();
    expect(screen.queryByText("9,88 / 10")).toBeNull();
  });

  it("shows empty and error states without blocking the hub", async () => {
    const authGeneration = { current: 0 };
    const view = render(createElement(TrainingFriendsLeaderboard, { signedIn: true, authEpoch: 0, authGeneration }));
    expect(await screen.findByText("Aucun record à afficher pour ce niveau.")).toBeTruthy();
    mocks.read.mockResolvedValue({ status: "failed", entries: [] });
    view.rerender(createElement(TrainingFriendsLeaderboard, { signedIn: true, authEpoch: 1, authGeneration }));
    expect(await screen.findByText("Classement indisponible pour le moment.")).toBeTruthy();
  });

  it("queries the chosen axis and level and offers only persisted puzzle axes", async () => {
    render(createElement(TrainingFriendsLeaderboard, { signedIn: true, authEpoch: 0, authGeneration: { current: 0 } }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith("trick-value", 1));
    const axis = screen.getByRole("combobox", { name: "Axe du classement" });
    expect([...axis.querySelectorAll("option")].map((option) => option.value)).toEqual([
      "trick-value", "master-cards", "master-in-hand", "played-cards", "trick-recall", "opponent-voids",
    ]);
    fireEvent.change(axis, { target: { value: "played-cards" } });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith("played-cards", 1));
    const level = screen.getByRole("combobox", { name: "Niveau du classement" });
    expect([...level.querySelectorAll("option")].map((option) => option.value)).toEqual(["1", "2", "3", "4", "5"]);
    fireEvent.change(level, { target: { value: "5" } });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith("played-cards", 5));
  });

  it("discards account A's pending leaderboard after logout", async () => {
    const authGeneration = { current: 1 };
    const pendingA = deferred<TrainingLeaderboardResult>();
    mocks.read.mockReturnValueOnce(pendingA.promise);
    const view = render(createElement(TrainingFriendsLeaderboard, { signedIn: true, authEpoch: 1, authGeneration }));
    expect(mocks.read).toHaveBeenCalledTimes(1);
    authGeneration.current = 2;
    view.rerender(createElement(TrainingFriendsLeaderboard, { signedIn: false, authEpoch: 2, authGeneration }));
    await act(async () => { pendingA.resolve({ status: "ready", entries: [
      { username: "AccountA", bestScore: 10, bestDurationMs: null },
    ] }); });
    expect(screen.getByText("Connecte-toi pour comparer tes records avec ceux de tes amis.")).toBeTruthy();
    expect(screen.queryByText("AccountA")).toBeNull();
  });

  it("keeps B's result when A finishes after an account switch", async () => {
    const authGeneration = { current: 1 };
    const pendingA = deferred<TrainingLeaderboardResult>();
    const pendingB = deferred<TrainingLeaderboardResult>();
    mocks.read.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
    const view = render(createElement(TrainingFriendsLeaderboard, { signedIn: true, authEpoch: 1, authGeneration }));
    authGeneration.current = 2;
    view.rerender(createElement(TrainingFriendsLeaderboard, { signedIn: true, authEpoch: 2, authGeneration }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
    await act(async () => { pendingB.resolve({ status: "ready", entries: [
      { username: "AccountB", bestScore: 7, bestDurationMs: null },
    ] }); });
    expect(screen.getByText("AccountB")).toBeTruthy();
    await act(async () => { pendingA.resolve({ status: "ready", entries: [
      { username: "AccountA", bestScore: 10, bestDurationMs: null },
    ] }); });
    expect(screen.getByText("AccountB")).toBeTruthy();
    expect(screen.queryByText("AccountA")).toBeNull();
  });
});

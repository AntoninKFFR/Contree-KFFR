// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameTable } from "@/components/GameTable";
import { clonePlayerPreferences } from "@/lib/preferences/playerPreferences";
import type { PlayerGameView } from "@/engine/views";
import fixtures from "../apps/mobile/tests/final-trick/states.json";
const prefs = vi.hoisted(() => ({ value: {} as ReturnType<typeof clonePlayerPreferences>, reduced: false }));
vi.mock("@/components/settings/PlayerPreferencesProvider", () => ({ usePlayerPreferences: () => ({ preferences: prefs.value, effectiveReducedMotion: prefs.reduced }) }));
vi.mock("@/lib/preferences/audio", () => ({ playPreferenceSound: vi.fn() }));
beforeEach(() => { vi.useFakeTimers(); prefs.value = clonePlayerPreferences(); prefs.value.gameplay.trickDisplayMs = 1200; prefs.reduced = false; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const result = <button>Résultat confirmé</button>;
const state = (kind: "round" | "game", when: "before" | "after", seat = 0) => fixtures[kind][when][seat].game! as PlayerGameView;
const count = (container: HTMLElement) => container.querySelectorAll(".coinche-trick-card").length;

for (const kind of ["round", "game"] as const) for (const viewer of [0, 1, 2, 3]) it(`web ${kind}, viewer ${viewer}${viewer === 1 ? " receiving a bot's final card" : ""}: final cards precede result without delaying authoritative scores`, () => {
  const before = state(kind, "before", viewer), after = state(kind, "after", viewer), unchanged = JSON.stringify(after);
  const players = fixtures[kind].before[viewer].players.map((p) => ({ ...p, kind: viewer === 1 && p.seat_index === 0 ? "bot" as const : p.kind })) as import("@/lib/roomTypes").RoomPlayerView[];
  const table = render(<GameTable state={before} players={players} completion={result} />);
  expect(count(table.container)).toBe(3);
  table.rerender(<GameTable state={after} players={players} completion={result} />);
  expect(count(table.container)).toBe(4); expect(screen.queryByText("Résultat confirmé")).toBeNull();
  expect(JSON.stringify(after)).toBe(unchanged);
  act(() => vi.advanceTimersByTime(1199)); expect(screen.queryByText("Résultat confirmé")).toBeNull();
  act(() => vi.advanceTimersByTime(1)); expect(screen.getByText("Résultat confirmé")).toBeTruthy();
  expect(count(table.container)).toBe(0); expect(JSON.stringify(after)).toBe(unchanged); expect(vi.getTimerCount()).toBe(0);
});

it("web manual final collection remains accessible and opens the result exactly once", () => {
  prefs.value.gameplay.autoCollectTricks = false;
  const table = render(<GameTable state={state("game", "before")} completion={result} />);
  table.rerender(<GameTable state={state("game", "after")} completion={result} />);
  act(() => vi.advanceTimersByTime(10000)); expect(count(table.container)).toBe(4);
  expect(screen.queryByText("Résultat confirmé")).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: /Ramasser le pli/ }));
  expect(screen.getByText("Résultat confirmé")).toBeTruthy(); expect(screen.queryByRole("button", { name: /Ramasser/ })).toBeNull();
});

it("web instant mode paints one frame, without a zero-duration animation hiding its cards", () => {
  prefs.value.gameplay.trickDisplayMs = 0;
  const table = render(<GameTable state={state("game", "before")} completion={result} />);
  table.rerender(<GameTable state={state("game", "after")} completion={result} />);
  expect(count(table.container)).toBe(4); expect(table.container.querySelector(".coinche-trick-collect")).toBeNull();
  expect(screen.queryByText("Résultat confirmé")).toBeNull();
  act(() => vi.advanceTimersToNextFrame()); expect(screen.queryByText("Résultat confirmé")).toBeNull();
  act(() => vi.advanceTimersToNextFrame()); expect(screen.getByText("Résultat confirmé")).toBeTruthy();
});

it.each(["reduced", "animations-off"])("web %s preserves the reading duration without motion", (mode) => {
  prefs.reduced = mode === "reduced"; prefs.value.visual.animations = mode !== "animations-off";
  const table = render(<GameTable state={state("round", "before")} completion={result} />);
  table.rerender(<GameTable state={state("round", "after")} completion={result} />);
  expect(count(table.container)).toBe(4); expect(table.container.querySelector(".coinche-trick-collect")).toBeNull();
  act(() => vi.advanceTimersByTime(1200)); expect(screen.getByText("Résultat confirmé")).toBeTruthy();
});

it("web repeated versions and unrelated preferences do not restart the deadline", () => {
  const table = render(<GameTable state={state("game", "before")} completion={result} />);
  table.rerender(<GameTable state={state("game", "after")} completion={result} />);
  act(() => vi.advanceTimersByTime(600));
  prefs.value = { ...prefs.value, assistance: { ...prefs.value.assistance, showLivePoints: true } };
  table.rerender(<GameTable state={JSON.parse(JSON.stringify(state("game", "after")))} completion={result} />);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(599)); expect(screen.queryByText("Résultat confirmé")).toBeNull();
  table.rerender(<GameTable state={JSON.parse(JSON.stringify(state("game", "after")))} completion={result} />);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(1)); expect(screen.getByText("Résultat confirmé")).toBeTruthy();
});

it("web late join and forfeit display their result immediately", () => {
  const table = render(<GameTable state={state("game", "after")} completion={result} replaceWithCompletion />);
  expect(screen.getByText("Résultat confirmé")).toBeTruthy(); expect(vi.getTimerCount()).toBe(0);
  table.rerender(<GameTable state={state("game", "before")} completion={undefined} />);
  table.rerender(<GameTable state={{ ...state("game", "after"), endReason: "forfeit" }} completion={result} replaceWithCompletion />);
  expect(screen.getByText("Résultat confirmé")).toBeTruthy(); expect(vi.getTimerCount()).toBe(0);
});

it.each(["scope", "round", "visibility", "unmount"])("web %s cancels the old final presentation without showing it on a new game", (mode) => {
  const table = render(<GameTable state={state("game", "before")} completion={result} />);
  table.rerender(<GameTable state={state("game", "after")} completion={result} />);
  if (mode === "unmount") table.unmount();
  else if (mode === "visibility") {
    fireEvent(document, new Event("visibilitychange")); expect(screen.getByText("Résultat confirmé")).toBeTruthy();
    table.rerender(<GameTable state={state("game", "before")} completion={result} />);
    fireEvent(document, new Event("visibilitychange"));
    table.rerender(<GameTable state={state("game", "after")} completion={result} />);
    expect(screen.queryByText("Résultat confirmé")).toBeNull();
  }
  else table.rerender(<GameTable state={{ ...state("game", "before"), roundNumber: mode === "round" ? 2 : 1 }} presentationScope={mode === "scope" ? "new-room-or-account" : "game"} />);
  act(() => vi.advanceTimersByTime(5000)); expect(vi.getTimerCount()).toBe(0);
  if (mode !== "visibility") expect(screen.queryByText("Résultat confirmé")).toBeNull();
});

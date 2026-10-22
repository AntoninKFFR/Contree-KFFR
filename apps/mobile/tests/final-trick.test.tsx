import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import { NativeMultiplayerTable } from "../src/multiplayer/table";
import { initialRoomState, type RoomState } from "../src/multiplayer/controller";
import type { MultiplayerRoomView } from "../src/multiplayer/contract";
import { clonePlayerPreferences } from "../../../lib/preferences/playerPreferences";
import fixtures from "./final-trick/states.json";
jest.mock("react-native-reanimated", () => {
  const builder = { duration() { return this; }, delay() { return this; } };
  return { __esModule: true, default: { View: jest.requireActual("react-native").View }, cubicBezier: () => "ease-out", FadeIn: builder, FadeInDown: builder };
});
jest.mock("@expo/ui", () => ({ Host: jest.requireActual("react-native").View, Picker: Object.assign(jest.requireActual("react-native").View, { Item: jest.requireActual("react-native").Text }) }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => { cleanup(); jest.useRealTimers(); });
const roomState = (kind: "round" | "game", when: "before" | "after", viewer = 0): RoomState => ({ ...initialRoomState, active: true, requiresSync: false, room: fixtures[kind][when][viewer] as MultiplayerRoomView });

for (const kind of ["round", "game"] as const) for (const viewer of [0, 1, 2, 3]) test(`native ${kind} viewer ${viewer}${viewer === 1 ? " receiving a bot's final card" : ""}: real final cards remain before the authoritative result`, () => {
  const preferences = clonePlayerPreferences(), send = jest.fn(), onCollected = jest.fn();
  const before = roomState(kind, "before", viewer), after = roomState(kind, "after", viewer);
  if (viewer === 1) for (const value of [before, after]) value.room = { ...value.room!, players: value.room!.players.map((p) => p.seat_index === 0 ? { ...p, kind: "bot" } : p) };
  const props = { preferences, reduced: false, width: 844, height: 390, send, onCollected };
  const table = render(<NativeMultiplayerTable {...props} state={before} />);
  table.rerender(<NativeMultiplayerTable {...props} state={after} />);
  expect(table.queryByTestId("solo-round-result")).toBeNull();
  for (const seat of [0, 1, 2, 3]) expect(table.getByTestId(`solo-play-${seat}`)).toBeVisible();
  const original = JSON.stringify(after);
  act(() => jest.advanceTimersByTime(1499)); expect(table.queryByTestId("solo-round-result")).toBeNull();
  // Presence/version changes must not restart collection.
  table.rerender(<NativeMultiplayerTable {...props} state={{ ...after, room: { ...after.room!, room: { ...after.room!.room, state_version: after.room!.room.state_version + 1 } } }} />);
  act(() => jest.advanceTimersByTime(1)); expect(table.getByTestId("solo-round-result")).toBeVisible();
  expect(send).not.toHaveBeenCalled(); expect(JSON.stringify(after)).toBe(original);
  table.unmount(); expect(jest.getTimerCount()).toBe(0);
});

test("native manual collection is touchable at game-over and reveals the result without another mutation", () => {
  const before = roomState("game", "before"), after = roomState("game", "after"), send = jest.fn();
  for (const value of [before, after]) value.room = { ...value.room!, room: { ...value.room!.room, presentation_settings: { gameSpeed: "custom", autoCollectTricks: false, trickDisplayMs: 1200 } } };
  const props = { preferences: clonePlayerPreferences(), reduced: true, width: 844, height: 390, send, onCollected: jest.fn() };
  const table = render(<NativeMultiplayerTable {...props} state={before} />);
  table.rerender(<NativeMultiplayerTable {...props} state={after} />);
  act(() => jest.advanceTimersByTime(10000)); expect(table.queryByTestId("solo-round-result")).toBeNull();
  fireEvent.press(table.getByRole("button", { name: /Ramasser le pli/ }));
  expect(table.getByTestId("solo-round-result")).toBeVisible(); expect(send).not.toHaveBeenCalled();
});

test.each(["fast", "custom", "instant", "off", "reduced"])("native %s preserves the selected reading policy", (mode) => {
  const before = roomState("game", "before"), after = roomState("game", "after"), preferences = clonePlayerPreferences();
  const delay = mode === "instant" ? 0 : mode === "fast" ? 650 : mode === "custom" ? 2700 : 1500;
  if (mode === "off") preferences.visual.animations = false;
  for (const value of [before, after]) value.room = { ...value.room!, room: { ...value.room!.room, presentation_settings: { gameSpeed: "custom", autoCollectTricks: true, trickDisplayMs: delay } } };
  const props = { preferences, reduced: mode === "reduced", width: 844, height: 390, send: jest.fn(), onCollected: jest.fn() };
  const table = render(<NativeMultiplayerTable {...props} state={before} />);
  table.rerender(<NativeMultiplayerTable {...props} state={after} />);
  expect(table.queryByTestId("solo-round-result")).toBeNull();
  if (delay) { act(() => jest.advanceTimersByTime(delay - 1)); expect(table.queryByTestId("solo-round-result")).toBeNull(); act(() => jest.advanceTimersByTime(1)); }
  else act(() => jest.advanceTimersByTime(40));
  expect(table.getByTestId("solo-round-result")).toBeVisible(); expect(props.send).not.toHaveBeenCalled();
  if (mode === "off" || mode === "reduced") expect(table.getByTestId("solo-round-result").props.entering).toBeUndefined();
});

test.each(["late", "forfeit", "new-room", "new-round", "background"])("native %s skips historical presentation and discards any old timer", (scenario) => {
  const props = { preferences: clonePlayerPreferences(), reduced: false, width: 844, height: 390, send: jest.fn(), onCollected: jest.fn() };
  const after = roomState("game", "after");
  if (scenario === "late") {
    const table = render(<NativeMultiplayerTable {...props} state={after} />);
    expect(table.getByTestId("solo-round-result")).toBeVisible(); return;
  }
  const table = render(<NativeMultiplayerTable {...props} state={roomState("game", "before")} />);
  table.rerender(<NativeMultiplayerTable {...props} state={after} />);
  if (scenario === "forfeit") {
    const game = { ...after.room!.game!, endReason: "forfeit" as const };
    table.rerender(<NativeMultiplayerTable {...props} state={{ ...after, room: { ...after.room!, game } }} />);
    expect(table.getByTestId("solo-round-result")).toBeVisible();
  } else if (scenario === "background") {
    table.rerender(<NativeMultiplayerTable {...props} state={{ ...after, active: false }} />);
    table.rerender(<NativeMultiplayerTable {...props} state={after} />);
    expect(table.getByTestId("solo-round-result")).toBeVisible();
  } else {
    const next = roomState("game", "before");
    next.room = { ...next.room!, gameId: scenario === "new-room" ? "new-game" : next.room!.gameId, game: { ...next.room!.game!, roundNumber: scenario === "new-round" ? 2 : 1 } };
    table.rerender(<NativeMultiplayerTable {...props} state={next} />);
    act(() => jest.advanceTimersByTime(5000)); expect(table.queryByTestId("solo-round-result")).toBeNull();
  }
  table.unmount(); expect(jest.getTimerCount()).toBe(0); expect(props.send).not.toHaveBeenCalled();
});

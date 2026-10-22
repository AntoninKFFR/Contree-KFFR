import { Children } from "react";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { AppState, Dimensions, ScrollView, View, type AppStateStatus } from "react-native";
import * as Orientation from "expo-screen-orientation";
import { act, cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { router } from "expo-router";

import RootLayout from "../src/app/_layout";
import Login from "../src/app/login";
import ConnectedLayout from "../src/app/(connected)/_layout";
import Home from "../src/app/(connected)/index";
import Profile from "../src/app/(connected)/profile";
import Multiplayer from "../src/app/(connected)/multiplayer";
import Solo from "../src/app/(connected)/solo";
import { Username } from "../src/components/ui";
import { soloFixture, SESSION_ID, START_KEY } from "./solo-fixtures";
import { soloStorageKey } from "../src/solo/controller";
import multiplayerStates from "./multiplayer/states.json";
import parityStates from "./parity/states.json";
import { SoloSettingsPanel } from "../src/solo/settings-panel";
import { clonePlayerPreferences, withGameSpeed, PLAYER_PREFERENCES_STORAGE_KEY } from "@/lib/preferences/playerPreferences";
let mockSoloMemory = new Map<string, string>();
let mockSoloWire = soloFixture();
let mockSoloRequests = jest.fn();
jest.mock("@/solo/environment", () => ({ soloEnvironment: {
  uuid: () => jest.requireActual("./solo-fixtures").START_KEY,
  storage: { getItem: async (key: string) => mockSoloMemory.get(key) ?? null, setItem: async (key: string, value: string) => { mockSoloMemory.set(key, value); } },
  fetcher: (...args: unknown[]) => mockSoloRequests(...args),
} }));

let mockClient: SupabaseClient | null;
jest.mock("@/lib/supabase", () => ({ get supabase() { return mockClient; } }));
// Router's Reanimated fallback can return an empty module without a JSI runtime.
// These navigator/session tests only need its host view, not the JSI runtime.
// The browser suite runs real Reanimated and checks press/reduced-motion states.
jest.mock("react-native-reanimated", () => {
  const builder = { duration() { return this; }, delay() { return this; } };
  return { __esModule: true, default: { View: jest.requireActual("react-native").View }, FadeIn: builder, FadeInDown: builder, cubicBezier: () => "ease-out" };
});
jest.mock("react-native-reanimated/mock", () => {
  const builder = { duration() { return this; }, delay() { return this; } };
  return { __esModule: true, default: { View: jest.requireActual("react-native").View }, FadeIn: builder, FadeInDown: builder, cubicBezier: () => "ease-out" };
});
// These lifecycle tests have no SwiftUI/AVFoundation host. Browser geometry uses
// the actual Expo UI and Reanimated web implementations; gameplay uses the real engine separately.
jest.mock("@expo/ui", () => {
  const React = jest.requireActual("react"), Native = jest.requireActual("react-native");
  const Picker = ({ children }: { children: React.ReactNode }) => React.createElement(Native.View, null, children);
  Picker.Item = function PickerItem({ label }: { label: string }) { return React.createElement(Native.Text, null, label); };
  return { Host: Native.View, Picker, Slider: Native.View, Switch: ({ label, ...props }: { label: string }) => React.createElement(Native.Switch, { ...props, accessibilityLabel: label }) };
});
jest.mock("expo-audio", () => ({ createAudioPlayer: () => ({ volume: 0, play: jest.fn(), pause: jest.fn(), replace: jest.fn(), remove: jest.fn(), addListener: () => ({ remove: jest.fn() }) }) }));

function fixture(initialUser: string | null = "alice") {
  let session = initialUser ? { user: { id: initialUser }, access_token: initialUser } as Session : null;
  let onAuth: (event: AuthChangeEvent, next: Session | null) => void = () => {};
  const unsubscribe = jest.fn();
  const getUser = jest.fn(async (token: string) => ({ data: { user: { id: token } }, error: null as Error | null }));
  const profile = jest.fn(async () => ({ data: { username: session?.user.id === "bob" ? "Bob KFFR" : "Alice KFFR" }, error: null as Error | null }));
  const signOut = jest.fn(async () => {
    session = null;
    onAuth("SIGNED_OUT", null);
    return { error: null as Error | null };
  });
  const emit = (id: string | null, event: AuthChangeEvent = id ? "SIGNED_IN" : "SIGNED_OUT") => {
    session = id ? { user: { id }, access_token: id } as Session : null;
    onAuth(event, session);
  };
  const client = {
    auth: {
      getSession: jest.fn(async () => ({ data: { session }, error: null })),
      getUser,
      onAuthStateChange: jest.fn((callback: typeof onAuth) => {
        onAuth = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
      startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(), signOut,
      signInWithPassword: jest.fn(async () => { emit("alice"); return { error: null }; }),
    },
    from: jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: profile }) }) })),
  };
  mockClient = client as unknown as SupabaseClient;
  return { client, emit, unsubscribe, getUser, profile, signOut };
}

let lifecycle: (state: AppStateStatus) => void;
let removeListener: ReturnType<typeof jest.fn>;
beforeEach(() => {
  mockSoloMemory = new Map(); mockSoloWire = soloFixture();
  mockSoloRequests = jest.fn(async (_url, init) => {
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      mockSoloWire.version++;
      if (body.intent?.type === "bid" || body.intent?.type === "pass") mockSoloWire = soloFixture("playing", mockSoloWire.version);
      if (body.intent?.type === "play-card") {
        mockSoloWire.state.hand = mockSoloWire.state.hand.filter((c) => c.rank !== body.intent.card.rank || c.suit !== body.intent.card.suit);
        mockSoloWire.state.currentTrick.cards.push({ playerId: 0, card: body.intent.card });
      }
      mockSoloWire.state.handCounts[0] = mockSoloWire.state.hand.length;
    }
    return { ok: true, text: async () => JSON.stringify({ data: mockSoloWire }) };
  });
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  Dimensions.set({ window: { width: 844, height: 390, scale: 1, fontScale: 1 }, screen: { width: 844, height: 390, scale: 1, fontScale: 1 } });
  const listeners = new Set<(state: AppStateStatus) => void>();
  lifecycle = (state) => listeners.forEach((callback) => callback(state));
  removeListener = jest.fn();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => {
    listeners.add(callback);
    return { remove: () => { listeners.delete(callback); removeListener(); } };
  });
});
afterEach(() => { rendered?.unmount(); cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });
const routes = { _layout: RootLayout, login: Login, "(connected)/_layout": ConnectedLayout, "(connected)/index": Home, "(connected)/profile": Profile, "(connected)/solo": Solo, "(connected)/multiplayer": Multiplayer };
async function flush() { await act(async () => { await jest.advanceTimersByTimeAsync(50); }); }
let rendered: ReturnType<typeof renderRouter>;
async function open(url = "/") { rendered = renderRouter(routes, { initialUrl: url }); await flush(); return rendered; }
async function openProfile() { fireEvent.press(screen.getByRole("link", { name: "Voir mon profil" })); await flush(); }

describe("native navigation with the shared account controller", () => {
  test.each(["success", "requiresSync", "conflict", "wrong-ack", "http-error", "background"])("native seat touch confirms the actual player or a visible refusal: %s", async (scenario) => {
    jest.useFakeTimers();
    jest.spyOn(console, "debug").mockImplementation(() => {});
    const f = fixture();
    let wire = { ...structuredClone(multiplayerStates["lobby-free"][0]), viewerSeatIndex: null as number | null, isHost: false };
    let status!: (value: string) => void, holdRead = false, reads = 0;
    let releaseRead!: () => void, releasePost!: () => void;
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    let postGate = new Promise<void>((resolve) => { releasePost = resolve; });
    const posts: { expectedVersion: number; intent: { type: string; seatIndex: number } }[] = [];
    const channel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn() };
    channel.subscribe.mockImplementation((callback) => { status = callback; return channel; });
    Object.assign(f.client, { channel: jest.fn(() => channel), removeChannel: jest.fn(async () => {}) });
    mockSoloMemory.set("kffr.native.multiplayer.room.v1:alice", wire.room.id);
    mockSoloRequests = jest.fn(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.includes("/api/social/")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { invitations: [], counts: { receivedPending: 0, sentPending: 0 } } }) };
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.intent?.type === "join-seat") {
        posts.push(body); await postGate;
        if (posts.length === 1 && ["conflict", "http-error"].includes(scenario)) return { ok: false, status: scenario === "conflict" ? 409 : 503, text: async () => JSON.stringify({ error: "Place refusée. Réessaie explicitement.", code: "version_conflict" }) };
        if (posts.length === 1 && scenario === "wrong-ack") return { ok: true, status: 200, text: async () => JSON.stringify({ data: { ...wire, room: { ...wire.room, state_version: wire.room.state_version + 1 } } }) };
        const seat = body.intent.seatIndex;
        wire = { ...wire, viewerSeatIndex: seat, room: { ...wire.room, state_version: wire.room.state_version + 1 }, players: wire.players.map((p) => p.seat_index === seat ? { ...p, kind: "human", display_name: "Alice", is_connected: true } : p) };
      } else { reads++; if (holdRead) await readGate; }
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: wire }) };
    });
    await open(); fireEvent.press(screen.getByRole("button", { name: "Multijoueur" })); await flush(); await flush();
    fireEvent.press(screen.getByRole("button", { name: "Rouvrir la dernière table de cet appareil" })); await flush(); await flush();
    const seat = () => screen.getByTestId("lobby-seat-2");
    expect(seat()).toBeEnabled();
    if (scenario === "requiresSync") { holdRead = true; act(() => status("CHANNEL_ERROR")); await flush(); }
    fireEvent.press(seat()); fireEvent.press(seat()); await flush();
    if (scenario === "requiresSync") {
      expect(screen.getByText("Actualisation…")).toBeVisible(); expect(screen.queryByText("Réservation…")).toBeNull(); expect(posts).toHaveLength(0);
      holdRead = false; releaseRead(); await flush();
    }
    expect(posts).toHaveLength(1); expect(screen.getByText("Réservation…")).toBeVisible();
    expect(wire.viewerSeatIndex).toBeNull();
    if (scenario === "background") { act(() => lifecycle("background")); await flush(); expect(screen.queryByTestId("multiplayer-lobby")).toBeNull(); }
    releasePost(); await flush(); await flush();
    if (scenario === "background") { act(() => lifecycle("active")); await flush(); await flush(); }
    if (["conflict", "wrong-ack", "http-error"].includes(scenario)) {
      expect(screen.getByRole("alert")).toBeVisible(); expect(wire.viewerSeatIndex).toBeNull(); expect(posts).toHaveLength(1);
      expect(screen.queryByText("Alice · Moi")).toBeNull();
      // A later background read must not silently dismiss the refusal.
      act(() => status("SUBSCRIBED")); await flush(); await flush(); expect(screen.getByRole("alert")).toBeVisible(); expect(posts).toHaveLength(1);
      postGate = Promise.resolve(); fireEvent.press(seat()); await flush(); await flush();
      expect(posts).toHaveLength(2);
    }
    expect(wire.viewerSeatIndex).toBe(2);
    expect(screen.getByText("Alice · Moi")).toBeVisible(); expect(screen.queryByText("Réservation…")).toBeNull();
    expect(posts.filter((p) => p.intent.type === "join-seat")).toHaveLength(["conflict", "wrong-ack", "http-error"].includes(scenario) ? 2 : 1);
    expect(reads).toBeGreaterThan(0);
  });

  test("native invitations resolve a real room, accept only after taking a place, and clear the room on account change", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const inviteId = "15100000-0000-4000-8000-000000000015";
    let wire = { ...structuredClone(multiplayerStates["lobby-free"][0]), viewerSeatIndex: null as number | null, isHost: false };
    const channel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() };
    Object.assign(f.client, { channel: jest.fn(() => channel), removeChannel: jest.fn(async () => {}) });
    let accepted = 0;
    mockSoloRequests = jest.fn(async (url, init) => {
      const path = new URL(String(url)).pathname;
      let data: unknown = wire;
      if (path.endsWith("/api/social/invitations")) data = { invitations: [{ id: inviteId, roomId: wire.room.id, roomCode: wire.room.code, inviterId: "friend", inviteeId: "alice", otherUsername: "Mon ami", status: "pending", createdAt: "2026-10-20T12:00:00Z", expiresAt: "2099-01-01T00:00:00Z", resolvedAt: null }], counts: { receivedPending: 1, sentPending: 0 } };
      if (path.endsWith("/resolve")) data = { state: "joinable", roomId: wire.room.id };
      if (path.endsWith("/accept")) { accepted++; data = { status: "accepted" }; }
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.intent?.type === "join-seat") {
        const seat = body.intent.seatIndex;
        wire = { ...wire, viewerSeatIndex: seat, room: { ...wire.room, state_version: wire.room.state_version + 1 }, players: wire.players.map((p) => p.seat_index === seat ? { ...p, kind: "human", display_name: "Alice", is_connected: true } : p) }; data = wire;
      }
      return { ok: true, text: async () => JSON.stringify({ data }) };
    });
    await open(); fireEvent.press(screen.getByRole("button", { name: "Multijoueur" })); await flush(); await flush();
    fireEvent.press(screen.getByRole("button", { name: "Invitations (1)" })); await flush();
    fireEvent.press(screen.getByRole("button", { name: "Rejoindre Mon ami" })); await flush();
    expect(screen.getByTestId("multiplayer-lobby")).toBeVisible(); expect(accepted).toBe(0);
    fireEvent.press(screen.getByRole("button", { name: "Place 3 : libre, s'asseoir" })); await flush(); await flush();
    expect(accepted).toBe(1);
    act(() => f.emit("bob")); await flush(); expect(screen.queryByTestId("multiplayer-lobby")).toBeNull();
    expect(rendered.getPathname()).toBe("/");
  });

  test("Multiplayer creates a real transport room, serializes ready, resyncs after background and cleans subscriptions on exit", async () => {
    jest.useFakeTimers();
    const f = fixture();
    let wire = structuredClone(multiplayerStates["lobby-free"][0]);
    const callbacks: (() => void)[] = [];
    const on = jest.fn().mockReturnThis();
    const channel = { on, subscribe: jest.fn() };
    channel.subscribe.mockImplementation((status) => { status("SUBSCRIBED"); return channel; });
    const subscribe = jest.fn(() => channel), removeChannel = jest.fn(async () => {});
    Object.assign(f.client, { channel: subscribe, removeChannel });
    on.mockImplementation((_event, _filter, callback) => { callbacks.push(callback); return channel; });
    mockSoloRequests = jest.fn(async (url, init) => {
      if (String(url).includes("/api/social/")) return { ok: true, text: async () => JSON.stringify({ data: { invitations: [], counts: { receivedPending: 0, sentPending: 0 } } }) };
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.intent?.type === "set-ready") {
        wire = { ...wire, room: { ...wire.room, state_version: wire.room.state_version + 1 }, players: wire.players.map((p) => p.seat_index === 0 ? { ...p, is_ready: body.intent.ready } : p) };
      }
      return { ok: true, text: async () => JSON.stringify({ data: wire }) };
    });
    await open(); fireEvent.press(screen.getByRole("button", { name: "Multijoueur" })); await flush();
    expect(screen.getByRole("button", { name: "Créer la table" })).toBeVisible();
    fireEvent.press(screen.getByRole("button", { name: "Créer la table" })); await flush(); await flush();
    expect(screen.getByTestId("multiplayer-lobby")).toBeVisible(); expect(subscribe).toHaveBeenCalledTimes(1);
    const ready = screen.getByRole("button", { name: "Prêt" }); fireEvent.press(ready); fireEvent.press(ready); await flush();
    expect(mockSoloRequests.mock.calls.filter(([, init]) => init?.body && JSON.parse(init.body).intent?.type === "set-ready")).toHaveLength(1);
    const reads = mockSoloRequests.mock.calls.length; act(() => { callbacks[0](); callbacks[1](); }); await flush();
    expect(mockSoloRequests.mock.calls.length).toBe(reads + 1);
    act(() => lifecycle("background")); await flush(); expect(screen.queryByTestId("multiplayer-lobby")).toBeNull();
    act(() => lifecycle("active")); await flush(); await flush();
    expect(screen.getByTestId("multiplayer-lobby")).toBeVisible(); expect(removeChannel).toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Revenir aux salons" })); await flush();
    expect(screen.queryByTestId("multiplayer-lobby")).toBeNull();
    expect(removeChannel.mock.calls.length).toBe(subscribe.mock.calls.length);
  });

  test("a pseudo measured in a narrow window returns inline when landscape has room again", async () => {
    const f = fixture();
    const username = "Alice de la Contrée";
    f.profile.mockResolvedValue({ data: { username }, error: null });
    await open(); await openProfile();
    const identityReads = f.client.auth.getUser.mock.calls.length;
    const container = () => screen.UNSAFE_getByType(Username).findAllByType(View)[0];
    const layout = (width: number) => fireEvent(container(), "layout", { nativeEvent: { layout: { width } } });
    layout(350);
    layout(140);
    const narrowMeasurement = screen.getByLabelText("Pseudo KFFR : " + username).props.onTextLayout;
    act(() => narrowMeasurement({ nativeEvent: { lines: [{}, {}, {}] } }));
    expect(screen.getByRole("button", { name: "Voir mon pseudo" })).toBeVisible();
    layout(350);
    expect(screen.getByLabelText("Pseudo KFFR : " + username)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Voir mon pseudo" })).toBeNull();
    act(() => narrowMeasurement({ nativeEvent: { lines: [{}, {}, {}] } }));
    expect(screen.getByLabelText("Pseudo KFFR : " + username)).toBeVisible();
    expect(f.client.auth.getUser).toHaveBeenCalledTimes(identityReads);
  });

  test("refused orientation lock shows the rotation fallback without resetting the verified profile", async () => {
    const f = fixture();
    jest.spyOn(Orientation, "supportsOrientationLockAsync").mockResolvedValue(true);
    jest.spyOn(Orientation, "lockAsync").mockRejectedValue(new Error("iOS refuses orientation"));
    await open(); await openProfile();
    expect(Orientation.lockAsync).toHaveBeenCalledWith(Orientation.OrientationLock.LANDSCAPE);
    act(() => Dimensions.set({ window: { width: 390, height: 844, scale: 1, fontScale: 1 } }));
    await flush();
    expect(screen.getByTestId("rotation-notice")).toBeVisible();
    expect(screen.queryByLabelText("Pseudo KFFR : Alice KFFR")).toBeNull();
    expect(rendered.getPathname()).toBe("/profile");
    act(() => Dimensions.set({ window: { width: 844, height: 390, scale: 1, fontScale: 1 } }));
    await flush();
    expect(screen.getByLabelText("Pseudo KFFR : Alice KFFR")).toBeVisible();
    expect(f.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  test("principal screens never scroll, while keyboard entry scrolls in its separate modal", async () => {
    const f = fixture();
    await open();
    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    await openProfile();
    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    act(() => f.emit(null)); await flush();
    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    fireEvent.press(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByTestId("secondary-scroll")).toBeVisible();
    fireEvent.changeText(screen.getByLabelText("Mot de passe"), "test-only");
    fireEvent.press(screen.getByRole("button", { name: "Fermer" }));
    fireEvent.press(screen.getByRole("button", { name: "Se connecter" }));
    await flush();
    expect(screen.getByLabelText("Mot de passe").props.value).toBe("");
  });

  test("a full long pseudo remains readable in a modal and is hidden on session loss", async () => {
    const f = fixture();
    const username = "Un très long pseudo KFFR sans troncature";
    f.profile.mockResolvedValue({ data: { username }, error: null });
    await open(); await openProfile();
    fireEvent.press(screen.getByRole("button", { name: "Voir mon pseudo" }));
    expect(screen.getByLabelText("Pseudo KFFR : " + username)).toBeVisible();
    act(() => f.emit(null)); await flush();
    expect(screen.queryByText(username)).toBeNull();
    expect(rendered.getPathname()).toBe("/login");
  });
  test("blocks anonymous profile links, then signs in through the native form", async () => {
    const f = fixture(null);
    await open("/profile");
    expect(rendered.getPathname()).toBe("/login");
    expect(screen.queryByText("Mon profil")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Se connecter" }));
    fireEvent.changeText(screen.getByLabelText("Adresse email"), "alice@example.test");
    fireEvent.changeText(screen.getByLabelText("Mot de passe"), "test-only-password");
    fireEvent.press(screen.getByRole("button", { name: "Se connecter" }));
    await flush();
    expect(f.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "alice@example.test", password: "test-only-password" });
    expect(rendered.getPathname()).toBe("/");
    await openProfile();
    expect(screen.getByLabelText("Pseudo KFFR : Alice KFFR")).toBeVisible();
  });

  test("restores the account, disables future modes, navigates back without new auth listeners", async () => {
    const f = fixture();
    const app = await open();
    expect(screen.queryByLabelText("Onglet Accueil")).toBeNull();
    expect(screen.queryByLabelText("Onglet Profil")).toBeNull();
    expect(screen.getByLabelText("KFFR Contrée")).toBeVisible();
    expect(screen.queryByText("LE CLUB KFFR")).toBeNull();
    expect(screen.queryByText("La contrée")).toBeNull();
    expect(screen.getByRole("button", { name: "Solo" })).toBeEnabled();
    expect(mockSoloRequests).not.toHaveBeenCalled();
    for (const title of ["Entraînement"]) {
      const mode = screen.getByRole("button", { name: title + ". Bientôt disponible sur iPhone." });
      expect(mode).toBeDisabled();
      fireEvent.press(mode);
      expect(rendered.getPathname()).toBe("/");
    }
    fireEvent.press(screen.getByRole("link", { name: "Voir mon profil" }));
    await flush();
    expect(rendered.getPathname()).toBe("/profile");
    expect(screen.queryByTestId("game-navigation")).toBeNull();
    fireEvent.press(screen.getByRole("link", { name: "Retour à l’accueil" }));
    await flush();
    expect(rendered.getPathname()).toBe("/");
    await openProfile();
    expect(screen.queryByLabelText("Onglet Accueil")).toBeNull();
    expect(screen.queryByLabelText("Onglet Profil")).toBeNull();
    fireEvent.press(screen.getByRole("link", { name: "Retour à l’accueil" }));
    await flush();
    expect(rendered.getPathname()).toBe("/");
    expect(f.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(2);
    expect(f.unsubscribe).not.toHaveBeenCalled();
    app.unmount();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledTimes(2);
  });

  test("preserves Profile across background and offline revalidation, hiding private content until retry succeeds", async () => {
    const f = fixture();
    await open();
    await openProfile();
    act(() => lifecycle("background"));
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    expect(rendered.getPathname()).toBe("/profile");
    act(() => f.emit("alice", "TOKEN_REFRESHED"));
    await flush();
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    expect(rendered.getPathname()).toBe("/profile");
    f.getUser.mockRejectedValueOnce(new Error("offline"));
    act(() => lifecycle("active"));
    await flush();
    expect(screen.getByText("Session à vérifier")).toBeVisible();
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    expect(rendered.getPathname()).toBe("/profile");
    fireEvent.press(screen.getByRole("button", { name: "Réessayer" }));
    await flush();
    expect(screen.getByLabelText("Pseudo KFFR : Alice KFFR")).toBeVisible();
    expect(rendered.getPathname()).toBe("/profile");
    expect(f.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(f.client.auth.stopAutoRefresh).toHaveBeenCalled();
  });

  test("token refresh preserves navigation and verifies identity again", async () => {
    const f = fixture();
    await open(); await openProfile();
    const before = f.getUser.mock.calls.length;
    act(() => f.emit("alice", "TOKEN_REFRESHED"));
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    await flush();
    expect(rendered.getPathname()).toBe("/profile");
    expect(screen.getByLabelText("Pseudo KFFR : Alice KFFR")).toBeVisible();
    expect(f.getUser.mock.calls.length).toBeGreaterThan(before);
  });

  test("expired session removes private history and blocks later profile navigation", async () => {
    const f = fixture();
    await open(); await openProfile();
    act(() => f.emit(null));
    await flush();
    expect(rendered.getPathname()).toBe("/login");
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    act(() => router.push("/profile"));
    await flush();
    expect(rendered.getPathname()).toBe("/login");
    act(() => f.emit("bob")); await flush();
    await openProfile();
    expect(screen.getByLabelText("Pseudo KFFR : Bob KFFR")).toBeVisible();
    expect(screen.queryByText("Alice KFFR")).toBeNull();
  });

  test("direct account changes reset the tab navigator and never display the old pseudo", async () => {
    const f = fixture();
    await open(); await openProfile();
    act(() => f.emit("bob"));
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    await flush();
    expect(rendered.getPathname()).toBe("/");
    await openProfile();
    expect(screen.getByLabelText("Pseudo KFFR : Bob KFFR")).toBeVisible();
    expect(f.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  test("failed logout immediately hides the profile and permits retry before returning to login", async () => {
    const f = fixture();
    await open(); await openProfile();
    f.signOut.mockResolvedValueOnce({ error: new Error("offline") });
    fireEvent.press(screen.getByRole("button", { name: "Se déconnecter" }));
    await flush();
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    expect(screen.getByText("Déconnexion à terminer")).toBeVisible();
    expect(rendered.getPathname()).toBe("/login");
    fireEvent.press(screen.getByRole("button", { name: "Déconnecter cet appareil" }));
    await flush();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeVisible();
    expect(f.signOut).toHaveBeenLastCalledWith({ scope: "local" });
    act(() => router.push("/profile")); await flush();
    expect(rendered.getPathname()).toBe("/login");
  });

  test("profile read failures show no invented username and refresh the same screen", async () => {
    const f = fixture();
    f.profile.mockResolvedValue({ data: { username: "" }, error: new Error("network") });
    await open(); await openProfile();
    expect(screen.getByText("Pseudo indisponible")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger ton pseudo. Réessaie.");
    f.profile.mockResolvedValue({ data: { username: "Alice KFFR" }, error: null });
    fireEvent.press(screen.getByRole("button", { name: "Actualiser le profil" }));
    await flush();
    expect(rendered.getPathname()).toBe("/profile");
    expect(screen.getByLabelText("Pseudo KFFR : Alice KFFR")).toBeVisible();
  });

  test("missing public configuration never exposes a login form or private profile", async () => {
    mockClient = null;
    await open("/profile");
    expect(screen.getByText("Connexion indisponible")).toBeVisible();
    expect(screen.queryByLabelText("Mot de passe")).toBeNull();
    expect(screen.queryByText("Mon profil")).toBeNull();
  });

  test("a delayed profile response cannot restore private content after logout", async () => {
    const f = fixture();
    await open(); await openProfile();
    let finish!: (result: { data: { username: string }; error: null }) => void;
    f.profile.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.press(screen.getByRole("button", { name: "Actualiser le profil" }));
    await flush();
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Déconnecter cet appareil" }));
    await flush();
    await act(async () => { finish({ data: { username: "STALE PRIVATE PROFILE" }, error: null }); });
    await flush();
    expect(rendered.getPathname()).toBe("/login");
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeVisible();
    expect(screen.queryByText("STALE PRIVATE PROFILE")).toBeNull();
  });

  test("Solo enters without creation, explicitly starts, bids, plays, returns and resumes without a POST", async () => {
    fixture(); await open();
    fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    expect(rendered.getPathname()).toBe("/solo"); expect(mockSoloRequests).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Nouvelle partie" })); await flush();
    expect(mockSoloRequests).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("solo-card-table")).toBeVisible();
    expect(screen.getByLabelText(/Hugo, Nord, partenaire/)).toBeVisible();
    expect(screen.getByLabelText(/Léa, Est, adversaire/)).toBeVisible();
    expect(screen.getByLabelText(/Emma, Ouest, adversaire/)).toBeVisible();
    expect(JSON.parse(mockSoloRequests.mock.calls[0][1].body).startKey).toBe(START_KEY);
    fireEvent.press(screen.getByRole("button", { name: "Valeur 100" }));
    fireEvent.press(screen.getByRole("button", { name: "Annoncer" })); await flush();
    expect(JSON.parse(mockSoloRequests.mock.calls[1][1].body).intent).toMatchObject({ type: "bid", playerId: 0, value: 100 });
    const playable = screen.getAllByRole("button", { name: /^Jouer / }).find((button) => !button.props.accessibilityState.disabled)!;
    fireEvent.press(playable); await flush();
    expect(mockSoloWire.state.hand).toHaveLength(7);
    expect(screen.getByTestId("solo-play-0")).toBeVisible();
    fireEvent.press(screen.getByRole("button", { name: "Menu Partie" }));
    // A raw whitespace child renders on web but causes an actual iOS native
    // "Text strings must be rendered within a <Text>" error in the menu.
    for (const scroll of screen.UNSAFE_getAllByType(ScrollView)) {
      expect(Children.toArray(scroll.props.children).filter((child) => typeof child === "string")).toEqual([]);
    }
    fireEvent.press(screen.getByRole("button", { name: "Fermer" }));
    expect(mockSoloRequests.mock.calls[2][0]).toContain(SESSION_ID);
    fireEvent.press(screen.getByRole("button", { name: "Quitter la table et revenir à l’accueil" }));
    fireEvent.press(screen.getByRole("button", { name: "Revenir à l’accueil" })); await flush();
    const before = mockSoloRequests.mock.calls.length;
    fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    expect(screen.getByTestId("solo-card-table")).toBeVisible();
    expect(mockSoloRequests.mock.calls.slice(before).every((call) => call[1].method === "GET")).toBe(true);
    expect(screen.queryByTestId("game-navigation")).toBeNull();
  });

  test("Solo data disappears on account change and does not create for the replacement account", async () => {
    const f = fixture(); await open();
    fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    fireEvent.press(screen.getByRole("button", { name: "Nouvelle partie" })); await flush();
    act(() => f.emit("bob")); await flush();
    expect(rendered.getPathname()).toBe("/"); expect(screen.queryByTestId("solo-screen")).toBeNull();
    const before = mockSoloRequests.mock.calls.length;
    fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    expect(screen.getByRole("button", { name: "Nouvelle partie" })).toBeVisible();
    expect(mockSoloRequests.mock.calls.length).toBe(before);
  });

  test("Solo schedules one server bot at a time and stops sending intents when returning home", async () => {
    fixture(); mockSoloWire = soloFixture("playing"); mockSoloWire.state.currentPlayerId = 1;
    mockSoloMemory.set(soloStorageKey("alice"), JSON.stringify({ sessionId: SESSION_ID, startKey: null }));
    mockSoloRequests.mockImplementation(async (_url, init) => {
      if (init.method === "POST") {
        expect(JSON.parse(init.body).intent).toEqual({ type: "advance-bot" });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        mockSoloWire.version++; mockSoloWire.state.currentPlayerId = (mockSoloWire.state.currentPlayerId + 1) % 4;
      }
      return { ok: true, text: async () => JSON.stringify({ data: mockSoloWire }) };
    });
    await open(); fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    expect(screen.getByLabelText(/Léa, Est, adversaire, à son tour/)).toBeVisible();
    expect(mockSoloRequests.mock.calls.filter((call) => call[1].method === "POST")).toHaveLength(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    expect(screen.getByLabelText(/Léa, Est, adversaire, à son tour/)).toBeVisible();
    expect(mockSoloRequests.mock.calls.filter((call) => call[1].method === "POST")).toHaveLength(1);
    fireEvent.press(screen.getByRole("button", { name: "Menu Partie" }));
    fireEvent.press(screen.getByRole("button", { name: "Paramètres" }));
    const settings = screen.UNSAFE_getByType(SoloSettingsPanel).props;
    act(() => settings.onChange({ ...settings.preferences, visual: { ...settings.preferences.visual, tableTheme: "midnight-blue" } }));
    fireEvent.press(screen.getByRole("button", { name: "Fermer" }));
    // An unrelated visual preference must not restart the 1200ms bot delay.
    await act(async () => { await jest.advanceTimersByTimeAsync(600); }); await flush();
    expect(mockSoloWire.state.currentPlayerId).toBe(2);
    expect(screen.getByLabelText(/Hugo, Nord, partenaire, à son tour/)).toBeVisible();
    fireEvent.press(screen.getByRole("button", { name: "Quitter la table et revenir à l’accueil" }));
    fireEvent.press(screen.getByRole("button", { name: "Revenir à l’accueil" })); await flush();
    const count = mockSoloRequests.mock.calls.length;
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    expect(mockSoloRequests.mock.calls.length).toBe(count);
  });

  test.each(["slow", "normal", "fast", "instant"] as const)("Solo bot latency benchmark %s preserves the chosen delay while HTTP overlaps", async (speed) => {
    fixture(); mockSoloWire = soloFixture("playing"); mockSoloWire.state.currentPlayerId = 1;
    const preferences = withGameSpeed(clonePlayerPreferences(), speed), httpMs = 1000;
    mockSoloMemory.set(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    mockSoloMemory.set(soloStorageKey("alice"), JSON.stringify({ sessionId: SESSION_ID, startKey: null }));
    const starts: number[] = [], accepted: number[] = [];
    jest.spyOn(console, "debug").mockImplementation((label, fields) => {
      if (label === "[Solo wait]" && fields.kind === "bot") starts.push(Date.now() - fields.elapsedMs);
      if (label === "[Solo performance]" && fields.operation === "advance-bot" && fields.phase === "state") accepted.push(Date.now());
    });
    let posts = 0;
    mockSoloRequests.mockImplementation(async (_url, init) => {
      if (init.method === "POST") {
        posts++; expect(JSON.parse(init.body).intent).toEqual({ type: "advance-bot" });
        expect(JSON.parse(init.body).expectedVersion).toBe(mockSoloWire.version);
        await new Promise((resolve) => setTimeout(resolve, httpMs));
        mockSoloWire.version++; mockSoloWire.state.currentPlayerId = (mockSoloWire.state.currentPlayerId + 1) % 4;
      }
      return { ok: true, text: async () => JSON.stringify({ data: mockSoloWire }) };
    });
    await open(); fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    const period = process.env.SOLO_BOT_BASELINE ? preferences.gameplay.botDelayMs + httpMs : Math.max(preferences.gameplay.botDelayMs, httpMs);
    for (let turn = 1; turn <= 3; turn++) {
      await act(async () => { await jest.advanceTimersByTimeAsync(period); }); await flush();
      expect(accepted).toHaveLength(turn);
    }
    expect(posts).toBe(3); expect(starts).toHaveLength(3);
    const spans = accepted.map((time, index) => time - starts[index]);
    expect(spans).toEqual([period, period, period]);
    console.info(JSON.stringify({ botBenchmark: process.env.SOLO_BOT_BASELINE ? "before" : "after", speed, httpMs, spans }));
  });

  test("Solo resumes a bot winner without waiting for a loaded trick that must never replay", async () => {
    fixture(); mockSoloWire = soloFixture("playing"); mockSoloWire.state.currentPlayerId = 1;
    mockSoloWire.state.completedTricks = [{ ...structuredClone(parityStates.trick.state.completedTricks[0]), winnerId: 1 }];
    mockSoloWire.state.currentTrick.cards = [];
    mockSoloMemory.set(soloStorageKey("alice"), JSON.stringify({ sessionId: SESSION_ID, startKey: null }));
    mockSoloRequests.mockImplementation(async (_url, init) => {
      if (init.method === "POST") {
        mockSoloWire.version++; mockSoloWire.state.currentPlayerId = 0;
      }
      return { ok: true, text: async () => JSON.stringify({ data: mockSoloWire }) };
    });
    await open(); fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    expect(screen.queryByTestId("solo-play-0")).toBeNull();
    expect(screen.getByLabelText(/Léa, Est, adversaire, à son tour/)).toBeVisible();
    await act(async () => { await jest.advanceTimersByTimeAsync(1200); }); await flush();
    expect(screen.getByLabelText(/Antonin, Sud, à son tour/)).toBeVisible();
    expect(mockSoloRequests.mock.calls.filter((call) => call[1].method === "POST")).toHaveLength(1);
  });

  test("Solo collection keeps its original deadline while the next human HTTP move is pending", async () => {
    fixture(); mockSoloWire = soloFixture("playing");
    mockSoloMemory.set(soloStorageKey("alice"), JSON.stringify({ sessionId: SESSION_ID, startKey: null }));
    let posts = 0, release!: (value: unknown) => void;
    mockSoloRequests.mockImplementation(async (_url, init) => {
      if (init.method === "POST") {
        posts++;
        if (posts === 2) return new Promise((resolve) => { release = resolve; });
        const card = JSON.parse(init.body).intent.card;
        mockSoloWire.version++;
        mockSoloWire.state.hand = mockSoloWire.state.hand.filter((c) => c.rank !== card.rank || c.suit !== card.suit);
        mockSoloWire.state.handCounts[0] = mockSoloWire.state.hand.length;
        mockSoloWire.state.completedTricks = [structuredClone(parityStates.trick.state.completedTricks[0])];
        mockSoloWire.state.currentTrick.cards = [];
      }
      return { ok: true, text: async () => JSON.stringify({ data: mockSoloWire }) };
    });
    await open(); fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    const play = () => fireEvent.press(screen.getAllByRole("button", { name: /^Jouer / }).find((b) => !b.props.accessibilityState.disabled)!);
    play(); await flush();
    expect(screen.getAllByTestId("solo-trick-area")).toHaveLength(2); // Completed + empty current layer.
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    play(); await flush();
    expect(posts).toBe(2);
    await act(async () => { await jest.advanceTimersByTimeAsync(1350); });
    // 1900ms since the first acknowledgement; the configured slow dwell is 1800.
    expect(screen.getAllByTestId("solo-trick-area")).toHaveLength(1); // Only the empty current layer remains.
    expect(screen.getByRole("button", { name: "Dernier pli" })).toBeVisible();
    await act(async () => { release({ ok: false, status: 400 }); }); await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(/Action refusée/);
  });

  test("Solo hides its hand in background and reloads the saved game after account verification without advancing it", async () => {
    fixture(); mockSoloWire = soloFixture("playing");
    mockSoloMemory.set(soloStorageKey("alice"), JSON.stringify({ sessionId: SESSION_ID, startKey: null }));
    await open(); fireEvent.press(screen.getByRole("button", { name: "Solo" })); await flush();
    expect(screen.getAllByRole("button", { name: /^Jouer / })).toHaveLength(8);
    act(() => lifecycle("background")); await flush();
    expect(screen.queryAllByRole("button", { name: /^Jouer / })).toHaveLength(0);
    act(() => lifecycle("active")); await flush();
    expect(rendered.getPathname()).toBe("/solo");
    expect(screen.getByTestId("solo-card-table")).toBeVisible();
    expect(mockSoloRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockSoloRequests.mock.calls.every((call) => call[1].method === "GET")).toBe(true);
    expect(screen.getAllByRole("button", { name: /^Jouer / })).toHaveLength(8);
  });
});

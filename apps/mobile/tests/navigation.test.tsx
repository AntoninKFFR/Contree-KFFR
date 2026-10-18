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
import { Username } from "../src/components/ui";

let mockClient: SupabaseClient | null;
jest.mock("@/lib/supabase", () => ({ get supabase() { return mockClient; } }));

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
const routes = { _layout: RootLayout, login: Login, "(connected)/_layout": ConnectedLayout, "(connected)/index": Home, "(connected)/profile": Profile };
async function flush() { await act(async () => { await jest.advanceTimersByTimeAsync(50); }); }
let rendered: ReturnType<typeof renderRouter>;
async function open(url = "/") { rendered = renderRouter(routes, { initialUrl: url }); await flush(); return rendered; }
async function profileTab() { fireEvent.press(screen.getByLabelText("Onglet Profil")); await flush(); }

describe("native navigation with the shared account controller", () => {
  test("a pseudo measured in a narrow window returns inline when landscape has room again", async () => {
    const f = fixture();
    const username = "Alice de la Contrée";
    f.profile.mockResolvedValue({ data: { username }, error: null });
    await open(); await profileTab();
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
    await open(); await profileTab();
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
    await profileTab();
    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    act(() => f.emit(null)); await flush();
    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
    fireEvent.press(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByTestId("secondary-scroll")).toBeVisible();
    fireEvent.changeText(screen.getByLabelText("Mot de passe"), "test-only");
    fireEvent.press(screen.getByRole("button", { name: "Fermer" }));
    fireEvent.press(screen.getByRole("button", { name: "Se connecter" }));
    expect(screen.getByLabelText("Mot de passe").props.value).toBe("");
  });

  test("a full long pseudo remains readable in a modal and is hidden on session loss", async () => {
    const f = fixture();
    const username = "Un très long pseudo KFFR sans troncature";
    f.profile.mockResolvedValue({ data: { username }, error: null });
    await open(); await profileTab();
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
    await profileTab();
    expect(screen.getByLabelText("Pseudo KFFR : Alice KFFR")).toBeVisible();
  });

  test("restores the account, disables future modes, navigates back without new auth listeners", async () => {
    const f = fixture();
    const app = await open();
    for (const title of ["Jouer en solo", "Multijoueur", "Entraînement"]) {
      const mode = screen.getByRole("button", { name: title + ". Bientôt disponible sur iPhone." });
      expect(mode).toBeDisabled();
      fireEvent.press(mode);
      expect(rendered.getPathname()).toBe("/");
    }
    fireEvent.press(screen.getByRole("link", { name: "Voir mon profil" }));
    await flush();
    expect(rendered.getPathname()).toBe("/profile");
    fireEvent.press(screen.getByRole("link", { name: "Retour à l’accueil" }));
    await flush();
    expect(rendered.getPathname()).toBe("/");
    await profileTab();
    fireEvent.press(screen.getByLabelText("Onglet Accueil"));
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
    await profileTab();
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
    await open(); await profileTab();
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
    await open(); await profileTab();
    act(() => f.emit(null));
    await flush();
    expect(rendered.getPathname()).toBe("/login");
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    act(() => router.push("/profile"));
    await flush();
    expect(rendered.getPathname()).toBe("/login");
    act(() => f.emit("bob")); await flush();
    await profileTab();
    expect(screen.getByLabelText("Pseudo KFFR : Bob KFFR")).toBeVisible();
    expect(screen.queryByText("Alice KFFR")).toBeNull();
  });

  test("direct account changes reset the tab navigator and never display the old pseudo", async () => {
    const f = fixture();
    await open(); await profileTab();
    act(() => f.emit("bob"));
    expect(screen.queryByText("Alice KFFR")).toBeNull();
    await flush();
    expect(rendered.getPathname()).toBe("/");
    await profileTab();
    expect(screen.getByLabelText("Pseudo KFFR : Bob KFFR")).toBeVisible();
    expect(f.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  test("failed logout immediately hides the profile and permits retry before returning to login", async () => {
    const f = fixture();
    await open(); await profileTab();
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
    await open(); await profileTab();
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
    await open(); await profileTab();
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
});

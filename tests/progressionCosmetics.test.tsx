// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  getMyProfileCosmetics,
  PROFILE_COSMETICS_CHANGED_EVENT,
  setMyProfileCosmetic,
} from "@/lib/profileCosmetics";
import { ProfileCollection } from "@/components/profile/ProfileCollection";
import { cosmeticsFixture, withEquipment } from "./helpers/profileCosmetics";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), rpc: vi.fn() }));
vi.mock("@/components/progression/ProgressionProvider", () => ({
  useProgression: mocks.hook,
}));
vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  mocks.hook.mockReturnValue({
    status: "ready",
    userId: "a",
    cosmeticsSnapshot: cosmeticsFixture(5),
    cosmeticsError: false,
  });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("validates complete canonical collection and strips unrelated fields", async () => {
  const fixture = withEquipment();
  const rpc = vi
    .fn()
    .mockResolvedValue({
      data: { ...fixture, user_id: "secret" },
      error: null,
    });
  expect(await getMyProfileCosmetics({ rpc } as never)).toEqual(fixture);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_profile_cosmetics");
});
it.each([
  "version",
  "missing",
  "duplicate",
  "unknown",
  "slot",
  "variant",
  "level",
  "unlock",
  "equipped",
  "equippedSlot",
  "date",
])("rejects malformed collection: %s", async (kind) => {
  const data = cosmeticsFixture(40);
  if (kind === "version") data.catalogVersion = 0;
  if (kind === "missing") data.items.pop();
  if (kind === "duplicate") data.items[1] = data.items[0];
  if (kind === "unknown") Object.assign(data.items[0], { key: "injected" });
  if (kind === "slot") Object.assign(data.items[0], { slot: "nameplate" });
  if (kind === "variant")
    Object.assign(data.items[0], { visualVariant: "bg-red-500" });
  if (kind === "level") data.items[0].unlockLevel = 1.5;
  if (kind === "unlock") Object.assign(data.items[0], { unlocked: "true" });
  if (kind === "equipped") data.items[0].equipped = true;
  if (kind === "equippedSlot") data.equipped.badge = "title_taker";
  if (kind === "date") data.items[0].unlockedAt = "invalid";
  await expect(
    getMyProfileCosmetics({
      rpc: vi.fn().mockResolvedValue({ data, error: null }),
    } as never),
  ).rejects.toThrow("Invalid profile collection");
});
it("groups 10/8/6 previews and exposes locked/unlocked states and keyboard tabs", () => {
  render(<ProfileCollection />);
  expect(
    screen.getByRole("list", { name: "Titres" }).querySelectorAll("li"),
  ).toHaveLength(10);
  expect(screen.getAllByText("Verrouillé", { exact: true })).toHaveLength(8);
  expect(
    screen.queryByRole("button", { name: "Équiper Légende KFFR" }),
  ).toBeNull();
  const titles = screen.getByRole("tab", { name: "Titres" });
  fireEvent.keyDown(titles, { key: "ArrowRight" });
  expect(
    screen.getByRole("list", { name: "Badges" }).querySelectorAll("li"),
  ).toHaveLength(8);
  fireEvent.click(screen.getByRole("tab", { name: "Cadres" }));
  expect(
    screen.getByRole("list", { name: "Cadres" }).querySelectorAll("li"),
  ).toHaveLength(6);
  expect(screen.getByRole("button", { name: "Équiper Or fin" })).toBeTruthy();
});
it("mutation has a pending state, no optimistic permission, human error, and event only on success", async () => {
  let resolve!: (value: unknown) => void;
  mocks.rpc.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const listener = vi.fn();
  window.addEventListener(PROFILE_COSMETICS_CHANGED_EVENT, listener);
  try {
    render(<ProfileCollection />);
    const button = screen.getByRole("button", { name: "Équiper Preneur" });
    fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Enregistrement…")).toBeTruthy();
    await act(async () => resolve({ error: { message: "private" } }));
    expect(screen.getByRole("alert").textContent).not.toContain("private");
    expect(listener).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenLastCalledWith("set_my_profile_cosmetic", {
      p_slot: "title",
      p_cosmetic_key: "title_taker",
    });
    expect(screen.queryByText("✓ Équipé")).toBeNull();
  } finally {
    window.removeEventListener(PROFILE_COSMETICS_CHANGED_EVENT, listener);
  }
});
it("equipped item exposes Remove and passes null for its slot", async () => {
  mocks.hook.mockReturnValue({
    ...mocks.hook(),
    cosmeticsSnapshot: withEquipment(),
  });
  render(<ProfileCollection />);
  fireEvent.click(screen.getByRole("button", { name: "Retirer Preneur" }));
  await waitFor(() =>
    expect(mocks.rpc).toHaveBeenCalledWith("set_my_profile_cosmetic", {
      p_slot: "title",
      p_cosmetic_key: null,
    }),
  );
});
it("collection failure stays isolated and controlled", () => {
  mocks.hook.mockReturnValue({
    ...mocks.hook(),
    cosmeticsError: true,
    cosmeticsSnapshot: null,
  });
  render(<ProfileCollection />);
  expect(
    screen.getByText("La collection est momentanément indisponible."),
  ).toBeTruthy();
});
it("failed equip RPC emits no equipment signal", async () => {
  const listener = vi.fn();
  window.addEventListener(PROFILE_COSMETICS_CHANGED_EVENT, listener);
  try {
    await expect(
      setMyProfileCosmetic(
        {
          rpc: vi.fn().mockResolvedValue({ error: new Error("denied") }),
        } as never,
        "title",
        "title_taker",
      ),
    ).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener(PROFILE_COSMETICS_CHANGED_EVENT, listener);
  }
});

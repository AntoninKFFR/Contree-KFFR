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
  const rpc = vi.fn().mockResolvedValue({
    data: { ...fixture, user_id: "secret" },
    error: null,
  });
  expect(await getMyProfileCosmetics({ rpc } as never)).toEqual(fixture);
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "get_my_unlocked_profile_cosmetics",
  );
});
it.each([
  "version",
  "oversized",
  "locked",
  "missingEquipped",
  "multipleEquipped",
  "duplicate",
  "unknown",
  "slot",
  "variant",
  "level",
  "unlock",
  "equipped",
  "equippedSlot",
  "date",
  "dateOnly",
])("rejects malformed collection: %s", async (kind) => {
  const data = cosmeticsFixture(40);
  if (kind === "version") data.catalogVersion = 0;
  if (kind === "oversized") data.items.push(data.items[0]);
  if (kind === "locked") data.items[0].unlocked = false;
  if (kind === "missingEquipped") {
    data.equipped.title = "title_taker";
    data.items.shift();
  }
  if (kind === "multipleEquipped") {
    data.items[0].equipped = true;
    data.items[1].equipped = true;
    data.equipped.title = "title_taker";
  }
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
  if (kind === "dateOnly") data.items[0].unlockedAt = "2026-10-01";
  await expect(
    getMyProfileCosmetics({
      rpc: vi.fn().mockResolvedValue({ data, error: null }),
    } as never),
  ).rejects.toThrow("Invalid profile collection");
});
it("shows only owned 2/2/1 items and preserves keyboard tabs", () => {
  render(<ProfileCollection />);
  expect(
    screen.getByRole("list", { name: "Titres" }).querySelectorAll("li"),
  ).toHaveLength(2);
  expect(screen.queryByText("Verrouillé", { exact: true })).toBeNull();
  expect(screen.queryByText("Légende KFFR")).toBeNull();
  expect(screen.queryByText(/requis|24|prochain niveau/i)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Équiper Légende KFFR" }),
  ).toBeNull();
  const titles = screen.getByRole("tab", { name: "Titres" });
  fireEvent.keyDown(titles, { key: "ArrowRight" });
  expect(
    screen.getByRole("list", { name: "Badges" }).querySelectorAll("li"),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole("tab", { name: "Cadres" }));
  expect(
    screen.getByRole("list", { name: "Cadres" }).querySelectorAll("li"),
  ).toHaveLength(1);
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

it.each([1, 2, 5, 20, 40])(
  "accepts a filtered inventory at level %i",
  async (level) => {
    const fixture = cosmeticsFixture(level);
    const rpc = vi.fn().mockResolvedValue({ data: fixture, error: null });
    expect(await getMyProfileCosmetics({ rpc } as never)).toEqual(fixture);
    expect(fixture.items).toHaveLength(
      ({ 1: 0, 2: 1, 5: 5, 20: 16, 40: 24 } as Record<number, number>)[level],
    );
  },
);
it("empty collection keeps accessible tabs and three non-spoiling empty states", () => {
  mocks.hook.mockReturnValue({
    ...mocks.hook(),
    cosmeticsSnapshot: cosmeticsFixture(1),
  });
  const view = render(<ProfileCollection />);
  for (const category of ["Titres", "Badges", "Cadres"]) {
    fireEvent.click(screen.getByRole("tab", { name: category }));
    expect(screen.getByRole("status").textContent).toBe(
      `Continue de progresser pour découvrir de nouveaux ${category.toLowerCase()}.`,
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(view.container.textContent).not.toMatch(
      /Verrouillé|requis|24|[0-9]/,
    );
  }
});
it("level 2 discovers only Preneur and no future names or reward hints", () => {
  mocks.hook.mockReturnValue({
    ...mocks.hook(),
    cosmeticsSnapshot: cosmeticsFixture(2),
  });
  const view = render(<ProfileCollection />);
  expect(screen.getByRole("button", { name: "Équiper Preneur" })).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText("Débloqué au niveau 2")).toBeTruthy();
  expect(view.container.textContent).not.toMatch(
    /Main sûre|Couronne|Or fin|Verrouillé|requis|24/,
  );
  for (const category of ["Badges", "Cadres"]) {
    fireEvent.click(screen.getByRole("tab", { name: category }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("status")).toBeTruthy();
  }
});

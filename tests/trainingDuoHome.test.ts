// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrainingDuoHomeClient } from "@/components/training/TrainingDuoHomeClient";
import { duoFixture } from "@/tests/trainingDuoClientFixtures";

vi.stubGlobal("React", React);
const push = vi.fn();
const create = vi.fn(); const join = vi.fn(); const profile = vi.fn();
const getSession = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/trainingDuoApi", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/trainingDuoApi")>()),
  createTrainingDuoSession: (...args: unknown[]) => create(...args), joinTrainingDuoSession: (...args: unknown[]) => join(...args) }));
vi.mock("@/lib/profiles", () => ({ ensureProfile: (...args: unknown[]) => profile(...args) }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({ auth: { getSession, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } }) }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); profile.mockResolvedValue("Alice"); create.mockResolvedValue(duoFixture()); join.mockResolvedValue(duoFixture()); });

it("requires a signed-in account", async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  render(React.createElement(TrainingDuoHomeClient));
  expect(await screen.findByRole("link", { name: "Se connecter" })).toHaveProperty("href", expect.stringContaining("next=%2Ftraining%2Fduo"));
});
it("creates any of four levels without checking solo progress and redirects", async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: "token", user: { id: "u" } } } });
  render(React.createElement(TrainingDuoHomeClient));
  const selector = await screen.findByRole("combobox", { name: "Niveau" });
  expect(selector.querySelectorAll("option")).toHaveLength(4);
  fireEvent.change(selector, { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Créer le duo" }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(4, expect.objectContaining({ access_token: "token" })));
  expect(push).toHaveBeenCalledWith("/training/duo/duo-id");
});
it("joins by normalized code and redirects", async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: "token", user: { id: "u" } } } });
  render(React.createElement(TrainingDuoHomeClient));
  fireEvent.change(await screen.findByRole("textbox", { name: "Code de session" }), { target: { value: "abcdefghjk" } });
  fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
  await waitFor(() => expect(join).toHaveBeenCalledWith("ABCDEFGHJK", expect.objectContaining({ access_token: "token" })));
  expect(push).toHaveBeenCalledWith("/training/duo/duo-id");
});

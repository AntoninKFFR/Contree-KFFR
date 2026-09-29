// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { useFriendPresence } from "@/components/social/useFriendPresence";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/socialApi", () => ({ fetchFriendPresence: mocks.fetch }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("polls on social changes, preserves an active button, clears removed presence and logout", async () => {
  const session = { access_token: "jwt" } as Session;
  mocks.fetch.mockResolvedValueOnce(new Set(["friend"])).mockResolvedValueOnce(new Set());
  const hook = renderHook(({ activeSession }) => useFriendPresence(activeSession), { initialProps: { activeSession: session as Session | null } });
  await waitFor(() => expect(hook.result.current.has("friend")).toBe(true));

  const row = document.createElement("div");
  row.className = "friend-presence-row";
  const button = document.createElement("button");
  row.append(button);
  document.body.append(row);
  button.focus();
  await act(async () => { window.dispatchEvent(new Event("kffr:social-changed")); });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(hook.result.current.has("friend")).toBe(true);
  row.remove();
  await waitFor(() => expect(hook.result.current.has("friend")).toBe(false));

  hook.rerender({ activeSession: null });
  expect(hook.result.current.size).toBe(0);
  act(() => { window.dispatchEvent(new Event("kffr:social-changed")); });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

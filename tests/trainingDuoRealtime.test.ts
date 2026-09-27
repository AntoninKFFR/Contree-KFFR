import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeToTrainingDuoRealtime } from "@/lib/trainingDuoRealtime";

afterEach(() => vi.useRealTimers());
it("invalidates from only public duo tables, debounces GET signals and cleans up", () => {
  vi.useFakeTimers();
  const handlers: Array<() => void> = [];
  const filters: unknown[] = [];
  const channel = { on: vi.fn((_event, filter, handler) => { filters.push(filter); handlers.push(handler); return channel; }), subscribe: vi.fn(() => channel) };
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() } as unknown as SupabaseClient;
  const refresh = vi.fn();
  const cleanup = subscribeToTrainingDuoRealtime(client, "duo-id", refresh);
  expect(filters).toEqual([
    { event: "*", schema: "public", table: "training_duo_sessions", filter: "id=eq.duo-id" },
    { event: "*", schema: "public", table: "training_duo_participants", filter: "session_id=eq.duo-id" },
  ]);
  handlers[0](); handlers[1]();
  vi.advanceTimersByTime(49); expect(refresh).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(refresh).toHaveBeenCalledTimes(1);
  handlers[0](); cleanup(); vi.runAllTimers();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(client.removeChannel).toHaveBeenCalledWith(channel);
});

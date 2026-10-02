import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const put = vi.fn();
  const fallback = new Response("public offline screen");
  const fetch = vi.fn(async () => new Response("live network"));
  const cache = { open: vi.fn(async () => ({ put })), match: vi.fn(async () => fallback), keys: vi.fn(async () => ["kffr-offline-old", "unrelated"]), delete: vi.fn() };
  const self = { location: { origin: "https://kffr.test" }, addEventListener: (type: string, listener: typeof listeners[string]) => { listeners[type] = listener; }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches: cache, fetch, URL, Response });
  return { listeners, fetch, cache, put, fallback, self };
}

describe("minimal PWA worker cache boundary", () => {
  it("only precaches the public data-free offline document", async () => {
    const w = worker();
    let job: Promise<unknown> | undefined;
    w.listeners.install({ waitUntil: (value: Promise<unknown>) => { job = value; } });
    await job;
    expect(w.fetch).toHaveBeenCalledExactlyOnceWith("/pwa-offline.html", { cache: "reload", credentials: "omit" });
    expect(w.put).toHaveBeenCalledOnce();
    expect(w.put.mock.calls[0][0]).toBe("/pwa-offline.html");
  });
  it.each([
    ["https://kffr.test/api/social", "navigate", "GET"],
    ["https://kffr.test/api/progression", "cors", "GET"],
    ["https://supabase.test/rest/v1/profiles", "cors", "GET"],
    ["https://supabase.test/auth/v1/token", "cors", "POST"],
    ["https://supabase.test/realtime/v1", "cors", "GET"],
    ["https://kffr.test/multiplayer/room?_rsc=x", "cors", "GET"],
    ["https://kffr.test/api/rating", "cors", "POST"],
  ])("does not intercept %s", (url, mode, method) => {
    const w = worker();
    const respondWith = vi.fn();
    w.listeners.fetch({ request: { url, mode, method }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.put).not.toHaveBeenCalled();
  });
  it.each(["/", "/multiplayer/room", "/friends", "/progression", "/profile", "/auth/callback?code=private"])("never caches application navigation %s", async (path) => {
    const w = worker();
    let job: Promise<Response> | undefined;
    w.listeners.fetch({ request: { url: `https://kffr.test${path}`, method: "GET", mode: "navigate" }, respondWith: (value: Promise<Response>) => { job = value; } });
    expect(await (await job)?.text()).toBe("live network");
    expect(w.put).not.toHaveBeenCalled();
    expect(w.cache.match).not.toHaveBeenCalled();
  });
  it("returns the public offline screen after a real navigation failure", async () => {
    const w = worker();
    w.fetch.mockRejectedValueOnce(new TypeError("network failure"));
    let job: Promise<Response> | undefined;
    w.listeners.fetch({ request: { url: "https://kffr.test/profile", method: "GET", mode: "navigate" }, respondWith: (value: Promise<Response>) => { job = value; } });
    expect(await job).toBe(w.fallback);
    expect(w.put).not.toHaveBeenCalled();
  });
  it("only removes its own older offline cache", async () => {
    const w = worker();
    let job: Promise<unknown> | undefined;
    w.listeners.activate({ waitUntil: (value: Promise<unknown>) => { job = value; } });
    await job;
    expect(w.cache.delete).toHaveBeenCalledExactlyOnceWith("kffr-offline-old");
    expect(w.self.clients.claim).toHaveBeenCalledOnce();
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchWithTimeout } from "../src/lib/fetchWithTimeout";

test("aborts a stalled HTTP request after 15 seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let aborted = false;
  t.mock.method(globalThis, "fetch", (_input: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      aborted = true;
      reject(new Error("aborted"));
    });
  }));
  const pending = fetchWithTimeout("https://example.invalid");
  const rejected = assert.rejects(pending, /aborted/);
  t.mock.timers.tick(14_999);
  assert.equal(aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(aborted, true);
});

test("preserves caller cancellation and request options", async (t) => {
  t.mock.method(globalThis, "fetch", (_input: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    assert.equal(init.method, "POST");
    assert.equal(init.body, "test-body");
    init.signal?.addEventListener("abort", () => reject(new Error("caller aborted")));
  }));
  const controller = new AbortController();
  const pending = fetchWithTimeout("https://example.invalid", {
    method: "POST", body: "test-body", signal: controller.signal,
  });
  const rejected = assert.rejects(pending, /caller aborted/);
  controller.abort();
  await rejected;
});

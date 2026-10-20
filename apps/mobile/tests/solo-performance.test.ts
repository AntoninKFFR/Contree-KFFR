import { test } from "node:test";
import assert from "node:assert/strict";
import { traceSolo, markSolo, soloWait, soloSpeed } from "../src/solo/performance";

test("performance diagnostics are silent outside development and emit only enum/number/bool fields", () => {
  const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
  const previous = runtime.__DEV__, debug = console.debug, events: unknown[][] = [];
  console.debug = (...args: unknown[]) => events.push(args);
  try {
    runtime.__DEV__ = false;
    assert.equal(traceSolo("play-card"), null);
    markSolo(null, "body"); soloWait("bot", 700, 701); soloSpeed("normal", 700, 500, 1200, false);
    assert.equal(events.length, 0);
    runtime.__DEV__ = true;
    const trace = traceSolo("play-card"); markSolo(trace, "headers"); soloWait("bot", 700, 701);
    soloSpeed("normal", 700, 500, 1200, false);
    for (const [, fields] of events) {
      for (const [key, value] of Object.entries(fields as object)) {
        assert.ok(["trace", "operation", "phase", "elapsedMs", "kind", "plannedMs", "speed", "botMs", "biddingMs", "collectionMs", "reduced"].includes(key));
        assert.ok(typeof value === "number" || typeof value === "boolean" || ["play-card", "intent", "headers", "bot", "normal"].includes(String(value)));
      }
    }
  } finally { console.debug = debug; runtime.__DEV__ = previous; }
});

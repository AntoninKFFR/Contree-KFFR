import { test } from "node:test";
import assert from "node:assert/strict";
import { TrainingSeriesDelivery } from "../src/training/delivery";
import { seriesSubmission, TrainingApiError } from "../src/training/api";
const body = seriesSubmission({ axisId: "trick-value", level: 1, seed: 480000, durationMs: 5000, answers: [] });
const signal = new AbortController().signal;
function storage() { const m = new Map<string, string>(); return { getItem: async (key: string) => m.get(key) ?? null, setItem: async (key: string, value: string) => { m.set(key, value); } }; }
test("concurrent components, token refresh and restart send one official POST", async () => {
  const disk = storage(); let posts = 0;
  const send = async () => { posts++; }, exists = async () => false;
  await Promise.all([new TrainingSeriesDelivery(disk, "a", send, exists).deliver("r", body, signal), new TrainingSeriesDelivery(disk, "a", send, exists).deliver("r", body, signal)]);
  await new TrainingSeriesDelivery(disk, "a", send, exists).deliver("r", body, signal);
  assert.equal(posts, 1);
});
test("lost response is reconciled by read, never automatically posted a second time", async () => {
  const disk = storage(); let posts = 0, committed = false;
  const send = async () => { posts++; committed = true; throw Error("lost response"); };
  await assert.rejects(new TrainingSeriesDelivery(disk, "a", send, async () => false).deliver("r", body, signal));
  await assert.rejects(new TrainingSeriesDelivery(disk, "a", send, async () => false).deliver("r", body, signal), /incertain/);
  await new TrainingSeriesDelivery(disk, "a", send, async () => committed).deliver("r", body, signal);
  assert.equal(posts, 1);
});
test("definitive 401 can be retried after reauthentication; failed staging prevents any HTTP", async () => {
  const disk = storage(); let posts = 0;
  const delivery = new TrainingSeriesDelivery(disk, "a", async () => { posts++; if (posts === 1) throw new TrainingApiError("expired", 401); }, async () => false);
  await assert.rejects(delivery.deliver("r", body, signal)); await delivery.deliver("r", body, signal); assert.equal(posts, 2);
  const failed = new TrainingSeriesDelivery({ getItem: async () => null, setItem: async () => { throw Error("disk"); } }, "b", async () => assert.fail("must stage first"), async () => false);
  await assert.rejects(failed.deliver("r", body, signal), /disk/);
});

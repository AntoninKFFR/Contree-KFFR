import assert from "node:assert/strict";
import { test } from "node:test";
import { TrainingProgressStore, trainingStorageKey } from "../src/training/storage";
import { recordTrickValueSeries } from "../../../lib/training/progress";
function memory() {
  const values = new Map<string, string>();
  return { values, getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
}
test("first launch, exact unlock rule, restart, serialized writes and durable duplicate suppression", async () => {
  const storage = memory(), store = new TrainingProgressStore(storage, "a");
  assert.equal((await store.load()).axes["trick-value"].unlockedLevel, 1);
  await Promise.all([store.commit("run-1", (p) => recordTrickValueSeries(p, 1, 8)), store.commit("run-2", (p) => recordTrickValueSeries(p, 1, 7))]);
  const restarted = new TrainingProgressStore(storage, "a");
  await restarted.commit("run-1", () => { throw new Error("must not apply twice"); });
  const progress = await restarted.load();
  assert.equal(progress.axes["trick-value"].levels[1].completedSeries, 2);
  assert.equal(progress.axes["trick-value"].unlockedLevel, 2);
  assert.equal((await new TrainingProgressStore(storage, "b").load()).axes["trick-value"].levels[1].bestScore, 0);
});
test("invalid JSON is recoverable, future versions and read failures never overwrite saved data", async () => {
  const storage = memory(), key = trainingStorageKey("a"), store = new TrainingProgressStore(storage, "a");
  storage.values.set(key, "broken");
  await store.commit("new", (p) => p);
  assert.equal(storage.values.get(key + ":recovery"), "broken");
  storage.values.set(key, '{"version":2}');
  await assert.rejects(store.commit("newer", (p) => p), /inconnu/);
  assert.equal(storage.values.get(key), '{"version":2}');
  const failed = new TrainingProgressStore({ getItem: async () => { throw Error("disk"); }, setItem: async () => assert.fail("must not overwrite") }, "a");
  await assert.rejects(failed.commit("x", (p) => p), /disk/);
});
test("existing v1 payload retains its legacy score and unrelated axes", async () => {
  const storage = memory(), key = trainingStorageKey("a");
  storage.values.set(key, JSON.stringify({ version: 1, axes: { "trick-value": { bestScore: 9, completedSeries: 3 }, "pile-count": { modes: { manual: { completedSeries: 2, bestTimeMs: 4500 } } } } }));
  const p = await new TrainingProgressStore(storage, "a").load();
  assert.equal(p.axes["trick-value"].levels[1].bestScore, 9);
  assert.equal(p.axes["trick-value"].unlockedLevel, 2);
  assert.equal(p.axes["pile-count"].modes.manual.bestTimeMs, 4500);
});

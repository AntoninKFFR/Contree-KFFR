import { test } from "node:test";
import assert from "node:assert/strict";
import { NativeDuoController, validateDuoView } from "../src/training/duo";
import { duoFixture } from "../../../tests/trainingDuoClientFixtures";
const id = "15300000-0000-4000-8000-000000000001";
const who = { user: { id: "a" }, access_token: "token" };
function view(status: Parameters<typeof duoFixture>[0] = "lobby", version = 1) { const v = duoFixture(status); v.session.id = id; v.session.stateVersion = version; return v; }
function storage() { const m = new Map<string, string>(); return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v); } }; }
test("Duo refuses unsupported doctrine/version and a private answer while answering", () => {
  assert.equal(validateDuoView(view("active")).exercise?.kind, "public");
  assert.throws(() => validateDuoView({ ...view(), session: { ...view().session, axisVersion: 2 as 1 } }), /Version/);
  const leaked = view("active"); Object.assign(leaked.exercise!, { answers: [] });
  assert.throws(() => validateDuoView(leaked), /Projection/);
});
test("double create sends once and dispose hides the response of a former account", async () => {
  let reply!: (r: Response) => void, calls = 0, changes = 0;
  const controller = new NativeDuoController(who, storage(), () => changes++, async () => { calls++; return new Promise((r) => { reply = r; }); });
  const pending = controller.create(1); await controller.create(1); assert.equal(calls, 1);
  controller.dispose(); const before = changes; reply(new Response(JSON.stringify({ data: view() }))); await pending;
  assert.equal(changes, before); assert.equal(controller.state.view, null);
});
test("GET started before a mutation cannot replace its confirmed newer version; restart uses only GET", async () => {
  const disk = storage(); let slow!: (r: Response) => void, calls = 0;
  const controller = new NativeDuoController(who, disk, () => {}, async (_url, init) => {
    calls++; if (calls === 2 && init?.method === undefined) return new Promise((r) => { slow = r; });
    return new Response(JSON.stringify({ data: view("lobby", calls === 1 ? 1 : 3) }));
  });
  await controller.create(1); const old = controller.load(); await controller.intent({ type: "set-ready", ready: true });
  slow(new Response(JSON.stringify({ data: view("lobby", 2) }))); await old;
  assert.equal(controller.state.view?.session.stateVersion, 3); controller.dispose();
  let resumed = 0; const next = new NativeDuoController(who, disk, () => {}, async (url, init) => { assert.equal(init?.method, undefined); assert.ok(String(url).endsWith(id)); resumed++; return new Response(JSON.stringify({ data: view("active", 4) })); });
  await next.resume(); assert.equal(resumed, 1); assert.equal(next.state.view?.session.status, "active"); next.dispose();
});

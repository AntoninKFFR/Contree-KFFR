import { readTrainingRecords } from "../apps/mobile/src/training/api";
import { parseTrainingLeaderboardRows } from "@/lib/training/leaderboard";
import { createRequire } from "node:module";
import { TrainingSeriesDelivery } from "../apps/mobile/src/training/delivery";
/** Opt-in integration. All credentials and account mutations are loopback only. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NativeDuoController } from "../apps/mobile/src/training/duo";
import { createTrainingDuoClient } from "@/lib/trainingDuoApi";
import { subscribeToTrainingDuoRealtime } from "@/lib/trainingDuoRealtime";
import { createTrainingApi, seriesSubmission } from "../apps/mobile/src/training/api";
import { generateTrickValueSeries } from "@/engine/training/trickValue";
import type { TrainingDuoView } from "@/lib/trainingDuoTypes";
const configPath = process.env.NATIVE_TRAINING_LOCAL_CONFIG;
if (!configPath) throw Error("Set NATIVE_TRAINING_LOCAL_CONFIG to a disposable local configuration file.");
const config = JSON.parse(readFileSync(configPath, "utf8")) as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
const backend = process.env.NATIVE_TRAINING_LOCAL_BACKEND ?? "http://127.0.0.1:3007";
for (const url of [config.API_URL, backend]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local integration refuses remote backends");
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const accounts: string[] = [], sessions: string[] = [];
const clients: SupabaseClient[] = [];
const controllers: NativeDuoController[] = [];
const suffix = randomUUID().slice(0, 8);
async function account(label: string) {
  const email = `native-training-${label}-${suffix}@example.test`, password = `Local-${randomUUID()}-Test`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `Natif${label}${suffix}` } });
  assert.ifError(created.error); assert.ok(created.data.user); accounts.push(created.data.user.id);
  const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } }); clients.push(client);
  const result = await client.auth.signInWithPassword({ email, password }); assert.ifError(result.error); assert.ok(result.data.session);
  return { client, identity: result.data.session };
}
const redirectLocal: typeof fetch = async (url, init) => {
  assert.ok(String(url).startsWith("https://contree-kffr.vercel.app/api/"), "The native transport must target its official origin");
  return fetch(String(url).replace("https://contree-kffr.vercel.app", backend), init);
};
function memory() { const m = new Map<string, string>(); return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v); } }; }
async function eventually(predicate: () => boolean, message: string) {
  const end = Date.now() + 15000;
  while (!predicate() && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  assert.ok(predicate(), message);
}
const nativeSdk = createRequire(new URL("../apps/mobile/package.json", import.meta.url))("@supabase/supabase-js") as { createClient: typeof createClient };
const evidence: Record<string, unknown> = { backend, supabase: config.API_URL, renderer: "actual native controllers and web API client; no physical iPhone claim", directions: [] };
try {
  const a = await account("A"), b = await account("B");
  const api = createTrainingApi(redirectLocal), signal = new AbortController().signal;
  const body = seriesSubmission({ axisId: "trick-value", level: 1, seed: 480000, durationMs: 5000, answers: generateTrickValueSeries({ seed: 480000, level: 1, generatorVersion: 1 }).map((e) => ({ kind: "number", value: e.answer })) });
  type Saved = { series: { id: string; score: number }; record: { bestScore: number } };
  let saved: Saved | null = null, posts = 0;
  const delivery = new TrainingSeriesDelivery(memory(), a.identity.user.id, async (value, requestSignal) => { posts++; saved = await api<Saved>(a.identity, requestSignal, "/api/training/series", value); }, async () => true);
  await delivery.deliver("local-series", body, signal); await delivery.deliver("local-series", body, signal);
  assert.equal(posts, 1); assert.ok(saved);
  const verified = saved as Saved; assert.equal(verified.series.score, 10); assert.equal(verified.record.bestScore, 10);
  const bad = await api<Saved>(a.identity, signal, "/api/training/series", { ...body, seed: 480010, answers: body.answers.map(() => ({ kind: "number", value: 0 })) });
  assert.ok(bad.series.score < 10); assert.equal(bad.record.bestScore, 10);
  const forged = await api<Saved>(a.identity, signal, "/api/training/series", { ...body, score: 999 }); assert.equal(forged.series.score, 10);
  await assert.rejects(api({ ...a.identity, access_token: "expired-jwt" }, signal, "/api/training/series", body));
  const xp = await admin.from("progression_xp_events").select("id").eq("user_id", a.identity.user.id); assert.ifError(xp.error);
  evidence.records = { perfect: verified.series.score, wrong: bad.series.score, nativeRepeatedDeliveryPosts: posts, serverRawPostIdempotency: false, xpEventsAfterDuplicate: xp.data?.length };
  const web = createTrainingDuoClient({ fetcher: redirectLocal, origin: "https://contree-kffr.vercel.app" });
  const aStore = memory(), bStore = memory();
  let nativeA = new NativeDuoController(a.identity, aStore, () => {}, redirectLocal), nativeB = new NativeDuoController(b.identity, bStore, () => {}, redirectLocal);
  controllers.push(nativeA, nativeB);
  for (const direction of ["native-web", "web-native", "native-native"] as const) {
    let first: TrainingDuoView, second: TrainingDuoView;
    if (direction === "web-native") { first = await web.createTrainingDuoSession(2, a.identity); sessions.push(first.session.id); await nativeB.join(first.session.code!); second = nativeB.state.view!; }
    else { await nativeA.create(direction === "native-native" ? 4 : 1); first = nativeA.state.view!; sessions.push(first.session.id); if (direction === "native-native") { await nativeB.join(first.session.code!); second = nativeB.state.view!; } else second = await web.joinTrainingDuoSession(first.session.code!, b.identity); }
    assert.ok(first && second); const id = first.session.id;
    const realtimeClient = nativeSdk.createClient(config.API_URL, config.ANON_KEY, { accessToken: async () => b.identity.access_token, auth: { persistSession: false } });
    const visible = await realtimeClient.from("training_duo_participants").select("id,session_id,slot,is_ready,ready_for_next,last_seen_at").eq("session_id", id); assert.ifError(visible.error); assert.equal(visible.data?.length, 2, "Native SDK must see the two public participants through RLS");
    await realtimeClient.realtime.setAuth(b.identity.access_token);
    let realtime = 0, subscribed = false; const stop = subscribeToTrainingDuoRealtime(realtimeClient, id, () => { realtime++; }, (status, error) => { if (status === "SUBSCRIBED") subscribed = true; console.log("Local Realtime status", status, error?.message.replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]")); });
    realtimeClient.getChannels().forEach((channel) => channel.on("system", {}, (payload) => console.log("Local Realtime system", payload.status, payload.message)));
    const load = async () => {
      if (direction !== "web-native") { await nativeA.load(id); first = nativeA.state.view!; } else first = await web.fetchTrainingDuoView(id, a.identity);
      if (direction !== "native-web") { await nativeB.load(id); second = nativeB.state.view!; } else second = await web.fetchTrainingDuoView(id, b.identity);
    };
    const intentA = async (intent: Parameters<typeof nativeA.intent>[0]) => { if (direction === "web-native") first = (await web.sendTrainingDuoIntentWithRetry(first, intent, a.identity))!; else { await nativeA.intent(intent); assert.equal(nativeA.state.error, null, `${direction} A ${intent.type}: ${nativeA.state.error}`); } };
    const intentB = async (intent: Parameters<typeof nativeB.intent>[0]) => { if (direction === "native-web") second = (await web.sendTrainingDuoIntentWithRetry(second, intent, b.identity))!; else { await nativeB.intent(intent); assert.equal(nativeB.state.error, null, `${direction} B ${intent.type}: ${nativeB.state.error}`); } };
    try {
      await eventually(() => subscribed, "Realtime channel must subscribe before the actions");
      // The local replication worker may start after SUBSCRIBED; prime it with
      // official presence writes before testing delivery, as in the web DB suite.
      for (let probe = 0; probe < 20 && realtime === 0; probe++) { await web.sendTrainingDuoPresence(id, a.identity); await new Promise((resolve) => setTimeout(resolve, 500)); }
      assert.ok(realtime > 0, "Authorized local participant changes must arrive through Realtime");
      await load(); await Promise.all([intentA({ type: "set-ready", ready: true }), intentB({ type: "set-ready", ready: true })]); await load();
      await intentA({ type: "start" }); await load(); assert.equal(first.session.status, "active");
      let recovered = false;
      for (let i = 0; i < 10; i++) {
        if (i === 5) {
          if (direction === "native-web") { nativeA.dispose(); nativeA = new NativeDuoController(a.identity, aStore, () => {}, redirectLocal); controllers.push(nativeA); await nativeA.resume(); }
          else { nativeB.dispose(); nativeB = new NativeDuoController(b.identity, bStore, () => {}, redirectLocal); controllers.push(nativeB); await nativeB.resume(); }
          await load(); assert.equal(first.session.currentIndex, 5); assert.equal(second.session.currentIndex, 5);
          const beforeReconnect = realtime; subscribed = false;
          await realtimeClient.realtime.disconnect(); await realtimeClient.realtime.setAuth(b.identity.access_token); realtimeClient.realtime.connect();
          await eventually(() => subscribed, "Realtime must rejoin after a lost connection");
          await web.sendTrainingDuoPresence(id, a.identity);
          await eventually(() => realtime > beforeReconnect, "Realtime must invalidate again after reconnecting"); recovered = true;
        }
        assert.equal(first.session.currentIndex, i); assert.equal(second.exercise?.kind, "public");
        assert.ok(!("promise" in second.exercise!) && !("answers" in second.exercise!));
        await intentA({ type: "submit-answer", answer: { selectedAssertionIds: [] } });
        if (direction === "native-web") second = await web.fetchTrainingDuoView(id, b.identity); else { await nativeB.load(id); second = nativeB.state.view!; }
        assert.equal(second.exercise?.kind, "public"); assert.ok(!("answers" in second.exercise!));
        await intentB({ type: "submit-answer", answer: { selectedAssertionIds: second.exercise!.assertionChoices.slice(0, 1) } }); await load();
        assert.equal(first.exercise?.kind, "revealed");
        if (first.exercise?.kind === "revealed") assert.equal(first.exercise.answers.length, 2);
        await Promise.all([intentA({ type: "ready-next" }), intentB({ type: "ready-next" })]); await load();
      }
      assert.equal(first.session.status, "completed"); assert.deepEqual(first.result, second.result);
      await eventually(() => realtime > 0, "real local Realtime must invalidate the session");
      (evidence.directions as unknown[]).push({ direction, level: first.session.level, questions: 10, bookmarkResumeAndRealtimeReconnect: recovered, realtimeSdk: "native 2.118.0", independentAnswers: true, result: first.result, realtimeInvalidations: realtime });
    } finally { stop(); await realtimeClient.removeAllChannels(); }
    console.log("Completed local Duo direction", direction);
  }
  // The two independently locked apps intentionally use different SDK versions.
  // Construct the real mobile SDK here and bridge its type at the test boundary.
  const nativeRecordClient = nativeSdk.createClient(config.API_URL, config.ANON_KEY, { accessToken: async () => a.identity.access_token, auth: { persistSession: false } });
  const records = await readTrainingRecords(nativeRecordClient as unknown as Parameters<typeof readTrainingRecords>[0], a.identity.user.id, signal); assert.equal(records.find((r) => r.axisId === "trick-value")?.bestScore, 10);
  const friendship = await admin.from("friendships").insert({ user_low: [a.identity.user.id, b.identity.user.id].sort()[0], user_high: [a.identity.user.id, b.identity.user.id].sort()[1] }); assert.ifError(friendship.error);
  const leaderboard = await b.client.rpc("get_friends_training_leaderboard", { p_axis_id: "trick-value", p_level: 1 }); assert.ifError(leaderboard.error); assert.ok(parseTrainingLeaderboardRows(leaderboard.data).some((r) => r.bestScore === 10));
  await nativeA.create(1); assert.ok(nativeA.state.view); const invitationSession = nativeA.state.view!.session.id; sessions.push(invitationSession);
  const sent = await api<{ id: string }>(a.identity, signal, `/api/training/duo/sessions/${invitationSession}/invitations`, { inviteeId: b.identity.user.id });
  const invitations = await api<{ id: string }[]>(b.identity, signal, "/api/training/duo/invitations"); assert.ok(invitations.some((i) => i.id === sent.id));
  const joined = await api<{ sessionId: string }>(b.identity, signal, `/api/training/duo/invitations/${sent.id}/join`, {}); assert.equal(joined.sessionId, invitationSession);
  await nativeB.load(joined.sessionId); assert.equal(nativeB.state.view?.viewerSlot, 1);
  evidence.invitationAndFriendRecords = { invitationReceived: true, joinedThroughOfficialEndpoint: true, verifiedAccountRecord: 10, friendLeaderboardRecord: 10 };
  evidence.completedAt = new Date().toISOString(); mkdirSync("apps/mobile/docs/training-153", { recursive: true });
  writeFileSync("apps/mobile/docs/training-153/local-integration.json", JSON.stringify(evidence, null, 2));
  console.log("Local integration passed: verified records, duplicate submission, wrong answers, rejected tampering/JWT; 30 Duo questions in native/web, web/native and native/native, real Realtime and private answering projections.");
} finally {
  controllers.forEach((c) => c.dispose());
  await Promise.all(clients.map((c) => c.removeAllChannels()));
  if (sessions.length) await admin.from("training_duo_sessions").delete().in("id", sessions);
  for (const id of accounts) { const removed = await admin.auth.admin.deleteUser(id); assert.ifError(removed.error); }
}

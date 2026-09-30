// Disposable LOCAL Supabase + local Next server only; real JWT/API/engine tests.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chooseBotBid } from "../bots/simpleBot";
import { playableCardsForCurrentPlayer } from "../engine/game";
import { getProgression } from "../lib/progression/formulaV1";
import { getMyProgression } from "../lib/progression/queries";
import type { SoloSession, SoloIntent } from "../lib/solo/sessionTypes";
import { chromium } from "@playwright/test";

const url = process.env.PROGRESSION_TEST_SUPABASE_URL;
const anonKey = process.env.PROGRESSION_TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.PROGRESSION_TEST_SUPABASE_SERVICE_ROLE_KEY;
const apiUrl = process.env.PROGRESSION_TEST_API_URL ?? "http://127.0.0.1:3000";
if (!url || !anonKey || !serviceKey || ![url,apiUrl].every((value) => ["localhost","127.0.0.1","::1"].includes(new URL(value).hostname))) {
  throw new Error("Game XP tests require disposable local Supabase and Next credentials");
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url,serviceKey,options);
const anonymous = createClient(url,anonKey,options);
const users: { id: string; email: string; password: string; client: SupabaseClient; token: string }[] = [];
const gameIds: string[] = [];
function checked<T extends {data:unknown;error:{message:string}|null}>(result: T, label: string): NonNullable<T["data"]> {
  if (result.error || result.data === null) throw new Error(`${label}: ${result.error?.message ?? "no data"}`);
  return result.data as NonNullable<T["data"]>;
}
async function who(index: number) {
  const tag = randomUUID().slice(0,8);
  const email = `xp-game-${index}-${tag}@example.test`;
  const password = `Local-${randomUUID()}-test`;
  const { user } = checked(await admin.auth.admin.createUser({ email,password,email_confirm:true,
    user_metadata:{ username:`XpGame${index}${tag}` } }),"create identity");
  assert.ok(user);
  const client = createClient(url!,anonKey!,options);
  const { session } = checked(await client.auth.signInWithPassword({ email,password }),"sign in");
  const result = { id: user.id,email,password,client,token:session!.access_token };
  users.push(result);
  return result;
}
async function api(path: string,token: string,body?: unknown) {
  return fetch(`${apiUrl}/api/solo/sessions${path}`, { method:body === undefined ? "GET":"POST",
    headers:{ "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` }: {}) },
    ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
}
async function payload(response: Response): Promise<SoloSession> {
  assert.equal(response.status,200,await response.clone().text());
  return (await response.json() as { data: SoloSession }).data;
}
async function total(user: typeof users[number]) {
  return checked(await user.client.rpc("get_my_progression"),"progression read").total_xp as number;
}
async function denied(result: PromiseLike<{ error: unknown }>) { assert.ok((await result).error,"client operation must fail"); }
const rules = { presetId:"contree-kffr",overrides:{ game:{ targetScore:100 } } };

try {
  const [a,b] = await Promise.all([0,1,2,3].map(who));
  // The running Next server proves auth + authority, not just SQL fixtures.
  assert.equal((await api("","",{ rules,startKey:randomUUID() })).status,401);
  assert.equal((await api("","invalid-jwt",{ rules,startKey:randomUUID() })).status,401);
  const startKey = randomUUID();
  let session = await payload(await api("",a.token,{ rules,startKey }));
  assert.notEqual(session.id,startKey);
  assert.deepEqual(await payload(await api("",a.token,{ rules,startKey })),session);
  assert.equal((await api(`/${session.id}`,b.token)).status,404);
  assert.equal((await api(`/${session.id}`,b.token,{expectedVersion:0,intent:{type:"advance-bot"}})).status,404);
  assert.equal((await api(`/${randomUUID()}`,a.token,{ expectedVersion:0,intent:{type:"advance-bot"} })).status,404);
  for (const key of ["won","player_score","amount","user_id","seed","rules","state"]) {
    assert.equal((await api(`/${session.id}`,a.token,{ expectedVersion:session.version,
      intent:{type:"advance-bot"},[key]:key === "state" ? {phase:"game-over",winnerTeam:0}:999 })).status,400);
  }
  assert.equal(await total(a),0);
  assert.deepEqual(checked(await admin.from("games").select("id").eq("id",session.id),"not finished"),[]);
  const outcomes = new Set<number>();
  let expectedSolo = 0;
  for (let game = 0; game < 12 && outcomes.size < 2; game += 1) {
    if (game) session = await payload(await api("",a.token,{rules,startKey:randomUUID()}));
    let lastBody: unknown;
    for (let step = 0; step < 1000 && session.state.phase !== "game-over"; step += 1) {
      const state = session.state;
      let intent: SoloIntent;
      if (state.phase === "finished") intent = { type:"start-next-round" };
      else if (state.currentPlayerId !== 0) intent = { type:"advance-bot" };
      else if (state.phase === "playing") intent = {type:"play-card",playerId:0,card:playableCardsForCurrentPlayer(state)[0]};
      else {
        const bid = chooseBotBid(state);
        intent = { ...bid,type:bid.action,playerId:0 } as SoloIntent;
        // Strip the bot's internal discriminant: clients send an action, not a bot decision.
        delete (intent as unknown as Record<string,unknown>).action;
      }
      lastBody = {expectedVersion:session.version,intent};
      // Concurrent duplicate requests on every transition, including finalization.
      const replies = await Promise.all([api(`/${session.id}`,a.token,lastBody),api(`/${session.id}`,a.token,lastBody)]);
      const states = await Promise.all(replies.map(payload));
      assert.deepEqual(states[0],states[1]);
      session = states[0];
    }
    assert.equal(session.state.phase,"game-over");
    const amount = session.state.winnerTeam === 0 ? 30 : 20;
    outcomes.add(session.state.winnerTeam!);
    expectedSolo += amount;
    assert.equal(await total(a),expectedSolo);
    const history = checked(await admin.from("games").select("*").eq("id",session.id),"verified history");
    assert.equal(history.length,1);
    assert.equal(history[0].won,session.state.winnerTeam === 0);
    assert.equal(history[0].player_score,session.state.totalScore[0]);
    const ledger = checked(await admin.from("progression_xp_events").select("amount,source_type")
      .eq("user_id",a.id).eq("source_id",session.id),"verified ledger");
    assert.deepEqual(ledger,[{amount,source_type:"solo_game"}]);
    assert.deepEqual(await payload(await api(`/${session.id}`,a.token,lastBody)),session);
    assert.deepEqual(await payload(await api(`/${session.id}`,a.token)),session); // Reload after finish.
    assert.equal(await total(a),expectedSolo);
  }
  assert.deepEqual([...outcomes].sort(),[0,1],"real server games include both win and loss");
  assert.deepEqual(await getMyProgression(a.client),getProgression(expectedSolo));

  // Browser integration: connected session starts, bot advances and reload resumes;
  // browser submits no final state, writes no legacy history, and guest stays local.
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.goto(`${apiUrl}/login`);
    await page.getByLabel("Email").fill(b.email);
    await page.getByLabel("Mot de passe").fill(b.password);
    await page.locator("form").getByRole("button",{name:"Se connecter"}).click();
    await page.waitForURL((value) => !value.pathname.startsWith("/login"));
    await page.goto(`${apiUrl}/solo`);
    const startResponse = page.waitForResponse((response) => response.url().endsWith("/api/solo/sessions") && response.request().method() === "POST");
    await page.getByRole("button",{name:"Commencer la partie"}).click();
    const browserSession = (await (await startResponse).json()).data as SoloSession;
    await page.waitForFunction((userId) => Boolean(localStorage.getItem(`kffr-solo-session:${userId}`)),b.id);
    const persisted = await page.evaluate((userId) => localStorage.getItem(`kffr-solo-session:${userId}`),b.id);
    assert.equal(persisted,browserSession.id);
    const resume = page.waitForResponse((response) => response.url().endsWith(`/api/solo/sessions/${persisted}`) && response.request().method() === "GET");
    await page.reload();
    assert.equal((await resume).status(),200);
    assert.equal(await total(b),0);
    const guest = await browser.newPage();
    const guestCalls: string[] = [];
    guest.on("request",(request) => { if (request.url().includes("/api/solo/sessions")) guestCalls.push(request.url()); });
    await guest.goto(`${apiUrl}/solo`);
    await guest.getByRole("button",{name:"Commencer la partie"}).click();
    await guest.getByRole("main",{name:/Partie Solo/}).waitFor();
    assert.deepEqual(guestCalls,[]);
    await guest.close();
    await page.close();
  } finally { await browser.close(); }

  // SQL multiplayer contract: all winner/forfeit teams, humans and bots.
  const totals = new Map(users.map((user) => [user.id,user.id === a.id ? expectedSolo : 0]));
  for (const [winner,endReason,humanSeats] of [
    [0,"score",[0,1,2,3]],[1,"score",[0,1,2,3]],
    [0,"forfeit",[0,1,2,3]],[1,"forfeit",[0,1,2,3]],
    [0,"score",[0,1]],[1,"forfeit",[0,1]],
  ] as const) {
    const gameId = randomUUID();
    gameIds.push(gameId);
    checked(await admin.from("multiplayer_games").insert({id:gameId,started_at:new Date().toISOString(),finished_at:new Date().toISOString(),
      scoring_mode:"announced-points",target_score:1000,team_0_score:winner === 0 ? 1100:700,team_1_score:winner === 1 ? 1100:700,
      winner_team:winner,end_reason:endReason,forfeiting_team:endReason === "forfeit" ? 1-winner:null,round_count:8}),"archive fixture");
    const incomplete = await admin.rpc("apply_progression_multiplayer_game",{p_game_id:gameId});
    assert.equal(incomplete.error?.code,"23514");
    checked(await admin.from("multiplayer_game_players").insert([0,1,2,3].map((seat) => {
      const human = (humanSeats as readonly number[]).includes(seat);
      return {game_id:gameId,seat_index:seat,kind:human ? "human":"bot",user_id:human ? users[seat].id:null,
        display_name:`Seat ${seat}`,bot_profile_id:human ? null:"advanced_rules_v4",team_id:seat%2};
    })),"archive participants");
    const results = await Promise.all(Array.from({length:8},() => admin.rpc("apply_progression_multiplayer_game",{p_game_id:gameId})));
    const statuses = results.map((result) => checked(result,"concurrent Multi apply"));
    assert.equal(statuses.filter((status) => status === "applied").length,1);
    for (const seat of [0,1,2,3]) {
      const human = (humanSeats as readonly number[]).includes(seat);
      const won = seat%2 === winner;
      const amount = !human || (endReason === "forfeit" && !won) ? 0:won ? 50:30;
      totals.set(users[seat].id,totals.get(users[seat].id)!+amount);
      assert.equal(await total(users[seat]),totals.get(users[seat].id));
      const events = checked(await admin.from("progression_xp_events").select("amount,source_type")
        .eq("user_id",users[seat].id).eq("source_id",gameId),"Multi ledger");
      assert.deepEqual(events,amount ? [{amount,source_type:"multiplayer_game"}]:[]);
    }
    assert.equal(checked(await admin.rpc("apply_progression_multiplayer_game",{p_game_id:gameId}),"Multi retry"),"already_applied");
  }
  assert.ok((await admin.rpc("apply_progression_multiplayer_game",{p_game_id:randomUUID()})).error);
  for (const user of [a,b]) {
    await denied(user.client.from("games").insert({user_id:user.id,won:true,scoring_mode:"announced-points",player_score:9999,bot_score:0,target_score:1000}));
    await denied(user.client.from("solo_game_sessions").select("*"));
    await denied(user.client.from("solo_game_sessions").insert({user_id:user.id,start_key:randomUUID(),state:session.state}));
    await denied(user.client.from("progression_multiplayer_jobs").select("*"));
  }
  for (const client of [anonymous,a.client]) {
    await denied(client.rpc("create_solo_game_session",{p_user_id:a.id,p_start_key:randomUUID(),p_state:session.state}));
    await denied(client.rpc("commit_solo_game_session",{p_session_id:session.id,p_user_id:a.id,p_expected_version:0,p_state:session.state}));
    await denied(client.rpc("apply_progression_multiplayer_game",{p_game_id:gameIds[0]}));
    await denied(client.rpc("credit_progression_xp",{p_user_id:a.id,p_amount:999,p_source_type:"solo_game",p_source_id:session.id}));
  }
  for (const table of ["solo_game_sessions","progression_multiplayer_jobs"]) {
    await denied(admin.from(table).update({created_at:new Date().toISOString()}));
    await denied(admin.from(table).delete());
  }
  await denied(admin.from("solo_game_sessions").insert({user_id:a.id,start_key:randomUUID(),state:session.state}));
  console.log("Game XP: real JWT Solo win/loss, forged results, concurrent transitions, one archive/event, reload, browser/guest compatibility and Multi matrix passed.");
} finally {
  for (const id of gameIds) checked(await admin.from("multiplayer_games").delete().eq("id",id),"remove archive");
  for (const user of users) checked(await admin.auth.admin.deleteUser(user.id),"remove fixture user");
}

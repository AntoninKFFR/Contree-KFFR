// LOCAL disposable Supabase + Next only. Real JWTs and the verified HTTP route.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateTrickValueSeries } from "../engine/training/trickValue";
import { getMyPermanentMissions } from "../lib/progression/queries";
const url = process.env.PROGRESSION_TEST_SUPABASE_URL!;
const anon = process.env.PROGRESSION_TEST_SUPABASE_ANON_KEY!;
const service = process.env.PROGRESSION_TEST_SUPABASE_SERVICE_ROLE_KEY!;
const api = process.env.PROGRESSION_TEST_API_URL ?? "http://127.0.0.1:3000";
if (!url || !anon || !service || ![url,api].every(u => ["localhost","127.0.0.1","::1"].includes(new URL(u).hostname))) throw new Error("Local credentials required");
const options = {auth:{persistSession:false,autoRefreshToken:false}};
const admin = createClient(url,service,options);
const anonymous = createClient(url,anon,options);
const users: {id:string;token:string;client:SupabaseClient}[] = [];
const games: string[] = [];
function checked<T extends {data:unknown;error:{message:string}|null}>(r: T): NonNullable<T["data"]> {if(r.error || r.data === null) throw new Error(r.error?.message ?? "missing result");return r.data as NonNullable<T["data"]>;}
async function identity() {
  const email = `mission-${randomUUID()}@example.test`, password = `Local-${randomUUID()}`;
  const {user} = checked(await admin.auth.admin.createUser({email,password,email_confirm:true}));assert.ok(user);
  const client = createClient(url,anon,options);const {session} = checked(await client.auth.signInWithPassword({email,password}));
  const who = {id:user.id,token:session!.access_token,client};users.push(who);return who;
}
const denied = async (r: PromiseLike<{error:unknown}>) => assert.ok((await r).error,"write/RPC must be denied");
async function total(who: typeof users[number]) {return checked(await who.client.rpc("get_my_progression")).total_xp;}
async function submit(who: typeof users[number],body: unknown) {return fetch(`${api}/api/training/series`,{method:"POST",headers:{Authorization:`Bearer ${who.token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});}
try {
  const [a,b,c,d] = await Promise.all(Array.from({length:4},identity));
  const fresh = await getMyPermanentMissions(a.client);
  assert.deepEqual(fresh.map(m => [m.key,m.rewardXp,m.completed,m.completedAt]),[
    ["first_game",100,false,null],["first_win",150,false,null],["first_solo",100,false,null],["first_multiplayer",150,false,null],["first_training",100,false,null]]);
  assert.equal(await total(a),0);
  await denied(a.client.rpc("get_my_permanent_missions",{p_user_id:b.id}));
  await denied(anonymous.rpc("get_my_permanent_missions"));
  const body = {axisId:"trick-value",axisVersion:1,level:1,rulesetId:"contree-kffr",rulesetVersion:1,generatorVersion:1,seed:480000,
    answers:generateTrickValueSeries({level:1,seed:480000,generatorVersion:1}).map(e => ({kind:"number",value:e.answer})),durationMs:12345,timed:true};
  for (const fake of [{...body,user_id:b.id},{...body,axisId:"survival"},{...body,axisId:"blitz"},{...body,axisId:"training-duo"},{...body,answers:[]},{...body,durationMs:0}]) {
    assert.equal((await submit(a,fake)).status,400);assert.equal(await total(a),0);
    assert.ok((await getMyPermanentMissions(a.client)).every(m => !m.completed));
  }
  const first = await submit(a,{...body,score:9999}); // Forged score is ignored; server grading is canonical.
  assert.equal(first.status,200,await first.clone().text());
  const saved = (await first.json()).data;
  assert.equal(saved.series.score,10);assert.equal(await total(a),100);
  const audit = checked(await a.client.from("progression_permanent_mission_completions").select("*").single());
  assert.equal(audit.mission_key,"first_training");assert.equal(audit.source_type,"training_series");assert.equal(audit.source_id,saved.series.id);
  const repeated = await Promise.all(Array.from({length:8},() => submit(a,body)));
  for (const response of repeated) assert.equal(response.status,200,await response.clone().text());
  assert.equal(await total(a),100);
  assert.equal(checked(await a.client.from("progression_xp_events").select("*")).length,1);
  assert.deepEqual(checked(await b.client.from("progression_permanent_mission_completions").select("*").eq("user_id",a.id)),[]);
  assert.equal((await submit(b,body)).status,200);assert.equal(await total(b),100);
  for (const client of [anonymous,a.client,admin]) {
    await denied(client.from("progression_permanent_missions").insert({key:"first_game",reward_xp:999,sort_order:1}));
    await denied(client.from("progression_permanent_missions").update({reward_xp:999}).eq("key","first_game"));
    await denied(client.from("progression_permanent_missions").delete().eq("key","first_game"));
    await denied(client.from("progression_permanent_mission_completions").insert({user_id:a.id,mission_key:"first_win",source_type:"solo_game",source_id:randomUUID()}));
    await denied(client.from("progression_permanent_mission_completions").update({source_id:randomUUID()}).eq("user_id",a.id));
    await denied(client.from("progression_permanent_mission_completions").delete().eq("user_id",a.id));
    await denied(client.rpc("complete_permanent_mission",{p_user_id:a.id,p_mission_key:"first_win",p_source_type:"solo_game",p_source_id:randomUUID()}));
  }
  await denied(a.client.from("training_series").insert({user_id:a.id,mode:"puzzle"}));
  await denied(a.client.rpc("record_verified_training_series",{p_user_id:a.id}));
  // Two distinct games with reversed seat order race for the same missions.
  // Stable UUID locks must prevent deadlock and each account earns one reward.
  for (const reversed of [false,true]) {
    const id = randomUUID();games.push(id);
    const archive = await admin.from("multiplayer_games").insert({id,started_at:new Date().toISOString(),finished_at:new Date().toISOString(),scoring_mode:"announced-points",target_score:100,team_0_score:100,team_1_score:50,winner_team:0,end_reason:"score",round_count:1});
    assert.ifError(archive.error);
    const rows = await admin.from("multiplayer_game_players").insert([0,1,2,3].map(seat => ({game_id:id,seat_index:seat,kind:seat<2 ? "human":"bot",user_id:seat<2 ? (reversed ? [d,c]:[c,d])[seat].id:null,display_name:"Fixture",bot_profile_id:seat<2 ? null:"advanced_rules_v4",team_id:seat%2})));
    assert.ifError(rows.error);
  }
  const statuses = await Promise.all(games.map(id => admin.rpc("apply_progression_multiplayer_game",{p_game_id:id})));
  statuses.forEach(r => assert.equal(checked(r),"applied"));
  for(const who of [c,d]) {
    assert.equal(await total(who),480); // 50 + 30 game XP, plus three one-time rewards = 400.
    assert.equal(checked(await who.client.from("progression_permanent_mission_completions").select("*")).length,3);
    assert.equal(checked(await who.client.from("progression_xp_events").select("*").eq("source_type","permanent_mission")).length,3);
  }
  console.log("Permanent missions: real JWT reads/grants/RLS, verified Training HTTP grading, exclusions, retries, independent accounts and concurrent Multi rematches passed.");
} finally {
  for(const id of games) {const r = await admin.from("multiplayer_games").delete().eq("id",id);assert.ifError(r.error);}
  for(const who of users) checked(await admin.auth.admin.deleteUser(who.id));
}

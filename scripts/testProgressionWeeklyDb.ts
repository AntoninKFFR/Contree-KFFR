// LOCAL disposable Supabase + Next only. Real JWTs and the verified HTTP route.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateTrickValueSeries } from "../engine/training/trickValue";
import { getMyWeeklyMissions } from "../lib/progression/queries";
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
 const [a,b,c,d]=await Promise.all(Array.from({length:4},identity));
 const fresh=await getMyWeeklyMissions(a.client);assert.equal(fresh.missions.length,3);assert.ok(fresh.missions.every(m=>m.progress===0&&!m.completed));
 assert.equal(checked(await admin.from("progression_weekly_progress").select("*").eq("user_id",a.id)).length,0,"read creates no rows");
 await denied(anonymous.rpc("get_my_weekly_missions"));await denied(a.client.rpc("get_my_weekly_missions",{p_user_id:b.id}));
 const payload={axisId:"trick-value",axisVersion:1,level:1,rulesetId:"contree-kffr",rulesetVersion:1,generatorVersion:1,seed:480000,
  answers:generateTrickValueSeries({level:1,seed:480000,generatorVersion:1}).map(e=>({kind:"number",value:e.answer})),durationMs:12345,timed:true};
 for(const fake of [{...payload,user_id:b.id},{...payload,answers:[]},{...payload,axisId:"training-duo"},{...payload,axisId:"survival"},{...payload,axisId:"blitz"}]) {
  assert.equal((await submit(a,fake)).status,400);assert.equal(checked(await admin.from("progression_weekly_events").select("*").eq("user_id",a.id)).length,0);
 }
 for(let count=1;count<=4;count++) {
  const response=await submit(a,payload);assert.equal(response.status,200,await response.clone().text());
  const weekly=await getMyWeeklyMissions(a.client);let reward=0;
  for(const m of weekly.missions) {
   const expected=m.key==="training_series" ? Math.min(count,m.target):0;assert.equal(m.progress,expected);
   assert.equal(m.completed,expected===m.target);if(m.completed)reward+=m.rewardXp;
  }
  assert.equal(await total(a),100+reward,"permanent reward unchanged plus weekly at target only");
 }
 assert.ok((await getMyWeeklyMissions(b.client)).missions.every(m=>m.progress===0));
 assert.deepEqual(checked(await b.client.from("progression_weekly_progress").select("*").eq("user_id",a.id)),[]);
 assert.deepEqual(checked(await b.client.from("progression_weekly_events").select("*").eq("user_id",a.id)),[]);
 for(const client of [anonymous,a.client,admin]) {
  for(const [table,row] of [
   ["progression_weekly_catalog_versions",{version:99,active_from_week:"2099-01-05"}],
   ["progression_weekly_missions",{catalog_version:1,key:"fake",family:"fake",objective_type:"completed_game",target_count:1,reward_xp:999,sort_order:99}],
   ["progression_weekly_progress",{user_id:a.id,week_start:fresh.weekStart,catalog_version:1,mission_key:"wins",target_count:3,progress:3,completed_at:new Date().toISOString()}],
   ["progression_weekly_events",{user_id:a.id,week_start:fresh.weekStart,catalog_version:1,mission_key:"wins",source_type:"solo_game",source_id:randomUUID()}],
  ] as const) {
   await denied(client.from(table).insert(row));await denied(client.from(table).update(row).eq(Object.keys(row)[0],Object.values(row)[0]));
   await denied(client.from(table).delete().eq(Object.keys(row)[0],Object.values(row)[0]));
  }
  await denied(client.rpc("apply_weekly_progression_event",{p_user_id:a.id,p_source_type:"solo_game",p_source_id:randomUUID(),p_event_at:new Date().toISOString(),p_game_mode:"solo",p_won:true}));
 }
 // Two games, reversed humans; the existing UUID locks serialize all sources.
 for(const reversed of [false,true]) {
  const id=randomUUID();games.push(id);
  assert.ifError((await admin.from("multiplayer_games").insert({id,started_at:new Date().toISOString(),finished_at:new Date().toISOString(),scoring_mode:"announced-points",target_score:100,team_0_score:100,team_1_score:50,winner_team:0,end_reason:"score",round_count:1})).error);
  assert.ifError((await admin.from("multiplayer_game_players").insert([0,1,2,3].map(seat=>({game_id:id,seat_index:seat,kind:seat<2 ? "human":"bot",user_id:seat<2 ? (reversed ? [d,c]:[c,d])[seat].id:null,display_name:"Fixture",bot_profile_id:seat<2 ? null:"advanced_rules_v4",team_id:seat%2})))).error);
 }
 const statuses=await Promise.all(games.map(id=>admin.rpc("apply_progression_multiplayer_game",{p_game_id:id})));statuses.forEach(r=>assert.equal(checked(r),"applied"));
 for(const who of [c,d]) {
  const weekly=await getMyWeeklyMissions(who.client);let rewards=0;
  for(const m of weekly.missions) {
   const count=m.key==="regular_games"||m.key==="multiplayer_games" ? 2 : m.key==="wins" ? 1:0;
   assert.equal(m.progress,Math.min(count,m.target));if(count>=m.target)rewards+=m.rewardXp;
  }
  assert.equal(await total(who),480+rewards);
  const before=await getMyWeeklyMissions(who.client);for(const id of games)assert.equal(checked(await admin.rpc("apply_progression_multiplayer_game",{p_game_id:id})),"already_applied");
  assert.deepEqual(await getMyWeeklyMissions(who.client),before);
 }
 console.log("Weekly real JWT snapshot/no-write/RLS/grants, verified Training steps and combined rewards, fake modes, concurrent reversed-seat Multi and outbox retries passed.");
} finally {
 for(const id of games)assert.ifError((await admin.from("multiplayer_games").delete().eq("id",id)).error);
 for(const who of users)checked(await admin.auth.admin.deleteUser(who.id));
}

// Hardcoded disposable local Docker database. No production connection support.
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {randomUUID} from "node:crypto";
const exec=promisify(execFile), user=randomUUID();
async function sql(statement){const r=await exec("docker",["exec","supabase_db_contree-kffr","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-tA","-c",statement]);return r.stdout.trim();}
const event=id=>`select private.apply_weekly_progression_event('${user}','training_series','${id}','2026-10-01 12:00+00',null,null,'2026-10-01 12:00+00')`;
try{
 await sql(`insert into auth.users(id) values('${user}')`);
 await sql(event(randomUUID()));await sql(event(randomUUID()));
 const replies=await Promise.all([sql(event(randomUUID())),sql(event(randomUUID()))]);assert.deepEqual(replies.sort(),["0","1"]);
 const source=randomUUID();await Promise.all(Array.from({length:8},()=>sql(event(source))));
 const result=JSON.parse(await sql(`select json_build_object('progress',(select progress from public.progression_weekly_progress where user_id='${user}'),'xp',(select total_xp from public.player_progression where user_id='${user}'),'rewards',(select count(*) from public.progression_xp_events where user_id='${user}'),'events',(select count(*) from public.progression_weekly_events where user_id='${user}'))`));
 assert.deepEqual(result,{progress:3,xp:200,rewards:1,events:5});console.log("Weekly concurrent distinct events at N-1: capped progress, one reward, same-source dedupe passed.");
}finally{await sql(`delete from auth.users where id='${user}'`);}

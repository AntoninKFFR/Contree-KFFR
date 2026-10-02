import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loginAs } from "./helpers/auth";
async function api(page:Page,path:string,method="GET") {
  return page.evaluate(async({path,method})=>{
    const key=Object.keys(localStorage).find(k=>k.startsWith("sb-")&&k.endsWith("-auth-token"))!;
    const token=JSON.parse(localStorage.getItem(key)!).access_token;
    const response=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`}});
    return {status:response.status,body:await response.json()};
  },{path,method});
}
test("@social friend-only profile with real local Auth, stats and removal at 320px in both themes",async({page})=>{
  test.setTimeout(180000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!secret||!key||!["127.0.0.1","localhost","::1"].includes(new URL(url).hostname))throw new Error("Friend E2E requires disposable local Supabase");
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const ids:string[]=[],games:string[]=[];
  const checked=<T extends {data:unknown;error:unknown},>(result:T):T["data"]=>{if(result.error)throw result.error;return result.data;};
  try {
    const people=[];
    for(const label of ["A","B"]) {
      const suffix=randomUUID().slice(0,8),email=`friend114-${label}-${suffix}@example.test`,password=`Local-${randomUUID()}-test`,username=`Friend114${label}${suffix}`;
      const created=checked(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}}));ids.push(created.user!.id);
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});checked(await client.auth.signInWithPassword({email,password}));
      people.push({id:created.user!.id,email,password,username,client});
    }
    const [a,b]=people;
    const request=checked(await a.client.rpc("send_friend_request",{p_recipient_id:b.id}));checked(await b.client.rpc("accept_friend_request",{p_request_id:request.id}));
    checked(await admin.rpc("credit_progression_xp",{p_user_id:b.id,p_amount:22425,p_source_type:"permanent_mission",p_source_id:`friend114-${b.id}`}));
    for(const [slot,cosmetic] of [["title","title_auction_master"],["badge","badge_crown"],["frame","frame_black_gold"]])checked(await b.client.rpc("set_my_profile_cosmetic",{p_slot:slot,p_cosmetic_key:cosmetic}));
    checked(await admin.from("games").insert(Array.from({length:10},(_,i)=>({user_id:b.id,won:i<6,scoring_mode:"announced-points",player_score:1000,bot_score:500,target_score:1000}))));
    for(let i=0;i<4;i++) {
      const game=randomUUID();games.push(game);
      checked(await admin.from("multiplayer_games").insert({id:game,started_at:new Date(Date.now()-10000).toISOString(),finished_at:new Date().toISOString(),scoring_mode:"announced-points",target_score:1000,team_0_score:1000,team_1_score:500,winner_team:i%2,end_reason:i<2?"score":"forfeit",forfeiting_team:i<2?null:1-i%2,round_count:0}));
      checked(await admin.from("multiplayer_game_players").insert({game_id:game,seat_index:0,kind:"human",user_id:b.id,display_name:b.username,team_id:0}));
    }
    await loginAs(page,a);await page.goto("/friends");
    const row=page.locator(".friend-presence-row").filter({hasText:b.username});await expect(row).toContainText("Niv. 40");
    await row.getByRole("link",{name:`Voir le profil de ${b.username}`,exact:true}).click();await expect(page.getByRole("heading",{name:b.username,exact:true})).toBeVisible();
    await expect(page.getByText("Maître des enchères",{exact:true})).toBeVisible();await expect(page.locator("main .profile-badge")).toHaveCount(1);await expect(page.locator("main .profile-frame--black-gold")).toHaveCount(1);
    const payload=await api(page,`/api/social/friends/${b.id}/profile`);expect(payload.status).toBe(200);
    expect(payload.body.data.solo).toEqual({games:10,wins:6,losses:4,winrate:60});expect(payload.body.data.multiplayer).toEqual({games:4,wins:2,losses:2,winrate:50});
    expect(Object.keys(payload.body.data).sort()).toEqual(["userId","username","level","equipped","solo","multiplayer","rating"].sort());
    await expect(page.locator("main")).not.toContainText(/Historique|Missions|Collection|XP|Contrats/);
    for(const theme of ["light","dark"]) {
      await page.setViewportSize({width:320,height:800});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      await expect(page.locator("main")).toContainText("60 %");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await expect(page.getByRole("button",{name:"Jouer",exact:true})).toBeVisible();
      await page.screenshot({path:`test-results/friend-profile-${theme}-320.png`,fullPage:true});
    }
    const removed=await api(page,`/api/social/friends/${b.id}`,"DELETE");expect(removed.status).toBe(200);
    await page.reload();await expect(page.getByText("Ce profil n’est pas disponible.")).toBeVisible();
    await expect(page.getByRole("heading",{name:b.username,exact:true})).toHaveCount(0);
    expect((await api(page,`/api/social/friends/${b.id}/profile`)).status).toBe(404);
    await page.goto(`/friends/${a.id}`);await expect(page.getByText("Ce profil n’est pas disponible.")).toBeVisible();
  } finally {
    for(const id of games)await admin.from("multiplayer_games").delete().eq("id",id);
    for(const id of ids)await admin.auth.admin.deleteUser(id);
  }
});

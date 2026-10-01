import { cosmeticsFixture } from "../tests/helpers/profileCosmetics";
import { expect, test, type Page } from "@playwright/test";

// Presentation fixtures only. Server trust and real JWT/RLS tests remain in #102.
const userId = "11111111-1111-4111-8111-111111111111";
const username = "UnPseudoTrèsLongPourTesterLaNavigation";
async function fixture(page: Page, theme: "dark" | "light", signedIn = true) {
  await page.clock.install({time:new Date("2026-09-30T12:00:00Z")});
  let xp = 150;
  let completed = 0;
  let missionsFailure = false;
  let weeklyFailure = false;
  const user = {id:userId,aud:"authenticated",role:"authenticated",email:"ui@example.test",created_at:"2026-09-30T00:00:00Z",app_metadata:{},user_metadata:{username}};
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encoded({alg:"HS256",typ:"JWT"})}.${encoded({sub:userId,exp:Math.floor(Date.now()/1000)+3600,role:"authenticated"})}.fixture`;
  await page.addInitScript(({theme,signedIn,user,token}) => {
    localStorage.setItem("coinche:player-preferences:v1",JSON.stringify({version:1,visual:{theme}}));
    if (signedIn) localStorage.setItem("sb-127-auth-token",JSON.stringify({access_token:token,refresh_token:"fixture",token_type:"bearer",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));
  },{theme,signedIn,user,token});
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/v1/user")) data = user;
    else if (path.endsWith("/get_my_progression")) data = {total_xp:xp};
    else if (path.endsWith("/get_my_permanent_missions")) {
      if (missionsFailure) {await route.fulfill({status:500,body:"mission read failed"});return;}
      data = ["first_game","first_win","first_solo","first_multiplayer","first_training"].map((key,index) => ({key,rewardXp:[100,150,100,150,100][index],completed:index<completed,completedAt:index<completed ? "2026-10-01T00:00:00Z":null}));
    }
    else if (path.endsWith("/get_my_weekly_missions")) {
      if (weeklyFailure) {await route.fulfill({status:500,body:"weekly failure"});return;}
      data = {catalogVersion:1,weekStart:"2026-09-28",serverNow:"2026-09-30T12:00:00Z",nextResetAt:"2026-10-04T22:00:00Z",missions:[
        {key:"wins",target:3,progress:3,rewardXp:300,completed:true,completedAt:"2026-10-01T00:00:00Z"},
        {key:"solo_games",target:3,progress:1,rewardXp:200,completed:false,completedAt:null},
        {key:"training_series",target:3,progress:0,rewardXp:200,completed:false,completedAt:null}]};
    }
    else if (path.endsWith("/get_my_unlocked_profile_cosmetics")) data = cosmeticsFixture(2);
    else if (path.endsWith("/profiles")) data = [{id:userId,username}];
    else if (path.endsWith("/progression_xp_events")) data = [{amount:30,source_type:"solo_game",created_at:"2026-09-30T12:00:00Z"}];
    else if (path.endsWith("/get_my_rating_summary")) data = {rating:1000,rated_games:0,wins:0,losses:0,forfeits:0,peak_rating:1000,rank:null,position:null,placement_games:0,is_ranked:false,pending_matches:0};
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  await page.route("**/api/social**", async (route) => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{friends:[],received:[],sent:[],invitations:[],counts:{friends:0,received:0,sent:0,receivedPending:0,sentPending:0}}})}));
  await page.route("**/api/training/duo/invitations", async (route) => route.fulfill({status:200,contentType:"application/json",body:'{"data":[]}'}));
  return {setXp:(value: number) => {xp = value;},setCompleted:(value: number) => {completed = value;},failMissions:() => {missionsFailure = true;},failWeekly:()=>{weeklyFailure=true;}};
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.locator(".coinche-global-header").boundingBox())?.height).toBe(56);
}
for (const theme of ["dark","light"] as const) {
  test(`@progression-ui ${theme} desktop, mobile, profile and progression`, async ({page},info) => {
    await fixture(page,theme);
    await page.setViewportSize({width:1440,height:1000});
    for (const path of ["/","/profile","/progression"]) {
      await page.goto(path);
      await expect(page.locator(".progression-card").getByText("Niveau 2")).toBeVisible();
      await expect(page.locator(".coinche-account-link").getByText("Niv. 2")).toBeVisible();
      await noOverflow(page);
      await page.screenshot({path:info.outputPath(`${theme}-${path === "/" ? "home" : path.slice(1)}.png`),fullPage:true});
    }
    for (const width of [1120,768,568,320]) {
      await page.setViewportSize({width,height:width === 568 ? 320 : 900});
      await noOverflow(page);
      const header = page.locator(".coinche-global-header");
      if (width < 1120) {
        await expect(header.locator(".progression-account-desktop").first()).toBeHidden();
        await header.getByRole("button",{name:"Ouvrir le menu"}).click();
        const menu = page.getByRole("navigation",{name:"Navigation mobile"});
        await expect(menu.getByText("Niv. 2 · 50 / 125 XP")).toBeVisible();
        await page.screenshot({path:info.outputPath(`${theme}-menu-${width}.png`),fullPage:true});
        await page.keyboard.press("Escape");
      } else {
        const nav = (await page.getByRole("navigation",{name:"Navigation principale"}).boundingBox())!;
        const controls = (await header.locator(".col-start-3").boundingBox())!;
        expect(nav.x+nav.width).toBeLessThanOrEqual(controls.x);
      }
    }
    await page.setViewportSize({width:720,height:500}); // equivalent CSS viewport at 200% desktop zoom
    await expect(page.getByRole("heading",{level:1,name:"Niveau 2"})).toBeVisible();
    await noOverflow(page);
    await page.setViewportSize({width:1440,height:900});
    await page.locator(".progression-account").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator(".progression-card").getByText("Niveau 2")).toBeVisible();
    for (const width of [1440,1280,1120]) {
      await page.setViewportSize({width,height:900});
      await page.goto("/solo");
      const header = page.locator(".coinche-global-header");
      await expect(header.getByRole("button",{name:"Menu Partie"})).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const nav = (await header.getByRole("navigation",{name:"Navigation principale"}).boundingBox())!;
      const controls = (await header.locator(".col-start-3").boundingBox())!;
      expect(nav.x+nav.width, `game controls overlap at ${width}px`).toBeLessThanOrEqual(controls.x);
      await noOverflow(page);
    }
  });
}
test("@progression-ui shared refresh crosses the exact level threshold without reload", async ({page}) => {
  const data = await fixture(page,"dark"); data.setXp(99);
  await page.goto("/progression");
  await expect(page.getByRole("heading",{level:1})).toHaveText("Niveau 1");
  data.setXp(100);
  await page.evaluate(() => window.dispatchEvent(new Event("kffr:progression-changed")));
  await expect(page.getByRole("heading",{level:1})).toHaveText("Niveau 2");
  await expect(page.getByText("0 / 125 XP")).toBeVisible();
  await expect(page.getByText("125 XP avant le niveau 3")).toBeVisible();
});
test("@progression-ui signed-out Home stays unchanged and progression invites login", async ({page}) => {
  await fixture(page,"dark",false); await page.goto("/");
  await expect(page.locator(".progression-card")).toHaveCount(0);
  await page.goto("/progression");
  await expect(page.getByRole("heading",{level:1})).toHaveText("Connecte-toi pour suivre ta progression");
  await expect(page.locator('main a[href="/login?next=%2Fprogression"]')).toBeVisible();
});

test("@progression-ui missions update together and a mission error keeps XP visible", async ({page}) => {
  const data = await fixture(page,"light"); await page.goto("/progression");
  const missions = page.getByRole("list",{name:"Missions de départ"});
  await expect(missions.getByText("0 / 1",{exact:true})).toHaveCount(5);
  await expect(missions.getByText("+100 XP",{exact:true})).toHaveCount(3);
  await expect(missions.getByText("+150 XP",{exact:true})).toHaveCount(2);
  data.setCompleted(2);data.setXp(220);
  await page.evaluate(() => window.dispatchEvent(new Event("kffr:progression-changed")));
  await expect(missions.getByText(/Terminé/)).toHaveCount(2);
  data.setCompleted(5);
  await page.evaluate(() => window.dispatchEvent(new Event("kffr:progression-changed")));
  await expect(missions.getByText(/Terminé/)).toHaveCount(5);
  data.failMissions();
  await page.evaluate(() => window.dispatchEvent(new Event("kffr:progression-changed")));
  await expect(page.getByText("Les missions sont momentanément indisponibles.")).toBeVisible();
  await expect(page.locator(".progression-card").getByRole("progressbar")).toBeVisible();
  await noOverflow(page);
});

test("@progression-ui compact Home weekly at 320px and isolated weekly failure",async({page})=>{
 const data=await fixture(page,"dark");await page.setViewportSize({width:320,height:900});await page.goto("/");
 const weekly=page.getByRole("list",{name:"Missions hebdomadaires"});await expect(weekly.getByRole("listitem")).toHaveCount(3);
 await expect(weekly.getByRole("heading").first()).toHaveText("Solo");await noOverflow(page);
 await page.getByRole("link",{name:/Voir ma progression/}).click();await expect(weekly.getByRole("listitem")).toHaveCount(3);
 await expect(page.getByText("+300 XP")).toBeVisible();await expect(page.getByText("Missions de départ")).toBeVisible();await noOverflow(page);
 data.failWeekly();await page.evaluate(()=>window.dispatchEvent(new Event("kffr:progression-changed")));
 await expect(page.getByText(/hebdomadaires sont momentanément/)).toBeVisible();await expect(page.locator(".progression-card").getByText("Niveau 2")).toBeVisible();
 await expect(page.getByRole("list",{name:"Missions de départ"}).getByRole("listitem")).toHaveCount(5);
});

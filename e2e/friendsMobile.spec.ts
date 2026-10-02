import { expect, test, type Locator, type Page } from "@playwright/test";
import { installFriendsMobileFixture, LONG_FRIEND_USERNAME } from "./helpers/friendsMobileFixture";
import { DESKTOP_VIEWPORTS, MOBILE_VIEWPORTS, expectInsideSafeViewport, expectNoPageHorizontalOverflow, setMobileViewport, simulateSafeAreas } from "./helpers/mobile";

const viewports = [...MOBILE_VIEWPORTS, {width:768,height:900}, {width:1024,height:900}, ...DESKTOP_VIEWPORTS];
const rowFor = (page: Page, username: string) => page.locator(".friend-presence-row").filter({has:page.getByText(username,{exact:true})});
async function hitbox(control: Locator) {
  const box = await control.boundingBox(); expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
}

for (const theme of ["dark", "light"] as const) {
  for (const viewport of viewports) test(`@mobile @friends-mobile ${theme} ${viewport.width}x${viewport.height}: compact social rows, long names, actions and training`, async ({page},info) => {
    const fixture = await installFriendsMobileFixture(page,{theme, count:20, sections:true});
    await setMobileViewport(page,viewport); await page.goto("/friends"); await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading",{name:"Mes amis · 20"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"En ligne · 10"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Hors ligne · 10"})).toBeVisible();
    await expect(page.locator(".friend-presence-row")).toHaveCount(20);
    await simulateSafeAreas(page,viewport.width < 500 ? {top:47,bottom:34,left:0,right:0} : viewport.height < 500 ? {top:0,bottom:21,left:44,right:44} : {top:0,bottom:0,left:0,right:0});
    const longRow = rowFor(page,LONG_FRIEND_USERNAME); await longRow.scrollIntoViewIfNeeded();
    const identity = longRow.getByRole("link",{name:`Voir le profil de ${LONG_FRIEND_USERNAME}`});
    await expect(identity).toHaveAttribute("href",`/friends/${fixture.snapshot.friends[1].userId}`);
    await expect(identity).toHaveAttribute("title",LONG_FRIEND_USERNAME);
    await expect(identity).toHaveAccessibleDescription("Niv. 311 Hors ligne");
    await expect(longRow).toContainText("Niv. 311"); await expect(longRow).toContainText("Hors ligne");
    for (const control of [identity,longRow.getByRole("button",{name:"Jouer"}),longRow.getByRole("button",{name:"S’entraîner"}),longRow.getByRole("button",{name:/Plus d’actions/})]) await hitbox(control);
    const layout = await longRow.evaluate(row => {
      const identity=row.querySelector(".friends-identity")!.getBoundingClientRect();
      const actions=row.querySelector(".friends-actions")!.getBoundingClientRect();
      return {height:row.getBoundingClientRect().height, sameLine:Math.abs(identity.y-actions.y) < 2, actionsHeight:actions.height};
    });
    expect(layout.actionsHeight).toBeLessThanOrEqual(45);
    expect(layout.height).toBeLessThanOrEqual(viewport.width >= 640 ? 62 : 105);
    if (viewport.width >= 640) expect(layout.sameLine).toBe(true);
    const requestsBeforeMenu=fixture.requests.length;
    await longRow.getByRole("button",{name:/Plus d’actions/}).click();
    const item = page.getByRole("menuitem",{name:"Supprimer de mes amis"}); await expect(item).toBeFocused(); await hitbox(item);
    const contained = await item.evaluate(element => { const item=element.getBoundingClientRect(), list=element.closest(".friend-presence-scroll")!.getBoundingClientRect(); return item.top >= list.top && item.bottom <= list.bottom+1 && item.left >= list.left && item.right <= list.right+1; });
    expect(contained).toBe(true); await expectNoPageHorizontalOverflow(page);
    expect(fixture.requests.length).toBe(requestsBeforeMenu);
    await page.keyboard.press("Escape"); await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(longRow.getByRole("button",{name:/Plus d’actions/})).toBeFocused();
    const received = page.locator(".friends-request-row").filter({hasText:fixture.snapshot.received[0].username});
    await expect(received.locator("p[title]")).toHaveAttribute("title",fixture.snapshot.received[0].username);
    for (const control of [received.getByRole("button",{name:"Accepter"}),received.getByRole("button",{name:"Refuser"}),page.locator(".friends-request-row").getByRole("button",{name:"Annuler"})]) await hitbox(control);
    expect((await received.boundingBox())!.height).toBeLessThanOrEqual(viewport.width < 1120 ? 64 : 75);
    const invitation = page.locator(".friends-invitation-row").filter({hasText:"ABCDEF"});
    await expect(invitation.locator("p[title]")).toHaveAttribute("title",fixture.invitations.invitations[0].otherUsername);
    await expect(invitation).toContainText("expire"); for (const name of ["Rejoindre", "Refuser"]) await hitbox(invitation.getByRole("button",{name}));
    await page.getByRole("textbox",{name:"Pseudo"}).fill("Ali");
    await expect(page.locator(".friends-search-row")).toHaveCount(fixture.searchResults.length);
    await expect(page.locator(".friends-search-row").last().locator("p[title]")).toHaveAttribute("title",fixture.searchResults.at(-1)!.username);
    await expect(page.getByText("Déjà ami",{exact:true})).toBeVisible(); await expect(page.getByText("Demande envoyée",{exact:true})).toBeVisible();
    for (const control of await page.locator(".friends-search-row button").all()) await hitbox(control);
    await expectNoPageHorizontalOverflow(page);
    await page.screenshot({path:info.outputPath("friends-social-sections.png"),fullPage:true});
    await longRow.getByRole("button",{name:"S’entraîner"}).click();
    const dialog = page.getByRole("dialog",{name:`S’entraîner avec ${LONG_FRIEND_USERNAME}`});
    await expectInsideSafeViewport(page,dialog);
    const title = dialog.getByRole("heading");
    expect(await title.evaluate(element=>element.scrollWidth <= element.clientWidth)).toBe(true);
    const select = dialog.getByRole("combobox",{name:"Niveau"});
    await expect(select.locator("option")).toHaveCount(4);
    if(viewport.width < 1120) expect(await select.evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await select.scrollIntoViewIfNeeded(); await expectInsideSafeViewport(page,select);
    await expectInsideSafeViewport(page,dialog.getByRole("button",{name:"Créer le duo"}));
    await page.screenshot({path:info.outputPath("friends-training-long-title.png")});
    await expectNoPageHorizontalOverflow(page); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  });

  for (const count of [0,1] as const) test(`@mobile @friends-mobile ${theme} ${count} friend: compact empty and immediately actionable identity`,async({page})=>{
    const fixture=await installFriendsMobileFixture(page,{theme,count}); await setMobileViewport(page,{width:390,height:844}); await page.goto("/friends"); await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading",{name:`Mes amis · ${count}`})).toBeVisible(); await expect(page.locator(".friend-presence-row")).toHaveCount(count);
    if(!count) await expect(page.getByText("Tu n'as pas encore d'amis ajoutés.")).toBeVisible();
    else {const row=rowFor(page,"Alice"); await expectInsideSafeViewport(page,row); await row.getByRole("link",{name:"Voir le profil de Alice"}).click(); await expect(page).toHaveURL(new RegExp(`/friends/${fixture.snapshot.friends[0].userId}$`));}
    await expectNoPageHorizontalOverflow(page);
  });

  test(`@mobile @friends-mobile ${theme} 20 friends: density, first viewport, sticky groups and contained list scroll`,async({page},info)=>{
    await installFriendsMobileFixture(page,{theme,count:20}); await setMobileViewport(page,{width:390,height:844}); await page.goto("/friends"); await page.waitForLoadState("networkidle");
    await expect(page.locator(".friend-presence-row")).toHaveCount(20); await simulateSafeAreas(page,{top:47,bottom:34,left:0,right:0});
    const first=page.locator(".friend-presence-row").first(); await expectInsideSafeViewport(page,first);
    const scroller=page.getByTestId("friends-presence-scroll");
    const metrics=await scroller.evaluate(list=>{const bounds=list.getBoundingClientRect();return {height:list.clientHeight,scrollHeight:list.scrollHeight,visible:[...list.querySelectorAll("li")].filter(row=>{const rect=row.getBoundingClientRect();return rect.top>=bounds.top && rect.bottom<=bounds.bottom;}).length};});
    expect(metrics.visible).toBeGreaterThanOrEqual(4); expect(metrics.scrollHeight).toBeGreaterThan(metrics.height);
    await scroller.scrollIntoViewIfNeeded(); const bodyBefore=await page.evaluate(()=>scrollY);
    await scroller.evaluate(list=>{list.scrollTop=100;});
    const header=page.getByRole("heading",{name:"En ligne · 10"});
    expect(await header.evaluate(element=>getComputedStyle(element).position)).toBe("sticky");
    expect(Math.abs((await header.boundingBox())!.y-(await scroller.boundingBox())!.y)).toBeLessThanOrEqual(1);
    await scroller.evaluate(list=>{list.scrollTop=list.scrollHeight;}); await setMobileViewport(page,{width:390,height:844});
    const last=page.locator(".friend-presence-row").last(); const lastBox=(await last.boundingBox())!, listBox=(await scroller.boundingBox())!;
    expect(lastBox.y+lastBox.height).toBeLessThanOrEqual(listBox.y+listBox.height+1); expect(await page.evaluate(()=>scrollY)).toBe(bodyBefore);
    await scroller.hover();
    await page.mouse.wheel(0,450); await setMobileViewport(page,{width:390,height:844});
    expect(await page.evaluate(()=>scrollY)).toBe(bodyBefore);
    const more=last.getByRole("button",{name:/Plus d’actions/}); await more.click();
    await expectInsideSafeViewport(page,page.getByRole("menuitem",{name:"Supprimer de mes amis"}));
    await expectNoPageHorizontalOverflow(page); await page.screenshot({path:info.outputPath("friends-20-last-menu.png")});
  });

  test(`@mobile @friends-mobile ${theme} native keyboard identity/actions and inline menu closing paths`,async({page})=>{
    await installFriendsMobileFixture(page,{theme,count:20}); await setMobileViewport(page,{width:390,height:844}); await page.goto("/friends"); await page.waitForLoadState("networkidle");
    const row=rowFor(page,"Alice"), identity=row.getByRole("link",{name:"Voir le profil de Alice"}), more=row.getByRole("button",{name:/Plus d’actions/});
    await page.getByRole("button",{name:"Ouvrir le menu"}).focus(); await page.keyboard.press("Tab"); await expect(identity).toBeFocused();
    await page.keyboard.press("Tab"); await expect(row.getByRole("button",{name:"Jouer"})).toBeFocused();
    await page.keyboard.press("Tab"); await expect(row.getByRole("button",{name:"S’entraîner"})).toBeFocused();
    await page.keyboard.press("Tab"); await expect(more).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(row.getByRole("button",{name:"S’entraîner"})).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(row.getByRole("button",{name:"Jouer"})).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(identity).toBeFocused();
    await more.focus();
    await page.keyboard.press("ArrowDown"); await expect(page.getByRole("menuitem",{name:"Supprimer de mes amis"})).toBeFocused();
    for(const arrow of ["ArrowUp","ArrowDown"]){
      await page.keyboard.press("Shift+Tab"); await expect(more).toBeFocused();
      await page.keyboard.press(arrow); await expect(page.getByRole("menuitem",{name:"Supprimer de mes amis"})).toBeFocused();
    }
    await page.keyboard.press("Escape"); await expect(more).toBeFocused(); await expect(more).toHaveAttribute("aria-expanded","false");
    await more.click(); const other=rowFor(page,"Ami 03").getByRole("button",{name:/Plus d’actions/}); await other.click();
    await expect(page.getByRole("menu")).toHaveCount(1); await expect(page.getByRole("menu",{name:"Actions pour Ami 03"})).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded","false"); await page.keyboard.press("Escape"); await expect(other).toBeFocused();
    await more.click(); await more.click(); await expect(page.getByRole("menu")).toHaveCount(0);
    await more.click(); await page.getByRole("heading",{name:"Amis",exact:true}).click(); await expect(page.getByRole("menu")).toHaveCount(0); await expect(more).toBeFocused();
    await more.click(); await page.keyboard.press("Tab"); await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test(`@mobile @friends-mobile ${theme} mandatory delete confirmation, delayed mutation and refreshed snapshot`,async({page},info)=>{
    const fixture=await installFriendsMobileFixture(page,{theme,count:20}); const release=fixture.hold("remove");
    await setMobileViewport(page,{width:390,height:844}); await page.goto("/friends"); await page.waitForLoadState("networkidle"); const row=rowFor(page,LONG_FRIEND_USERNAME), more=row.getByRole("button",{name:/Plus d’actions/});
    await more.click(); page.once("dialog", async dialog=>{expect(dialog.message()).toBe(`Supprimer ${LONG_FRIEND_USERNAME} de tes amis ?`);await dialog.dismiss();});
    await page.getByRole("menuitem",{name:"Supprimer de mes amis"}).click(); expect(fixture.requests.some(request=>request.method === "DELETE")).toBe(false); await expect(row).toBeVisible();
    try {
      await more.click(); page.once("dialog",async dialog=>{expect(dialog.message()).toBe(`Supprimer ${LONG_FRIEND_USERNAME} de tes amis ?`);await dialog.accept();});
      await page.getByRole("menuitem",{name:"Supprimer de mes amis"}).click(); await expect(row.getByRole("status")).toHaveText("Suppression…");
      await expect(page.locator(".friend-presence-row")).toHaveCount(20); for(const control of await page.locator(".friend-presence-row button").all()) await expect(control).toBeDisabled();
      await page.screenshot({path:info.outputPath("friends-remove-pending.png")}); release();
      await expect(page.locator(".friend-presence-row")).toHaveCount(19); await expect(page.getByRole("status")).toHaveText(`${LONG_FRIEND_USERNAME} a été retiré de tes amis.`);
      expect(fixture.requests.filter(request=>request.method === "DELETE")).toHaveLength(1);
    } finally {release();}
  });

  for (const flow of ["play", "training"] as const) test(`@mobile @friends-mobile ${theme} pending ${flow}: blocks navigation and all concurrent social actions until the sole expected route`,async({page},info)=>{
    const fixture=await installFriendsMobileFixture(page,{theme,count:20,sections:true}); const release=fixture.hold(flow);
    await setMobileViewport(page,{width:390,height:844}); await page.goto("/friends"); await page.waitForLoadState("networkidle"); const row=rowFor(page,"Alice");
    try {
      await row.getByRole("button",{name:flow === "play" ? "Jouer" : "S’entraîner"}).click();
      if(flow === "training") await page.getByRole("dialog").getByRole("button",{name:"Créer le duo"}).click();
      await expect(row.getByRole("button",{name:"Création…"})).toBeDisabled();
      await expect(row.getByRole("link",{name:"Voir le profil de Alice"})).toHaveCount(0);
      const profile=row.getByRole("button",{name:"Voir le profil de Alice"}); await expect(profile).toBeDisabled(); await profile.dispatchEvent("click");
      for(const button of await page.locator(".friend-presence-row button, .friends-request-row button, .friends-invitation-row button").all()) {await expect(button).toBeDisabled(); await button.dispatchEvent("click");}
      await expect(page.getByRole("menuitem")).toHaveCount(0); await expect(page).toHaveURL(/\/friends$/);
      expect(fixture.requests.filter(request=>request.method === "POST" && (request.path === "/api/multiplayer/rooms" || request.path === "/api/training/duo/sessions"))).toHaveLength(1);
      expect(fixture.requests.filter(request=>request.method === "DELETE" || /friend-requests|\/resolve/.test(request.path))).toHaveLength(0);
      await page.screenshot({path:info.outputPath(`friends-${flow}-pending.png`)}); release();
      await expect(page).toHaveURL(new RegExp(`${flow === "play" ? "/multiplayer/"+fixture.roomId : "/training/duo/"+fixture.duoId}$`));
      expect(fixture.requests.filter(request=>request.method === "POST" && request.path.endsWith("/invitations"))).toHaveLength(1);
    } finally {release();}
  });

  test(`@mobile @friends-mobile ${theme} search debounce, statuses and last action survive a short keyboard viewport`,async({page},info)=>{
    const fixture=await installFriendsMobileFixture(page,{theme,count:1,sections:true});const release=fixture.hold("search");
    await setMobileViewport(page,{width:390,height:844});await page.goto("/friends"); await page.waitForLoadState("networkidle"); const input=page.getByRole("textbox",{name:"Pseudo"});
    await expect(input).toHaveAttribute("maxlength","40"); expect(await input.evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await input.fill("Al"); await expect(page.getByText("La recherche démarre à partir de 3 caractères.")).toBeVisible();
    expect(fixture.requests.filter(request=>request.path.endsWith("/search"))).toHaveLength(0);
    try {await input.fill("Ali"); await expect(page.getByText("Recherche…",{exact:true})).toBeVisible();
      await expect.poll(()=>fixture.requests.filter(request=>request.path.endsWith("/search")).length).toBe(1); release();
      await expect(page.locator(".friends-search-row")).toHaveCount(fixture.searchResults.length);
      await expect(page.getByText("Déjà ami",{exact:true})).toBeVisible();await expect(page.getByText("Demande envoyée",{exact:true})).toBeVisible();
      await page.getByRole("button",{name:"Répondre à la demande"}).click(); await expect(page.locator(`#friend-request-${fixture.snapshot.received[0].id}`)).toBeFocused();
      await input.focus(); await setMobileViewport(page,{width:390,height:380});
      const last=page.locator(".friends-search-row").last(); await last.scrollIntoViewIfNeeded(); await expectInsideSafeViewport(page,last.getByRole("button",{name:"Ajouter"}));
      await page.screenshot({path:info.outputPath("friends-search-keyboard.png")}); await last.getByRole("button",{name:"Ajouter"}).click(); await expect(page.getByRole("status")).toHaveText("Demande envoyée.");
      expect(fixture.requests.find(request=>request.path === "/api/social/friend-requests" && request.method === "POST")?.body).toEqual({recipientId:fixture.searchResults.at(-1)!.userId});
      await setMobileViewport(page,{width:390,height:844});await expect(input).toHaveValue("Ali");await expectNoPageHorizontalOverflow(page);
    }finally{release();}
  });

  for(const state of ["empty","error"] as const) test(`@mobile @friends-mobile ${theme} search ${state} remains readable`,async({page})=>{
    await installFriendsMobileFixture(page,{theme,count:0,search:state});await setMobileViewport(page,{width:320,height:568});await page.goto("/friends"); await page.waitForLoadState("networkidle");await page.getByRole("textbox",{name:"Pseudo"}).fill("Ali");
    if(state === "empty") await expect(page.getByText("Aucun joueur trouvé.")).toBeVisible();else await expect(page.getByRole("main").getByRole("alert")).toContainText("Recherche indisponible.");
    await expectNoPageHorizontalOverflow(page);
  });
}

for(const action of ["accept", "decline", "cancel"] as const) test(`@mobile @friends-mobile existing friend request ${action} callback and snapshot refresh`,async({page})=>{
  const fixture=await installFriendsMobileFixture(page,{count:1,sections:true}); const release=fixture.hold("request"); await setMobileViewport(page,{width:390,height:844});await page.goto("/friends"); await page.waitForLoadState("networkidle");
  const request=action === "cancel" ? fixture.snapshot.sent[0] : fixture.snapshot.received[0];
  const row=page.locator(".friends-request-row").filter({hasText:request.username});
  try {
  await row.getByRole("button",{name:action === "accept" ? "Accepter" : action === "decline" ? "Refuser" : "Annuler"}).click();
  await expect(row.getByRole("button",{name:action === "cancel" ? "Annulation…" : "En cours…"})).toBeDisabled(); release();
  await expect(page.getByRole("status")).toHaveText(action === "accept" ? "Demande acceptée." : action === "decline" ? "Demande refusée." : "Demande annulée.");await expect(row).toHaveCount(0);
  expect(fixture.requests.some(item=>item.path === `/api/social/friend-requests/${request.id}/${action}` && item.method === "POST")).toBe(true);
  } finally {release();}
});

test("@mobile @friends-mobile game invitation resolve retains the room query without accepting before seating",async({page})=>{
  const fixture=await installFriendsMobileFixture(page,{count:1,sections:true}); const release=fixture.hold("resolve"); await setMobileViewport(page,{width:390,height:844});await page.goto("/friends"); await page.waitForLoadState("networkidle");
  fixture.spectate();
  try {
  await page.getByRole("button",{name:"Rejoindre",exact:true}).click();
  await expect(page.getByRole("button",{name:"Vérification…"})).toBeDisabled(); release();
  await expect(page).toHaveURL(new RegExp(`/multiplayer/${fixture.roomId}\\?invitation=${fixture.invitations.invitations[0].id}$`));
  await page.waitForLoadState("networkidle");
  expect(fixture.requests.some(item=>item.path.endsWith("/resolve"))).toBe(true);
  expect(fixture.requests.some(item=>item.path.includes("/invitations/") && item.path.endsWith("/accept"))).toBe(false);
  } finally {release();}
});

for (const action of ["decline", "cancel"] as const) test(`@mobile @friends-mobile game invitation ${action} preserves delayed action and refresh`, async ({page}) => {
  const fixture = await installFriendsMobileFixture(page, {count:1,sections:true}); const release=fixture.hold("invitation");
  await setMobileViewport(page,{width:390,height:844}); await page.goto("/friends"); await page.waitForLoadState("networkidle");
  const invitation=fixture.invitations.invitations[action === "decline" ? 0 : 1]; const row=page.locator(".friends-invitation-row").filter({hasText:invitation.otherUsername});
  try {
    await row.getByRole("button",{name:action === "decline" ? "Refuser" : "Annuler"}).click();
    await expect(row.getByRole("button",{name:action === "decline" ? "Vérification…" : "Annulation…"})).toBeDisabled(); release();
    await expect(row).toHaveCount(0); await expect(page.getByRole("status")).toHaveText(action === "decline" ? "Invitation refusée." : "Invitation annulée.");
    expect(fixture.requests.some(request=>request.method === "POST" && request.path === `/api/social/invitations/${invitation.id}/${action}`)).toBe(true);
  } finally {release();}
});

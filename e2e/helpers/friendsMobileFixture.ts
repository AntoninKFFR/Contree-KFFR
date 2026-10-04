import type { Page } from "@playwright/test";
import type { GameInvitationsSnapshot, SocialSnapshot } from "../../lib/socialApi";
import { duoFixture } from "../../tests/trainingDuoClientFixtures";
import { installMobileNavigationFixture } from "./mobileNavigationFixture";

export const LONG_FRIEND_USERNAME = "Pseudo".repeat(6) + "Long";
const id = (index: number) => `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`;
type Operation = "play" | "training" | "remove" | "search" | "resolve" | "request" | "invitation";

// Presentation fixtures layer only the exercised Social endpoints over the existing
// authenticated/standalone helpers. The real authenticated suites remain unchanged.
export async function installFriendsMobileFixture(page: Page, options: { theme?: "dark" | "light"; count?: 0 | 1 | 20; sections?: boolean; search?: "ready" | "empty" | "error" } = {}, navigation?: Awaited<ReturnType<typeof installMobileNavigationFixture>>) {
  const base = navigation ?? await installMobileNavigationFixture(page, { theme: options.theme, username: "Mon pseudo", notifications: false, xp: 5 });
  const createdAt = new Date().toISOString();
  const friends = Array.from({length: options.count ?? 20}, (_, index) => ({userId:id(index+1), username:index === 0 ? "Alice" : index === 1 ? LONG_FRIEND_USERNAME : `Ami ${String(index+1).padStart(2,"0")}`, level:index === 0 ? 1 : 311, createdAt}));
  const snapshot: SocialSnapshot = {friends, received:options.sections ? [{id:id(201),userId:id(101),username:"Reçue".padEnd(40,"R"),createdAt}] : [], sent:options.sections ? [{id:id(202),userId:id(102),username:"Envoyée".padEnd(40,"E"),createdAt}] : [], counts:{friends:friends.length,received:options.sections ? 1 : 0,sent:options.sections ? 1 : 0}};
  const roomId = base.path.split("/").at(-1)!;
  const duo = duoFixture(); duo.session.id=id(300);
  const invitations: GameInvitationsSnapshot = {invitations:options.sections ? [
    {id:id(401),roomId,roomCode:"ABCDEF",inviterId:id(103),inviteeId:base.user.id,otherUsername:"Invitation".padEnd(40,"I"),status:"pending",createdAt,expiresAt:new Date(Date.now()+1800000).toISOString(),resolvedAt:null},
    {id:id(402),roomId,roomCode:"GHIJKL",inviterId:base.user.id,inviteeId:id(104),otherUsername:"Sortante".padEnd(40,"S"),status:"pending",createdAt,expiresAt:new Date(Date.now()+1800000).toISOString(),resolvedAt:null},
  ] : [],counts:{receivedPending:options.sections ? 1 : 0,sentPending:options.sections ? 1 : 0}};
  const searchResults = [{userId:id(1),username:"Alice"},...snapshot.received,...snapshot.sent,...Array.from({length:7},(_,index)=>({userId:id(110+index),username:index === 6 ? "Recherche".padEnd(40,"R") : `Résultat ${index+1}`}))];
  const requests: {method:string;path:string;body:unknown}[] = [];
  const held = new Map<Operation,{promise:Promise<void>;release:()=>void}>();
  const wait = async (operation:Operation) => { const pending=held.get(operation); if(pending) { await pending.promise; held.delete(operation); } };
  await page.route("**/api/social**", async route => {
    const path=new URL(route.request().url()).pathname, method=route.request().method();
    requests.push({method,path,body:route.request().postDataJSON()});
    let data: unknown;
    if(path === "/api/social") data=snapshot;
    else if(path === "/api/social/presence") data=method === "POST" ? true : snapshot.friends.filter((_,index)=>index%2 === 0).map(friend=>({user_id:friend.userId}));
    else if(path === "/api/social/invitations") data=invitations;
    else if(path === "/api/social/search") {
      await wait("search");
      if(options.search === "error") { await route.fulfill({status:503,json:{error:"Recherche indisponible.",code:"search_unavailable"}}); return; }
      data=options.search === "empty" ? [] : searchResults;
    } else if(method === "DELETE" && path.startsWith("/api/social/friends/")) {
      await wait("remove");
      snapshot.friends=snapshot.friends.filter(friend=>friend.userId !== path.split("/").at(-1)); snapshot.counts.friends=snapshot.friends.length;
      data={status:"removed"};
    } else if(path.endsWith("/profile")) {
      const friend=friends.find(friend=>friend.userId === path.split("/").at(-2));
      if(!friend) { await route.fallback(); return; }
      const stats={games:0,wins:0,losses:0,winrate:0};
      data={...friend,equipped:{title:null,badge:null,frame:null},solo:stats,multiplayer:stats,rating:null};
    } else if(path.endsWith("/resolve")) { await wait("resolve"); data={state:"joinable",roomId}; }
    else if(method === "POST" && path.includes("/friend-requests")) {
      await wait("request");
      const action=path.split("/").at(-1); data={status:action === "accept" ? "accepted" : action === "decline" ? "declined" : action === "cancel" ? "cancelled" : "pending"};
      snapshot.received=snapshot.received.filter(request=>request.id !== path.split("/").at(-2)); snapshot.sent=snapshot.sent.filter(request=>request.id !== path.split("/").at(-2)); snapshot.counts.received=snapshot.received.length; snapshot.counts.sent=snapshot.sent.length;
      if (action === "friend-requests") {
        const recipient=searchResults.find(result=>result.userId === route.request().postDataJSON().recipientId)!;
        snapshot.sent.push({id:id(203), userId:recipient.userId, username:recipient.username, createdAt}); snapshot.counts.sent=snapshot.sent.length;
      }
    } else if(method === "POST" && path.includes("/invitations")) {
      await wait("invitation");
      data={status:path.endsWith("/decline") ? "declined" : path.endsWith("/cancel") ? "cancelled" : "pending"};
      invitations.invitations=invitations.invitations.filter(invitation=>invitation.id !== path.split("/").at(-2));
      invitations.counts={receivedPending:invitations.invitations.filter(invitation=>invitation.inviteeId === base.user.id).length,sentPending:invitations.invitations.filter(invitation=>invitation.inviterId === base.user.id).length};
    }
    else { await route.fallback(); return; }
    await route.fulfill({status:200,json:{data}});
  });
  await page.route("**/api/multiplayer/rooms",async route=>{
    if(route.request().method() !== "POST") {await route.fallback();return;}
    requests.push({method:"POST",path:"/api/multiplayer/rooms",body:route.request().postDataJSON()}); await wait("play"); await route.fulfill({status:200,json:{data:{room:{id:roomId}}}});
  });
  await page.route("**/api/training/duo/sessions**",async route=>{
    const path=new URL(route.request().url()).pathname;
    requests.push({method:route.request().method(),path,body:route.request().postDataJSON()});
    if(path.endsWith("/invitations")) {await route.fulfill({status:200,json:{data:{id:id(500),status:"pending"}}});return;}
    if(path === "/api/training/duo/sessions" && route.request().method() === "POST") {await wait("training");duo.session.level=route.request().postDataJSON().level;}
    await route.fulfill({status:200,json:{data:duo}});
  });
  return {...base,snapshot,invitations,requests,searchResults,roomId,duoId:duo.session.id,hold:(operation:Operation)=>{
    let release!:()=>void; const promise=new Promise<void>(resolve=>{release=resolve;}); held.set(operation,{promise,release}); return release;
  }};
}

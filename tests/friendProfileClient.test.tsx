// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({fetch:vi.fn(),auth:vi.fn(),push:vi.fn(),game:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:mocks.push})}));
vi.mock("@/components/social/useFriendPresence",()=>({useFriendPresence:()=>new Set()}));
vi.mock("@/lib/friendGameActions",()=>({friendGamePath:mocks.game}));
vi.mock("@/lib/socialApi",async original=>({...await original<typeof import("@/lib/socialApi")>(),fetchFriendProfile:mocks.fetch}));
vi.mock("@/lib/supabaseClient",()=>({getSupabaseClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"a",user:{id:"actor"}}}}),onAuthStateChange:(callback:unknown)=>{mocks.auth(callback);return {data:{subscription:{unsubscribe:vi.fn()}}};}}})}));
import { FriendProfileClient } from "@/app/friends/[userId]/FriendProfileClient";
import { SocialApiError } from "@/lib/socialApi";
import { SOCIAL_CHANGED_EVENT } from "@/lib/socialEvents";
vi.stubGlobal("React",React);
const id="22222222-2222-4222-8222-222222222222";
const profile={userId:id,username:"Benjamin",level:1,equipped:{title:null,badge:null,frame:null},solo:{games:0,wins:0,losses:0,winrate:0},multiplayer:{games:0,wins:0,losses:0,winrate:0},rating:null};
afterEach(cleanup);beforeEach(()=>{vi.clearAllMocks();mocks.fetch.mockResolvedValue(profile);mocks.game.mockResolvedValue("/multiplayer/room");});
it("clears identity after friendship removal and refuses it on refresh",async()=>{
  render(<FriendProfileClient userId={id}/>);await screen.findByText("Benjamin");
  mocks.fetch.mockRejectedValue(new SocialApiError("Ce profil n’est pas disponible.",404,"friend_profile_unavailable"));
  act(()=>window.dispatchEvent(new Event(SOCIAL_CHANGED_EVENT)));
  expect(screen.queryByText("Benjamin")).toBeNull();await screen.findByText("Ce profil n’est pas disponible.");
});
it("discards delayed responses after account switch and logout",async()=>{
  let resolve:(value:typeof profile)=>void=()=>{};
  mocks.fetch.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  render(<FriendProfileClient userId={id}/>);await waitFor(()=>expect(mocks.fetch).toHaveBeenCalledOnce());
  const callback=mocks.auth.mock.calls[0][0] as (event:string,session:unknown)=>void;
  mocks.fetch.mockRejectedValue(new SocialApiError("Unavailable",404,"friend_profile_unavailable"));
  act(()=>callback("SIGNED_IN",{access_token:"b",user:{id:"other"}}));
  await screen.findByText("Ce profil n’est pas disponible.");
  await act(async()=>resolve(profile));expect(screen.queryByText("Benjamin")).toBeNull();
  act(()=>callback("SIGNED_OUT",null));await screen.findByText("Connecte-toi pour voir le profil d’un ami.");
});
it("retries transient errors and locks duplicate play clicks until navigation",async()=>{
  mocks.fetch.mockRejectedValueOnce(new Error("offline"));
  render(<FriendProfileClient userId={id}/>);await screen.findByText("Impossible de charger ce profil.");
  fireEvent.click(screen.getByRole("button",{name:"Réessayer"}));await screen.findByText("Benjamin");
  fireEvent.click(screen.getByRole("button",{name:"Jouer"}));fireEvent.click(screen.getByRole("button",{name:"Jouer"}));
  await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith("/multiplayer/room"));expect(mocks.game).toHaveBeenCalledOnce();
});

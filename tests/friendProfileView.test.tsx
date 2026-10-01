// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FriendProfileView } from "@/components/friends/FriendProfileView";
import type { FriendProfile } from "@/lib/friendProfile";
vi.stubGlobal("React",React);afterEach(cleanup);
const id="22222222-2222-4222-8222-222222222222";
const profile:FriendProfile={userId:id,username:"Benjamin",level:1,equipped:{title:null,badge:null,frame:null},solo:{games:0,wins:0,losses:0,winrate:0},multiplayer:{games:0,wins:0,losses:0,winrate:0},rating:null};
it("renders virtual level and empty basic stats without collection/rating placeholders",()=>{
  const view=render(<FriendProfileView profile={profile} state="ready" userId={id} />);
  expect(screen.getByText("Niveau 1")).toBeTruthy();expect(screen.getAllByText("0 %")).toHaveLength(2);
  expect(view.container.textContent).not.toMatch(/Collection|XP|Historique|Classement|Aucun titre|Missions/);
  expect(screen.getByRole("link",{name:"← Retour aux amis"}).getAttribute("href")).toBe("/friends");
});
it("reuses all equipped renderers and works with presence/actions",()=>{
  const onPlay=vi.fn(),onTrain=vi.fn();
  const view=render(<FriendProfileView profile={{...profile,equipped:{
    title:{key:"title_auction_master",slot:"title",name:"Maître des enchères",visualVariant:"standard"},
    badge:{key:"badge_crown",slot:"badge",name:"Couronne",visualVariant:"crown"},
    frame:{key:"frame_black_gold",slot:"frame",name:"Noir & Or",visualVariant:"black_gold"}},rating:{rating:1147,rank:"Pas mauvais IV",position:2}}}
    state="ready" userId={id} online onPlay={onPlay} onTrain={onTrain} />);
  expect(screen.getByText("Maître des enchères")).toBeTruthy();expect(view.container.querySelector(".profile-frame--black-gold")).toBeTruthy();expect(view.container.querySelector(".profile-badge")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Jouer"}));fireEvent.click(screen.getByRole("button",{name:"S’entraîner"}));expect(onPlay).toHaveBeenCalledOnce();expect(onTrain).toHaveBeenCalledOnce();expect(screen.getByText("En ligne")).toBeTruthy();
});
it.each(["loading","error","unavailable","signed-out"] as const)("hides previous identity in %s state",state=>{
  const view=render(<FriendProfileView profile={profile} state={state} userId={id} />);expect(view.container.textContent).not.toContain("Benjamin");
  if(state==="unavailable")expect(screen.getByText("Ce profil n’est pas disponible.")).toBeTruthy();
  if(state==="signed-out")expect(screen.getByRole("link",{name:"Se connecter"}).getAttribute("href")).toContain(encodeURIComponent(`/friends/${id}`));
});

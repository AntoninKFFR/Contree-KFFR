// @vitest-environment jsdom
import React from "react";
import { render,screen,cleanup,within } from "@testing-library/react";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { getMyWeeklyMissions } from "@/lib/progression/queries";
import { WeeklyMissionsCard,WeeklyProgressBar } from "@/components/progression/WeeklyMissionsCard";
import { HomeProgressionCard } from "@/components/progression/ProgressionCard";
import ProgressionPage from "@/app/progression/page";
import { getProgression } from "@/lib/progression/formulaV1";
import { resetRemainingLabel,type WeeklySnapshot } from "@/lib/progression/weeklyMissions";
import { xpSourceLabel } from "@/lib/progression/format";
const hook=vi.hoisted(()=>vi.fn());
vi.mock("@/components/progression/ProgressionProvider",()=>({useProgression:hook}));
export const fixture: WeeklySnapshot = {catalogVersion:1,weekStart:"2026-09-28",nextResetAt:"2026-10-04T22:00:00Z",missions:[
  {key:"wins",target:3,progress:0,rewardXp:300,completed:false,completedAt:null},
  {key:"solo_games",target:3,progress:2,rewardXp:200,completed:false,completedAt:null},
  {key:"training_series",target:3,progress:3,rewardXp:200,completed:true,completedAt:"2026-10-01T00:00:00Z"},
]};
beforeEach(()=>{vi.stubGlobal("React",React);hook.mockReturnValue({status:"ready",userId:"me",summary:getProgression(100),weeklySnapshot:fixture,weeklyError:false,recentEvents:[],permanentMissions:[]});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("reads only own weekly data and strips technical fields",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{...fixture,source_id:"secret"},error:null});
 expect(await getMyWeeklyMissions({rpc} as never)).toEqual(fixture);expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_weekly_missions");
});
it.each([null,{...fixture,missions:[]},{...fixture,catalogVersion:0},{...fixture,nextResetAt:"invalid"},
 {...fixture,missions:[fixture.missions[0],fixture.missions[0],fixture.missions[1]]},
 {...fixture,missions:fixture.missions.map(m=>({...m,progress:4}))},
 {...fixture,missions:fixture.missions.map(m=>({...m,rewardXp:-1}))}])("rejects invalid snapshot %j",async data=>{
 await expect(getMyWeeklyMissions({rpc:vi.fn().mockResolvedValue({data,error:null})} as never)).rejects.toThrow();
});
it("renders the three quests, targets, rewards, completion and accessible bars",()=>{
 render(<WeeklyMissionsCard/>);const list=screen.getByRole("list",{name:"Missions hebdomadaires"});expect(within(list).getAllByRole("listitem")).toHaveLength(3);
 expect(screen.getByText("En forme")).toBeTruthy();expect(screen.getByText("0 / 3")).toBeTruthy();expect(screen.getByText("2 / 3")).toBeTruthy();
 expect(screen.getByText("✓ Terminé")).toBeTruthy();expect(screen.getByText("+300 XP")).toBeTruthy();expect(screen.getAllByText("+200 XP")).toHaveLength(2);
 expect(screen.getByText(/Réinitialisation/)).toBeTruthy();const bars=screen.getAllByRole("progressbar");
 expect(bars.map(b=>[b.getAttribute("aria-valuemin"),b.getAttribute("aria-valuemax"),b.getAttribute("aria-valuenow")])).toEqual([["0","3","0"],["0","3","2"],["0","3","3"]]);
 expect(screen.queryByRole("button",{name:/réclamer/i})).toBeNull();
});
it("clamps accessible bar",()=>{render(<WeeklyProgressBar mission={{...fixture.missions[0],progress:99}}/>);expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("3");});
it("weekly failure leaves XP and permanent section visible",()=>{
 hook.mockReturnValue({...hook(),weeklyError:true,weeklySnapshot:null});render(<ProgressionPage/>);
 expect(screen.getByText(/hebdomadaires sont momentanément/)).toBeTruthy();expect(screen.getByText("Missions de départ")).toBeTruthy();expect(screen.getByRole("heading",{level:1}).textContent).toBe("Niveau 2");
});
it("Home orders incomplete before complete and keeps progression CTA",()=>{
 hook.mockReturnValue({...hook(),weeklySnapshot:{...fixture,missions:[fixture.missions[2],fixture.missions[0],fixture.missions[1]]}});render(<HomeProgressionCard/>);
 const list=screen.getByRole("list",{name:"Missions hebdomadaires"});expect(within(list).getAllByRole("heading").map(h=>h.textContent)).toEqual(["En forme","Solo","À l'entraînement"]);
 expect(screen.getByRole("link").getAttribute("href")).toBe("/progression");expect(screen.getAllByRole("progressbar")).toHaveLength(4);
});
it("signed-out Home has no weekly markup",()=>{hook.mockReturnValue({status:"signed-out",userId:null});const {container}=render(<HomeProgressionCard/>);expect(container.innerHTML).toBe("");});
it("relative clock has no business date calculation and weekly label hides IDs",()=>{
 expect(resetRemainingLabel(fixture.nextResetAt,Date.parse(fixture.nextResetAt)-3.5*86400000)).toBe("Réinitialisation dans 3 j 12 h");
 expect(resetRemainingLabel(fixture.nextResetAt,Date.parse(fixture.nextResetAt))).toContain("en cours");expect(xpSourceLabel("weekly_mission")).toBe("Mission hebdomadaire");
});

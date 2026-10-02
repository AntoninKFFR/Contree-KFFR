// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressionBar, ProgressionSummaryCard, HomeProgressionCard } from "@/components/progression/ProgressionCard";
import ProgressionPage from "@/app/progression/page";
import { getProgression } from "@/lib/progression/formulaV1";
import { formatProgressionNumber, formatXp } from "@/lib/progression/format";

const hook = vi.hoisted(() => vi.fn());
vi.mock("@/components/progression/ProgressionProvider", () => ({useProgression:hook}));
beforeEach(() => {vi.stubGlobal("React",React); hook.mockReturnValue({status:"ready",userId:"me",summary:getProgression(0),recentEvents:[],refresh:vi.fn()});});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
describe("progression presentation", () => {
  it.each([0,50,99,100])("uses canonical progress and ARIA at %i XP", (xp) => {
    const summary = getProgression(xp); render(<ProgressionBar summary={summary} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe(String(summary.xpForNextLevel));
    expect(bar.getAttribute("aria-valuenow")).toBe(String(summary.xpIntoLevel));
    expect(bar.getAttribute("aria-label")).toContain(`niveau ${summary.level}`);
    expect((bar.firstElementChild as HTMLElement).style.width).toBe(`${summary.progressPercent}%`);
  });
  it("shares real level, remaining, total and link", () => {
    render(<ProgressionSummaryCard summary={getProgression(150)} />);
    expect(screen.getByText("Niveau 2")).toBeTruthy(); expect(screen.getByText("50 / 125 XP")).toBeTruthy();
    expect(screen.getByText("75 XP avant le niveau 3")).toBeTruthy(); expect(screen.getByText("150 XP au total")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/progression");
  });
  it("Home signed-out has no markup", () => {
    hook.mockReturnValue({status:"signed-out",userId:null}); const {container} = render(<HomeProgressionCard />);
    expect(container.innerHTML).toBe("");
  });
  it("Home connected shows only progression and CTA", () => {
    render(<HomeProgressionCard />); expect(screen.getByText("Niveau 1")).toBeTruthy();
    expect(screen.getByText("0 / 100 XP")).toBeTruthy(); expect(screen.queryByText("Missions")).toBeNull();
  });
  it.each([5,1234567])("Home compact summary retains canonical level, XP, bar and link at %i XP", (xp) => {
    const summary=getProgression(xp); hook.mockReturnValue({...hook(),summary});
    const {container}=render(<HomeProgressionCard />);
    expect(screen.getByRole("heading",{level:2,name:`Niveau ${summary.level}`})).toBeTruthy();
    expect(screen.getByRole("link",{name:/Voir ma progression/}).getAttribute("href")).toBe("/progression");
    const bar=container.querySelector(".progression-card [role=progressbar]")!;
    expect(bar.getAttribute("aria-valuenow")).toBe(String(summary.xpIntoLevel));
    expect(bar.getAttribute("aria-valuemax")).toBe(String(summary.xpForNextLevel));
    expect(container.querySelector(".home-progression-xp")?.textContent).toBe(`${formatProgressionNumber(summary.xpIntoLevel)} / ${formatXp(summary.xpForNextLevel)}`);
    expect(screen.queryByText(/XP au total/)).toBeNull();
  });
  it("Home loading keeps a status and no invented level", () => {
    hook.mockReturnValue({status:"loading",userId:"me",refresh:vi.fn()});
    render(<HomeProgressionCard />);
    expect(screen.getByRole("status").textContent).toBe("Chargement de la progression…");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("Home error preserves the message and invokes the existing retry", () => {
    const refresh=vi.fn(); hook.mockReturnValue({status:"error",userId:"me",error:"Impossible de charger ta progression. Réessaie.",refresh});
    render(<HomeProgressionCard />);
    expect(screen.getByRole("status").textContent).toBe("Impossible de charger ta progression. Réessaie.");
    fireEvent.click(screen.getByRole("button",{name:"Réessayer"})); expect(refresh).toHaveBeenCalledOnce();
  });
  it.each([0,100,150])("progression page renders canonical values for %i XP", (xp) => {
    const summary = getProgression(xp); hook.mockReturnValue({status:"ready",userId:"me",summary,recentEvents:[]}); render(<ProgressionPage />);
    expect(screen.getByRole("heading",{level:1}).textContent).toBe(`Niveau ${summary.level}`);
    expect(screen.getByText(`${summary.xpIntoLevel} / ${summary.xpForNextLevel} XP`)).toBeTruthy();
    expect(screen.getByText(`${summary.xpRemaining} XP avant le niveau ${summary.level+1}`)).toBeTruthy();
    expect(screen.getByText("Missions de départ")).toBeTruthy(); expect(screen.getByText("Collection")).toBeTruthy();
    expect(screen.queryByText("Gagner 3 parties")).toBeNull();
  });
  it("provides signed-out login with a return path", () => {
    hook.mockReturnValue({status:"signed-out"}); render(<ProgressionPage />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/login?next=%2Fprogression");
  });
  it.each(["loading","error"])("keeps a clean %s state", (status) => {
    hook.mockReturnValue({status,userId:"me",error:"Impossible de charger ta progression.",refresh:vi.fn()}); render(<ProgressionPage />);
    expect(screen.getByRole("status")).toBeTruthy(); expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("recent XP uses product labels without source IDs", () => {
    hook.mockReturnValue({status:"ready",summary:getProgression(80),recentEvents:[{amount:30,sourceType:"solo_game",createdAt:"2026-09-30T12:00:00Z"},{amount:50,sourceType:"multiplayer_game",createdAt:"2026-09-30T11:00:00Z"}]});
    const {container} = render(<ProgressionPage />);
    expect(screen.getByText("+30 XP · Partie Solo")).toBeTruthy(); expect(screen.getByText("+50 XP · Multijoueur")).toBeTruthy();
    expect(container.textContent).not.toContain("source_id");
  });
});

const missionFixtures = ["first_game","first_win","first_solo","first_multiplayer","first_training"].map((key,index) =>
  ({key,rewardXp:[100,150,100,150,100][index],completed:false,completedAt:null}));
it.each([0,2,5])("shows five starter missions with %i completed", (count) => {
  hook.mockReturnValue({status:"ready",summary:getProgression(0),recentEvents:[],
    permanentMissions:missionFixtures.map((m,index) => ({...m,completed:index<count}))});
  render(<ProgressionPage />);
  expect(screen.queryAllByText("0 / 1")).toHaveLength(5-count);
  expect(screen.queryAllByText(/Terminé/)).toHaveLength(count);
  expect(screen.getAllByText("+100 XP")).toHaveLength(3);
  expect(screen.getAllByText("+150 XP")).toHaveLength(2);
  expect(screen.getByText("S'entraîner")).toBeTruthy();
  expect(screen.queryByRole("button",{name:/réclamer/i})).toBeNull();
});

it("mission error preserves summary and bar", () => {
  hook.mockReturnValue({status:"ready",summary:getProgression(220),recentEvents:[],permanentMissions:[],missionsError:true});
  render(<ProgressionPage />); expect(screen.getByRole("progressbar")).toBeTruthy();
  expect(screen.getByText("Les missions sont momentanément indisponibles.")).toBeTruthy();
});
it("permanent mission recent gains display no technical key", () => {
  hook.mockReturnValue({status:"ready",summary:getProgression(100),recentEvents:[{amount:100,sourceType:"permanent_mission",createdAt:"2026-10-01T00:00:00Z"}]});
  const {container} = render(<ProgressionPage />); expect(screen.getByText("+100 XP · Mission")).toBeTruthy();
  expect(container.textContent).not.toContain("first_training");
});

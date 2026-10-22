import { expect, it } from "vitest";
import fixtures from "../apps/mobile/tests/final-trick/states.json";
import { finishedRoomPresentation } from "@/lib/multiplayerPostgame";
import type { MultiplayerRoomView } from "@/lib/roomTypes";
for (const kind of ["round", "game"] as const) it(`same ${kind} identity: authoritative totals, last history and every viewer agree`, () => {
  const views = fixtures[kind].after as MultiplayerRoomView[];
  const canonical = views[0].game!.totalScore;
  for (const [seat, view] of views.entries()) {
    expect(view.gameId).toBe(fixtures[kind].before[seat].gameId);
    expect(view.game!.totalScore).toEqual(canonical);
    expect(view.game!.roundHistory.at(-1)!.totalScoreAfterRound).toEqual(canonical);
    expect(view.game!.roundHistory.at(-1)!.result.roundScore).toEqual(view.game!.roundScore);
    expect(view.room.status).toBe(kind === "game" ? "finished" : "playing");
    const final = finishedRoomPresentation(view.game!, view.players, view.viewerSeatIndex);
    expect(final.teams.map((team) => team.score)).toEqual([canonical[0], canonical[1]]);
    const us = seat % 2 as 0 | 1, them = (1 - us) as 0 | 1;
    // Native Nous/Eux is a projection of these same totals, never a new score.
    expect([view.game!.totalScore[us], view.game!.totalScore[them]]).toEqual([canonical[us], canonical[them]]);
  }
});

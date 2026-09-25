import { teamName } from "@/engine/players";
import { playerTeam } from "@/engine/rules";
import type { PlayerId, TeamId } from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";
import type { RoomPlayerView } from "@/lib/roomTypes";

export type FinishedTeam = {
  id: TeamId;
  name: string;
  players: [string, string];
  score: number;
  isWinner: boolean;
};

export type FinishedRoomPresentation = {
  title: string;
  teams: [FinishedTeam, FinishedTeam];
};

export function finishedRoomPresentation(
  game: Pick<PlayerGameView, "playerNames" | "totalScore" | "winnerTeam" | "endReason">,
  players: readonly RoomPlayerView[],
  viewerSeatIndex: PlayerId | null,
): FinishedRoomPresentation {
  const names = Object.fromEntries(([0, 1, 2, 3] as const).map((seat) => [
    seat,
    game.playerNames?.[seat] || players.find((player) => player.seat_index === seat)?.display_name || `Joueur ${seat + 1}`,
  ])) as Record<PlayerId, string>;
  const teams = ([0, 1] as const).map((id): FinishedTeam => {
    const seats = (id === 0 ? [0, 2] : [1, 3]) as [PlayerId, PlayerId];
    return {
      id,
      name: teamName(id, names),
      players: [names[seats[0]], names[seats[1]]],
      score: game.totalScore[id],
      isWinner: game.winnerTeam === id,
    };
  }) as [FinishedTeam, FinishedTeam];
  const viewerTeam = viewerSeatIndex === null ? null : playerTeam(viewerSeatIndex);
  const title = viewerTeam === null || game.winnerTeam === null
    ? game.endReason === "forfeit" ? "Partie terminée par abandon" : "Partie terminée"
    : `${viewerTeam === game.winnerTeam ? "Victoire" : "Défaite"}${game.endReason === "forfeit" ? " par abandon" : ""}`;
  return { title, teams };
}

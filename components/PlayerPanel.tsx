import { PLAYER_NAMES } from "@/engine/players";
import type { PlayerId } from "@/engine/types";

type PlayerPanelProps = {
  playerId: PlayerId;
  cardCount: number;
  isCurrent: boolean;
};

export function PlayerPanel({ playerId, cardCount, isCurrent }: PlayerPanelProps) {
  return (
    <div
      className={[
        "rounded-lg border bg-white px-4 py-3 shadow-sm",
        isCurrent ? "border-emerald-600" : "border-stone-200",
      ].join(" ")}
    >
      <p className="text-sm font-semibold">{PLAYER_NAMES[playerId]}</p>
      <p className="text-sm text-stone-600">{cardCount} carte{cardCount > 1 ? "s" : ""}</p>
    </div>
  );
}

import { PLAYER_NAMES } from "@/engine/players";
import type { PlayerId } from "@/engine/types";

type PlayerPanelProps = {
  playerId: PlayerId;
  cardCount: number;
  isCurrent: boolean;
  hasStartingPlayer: boolean;
};

export function PlayerPanel({
  playerId,
  cardCount,
  hasStartingPlayer,
  isCurrent,
}: PlayerPanelProps) {
  return (
    <div
      className={[
        "rounded-lg border bg-white px-4 py-3 shadow-sm",
        isCurrent ? "border-emerald-600" : "border-stone-200",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{PLAYER_NAMES[playerId]}</p>
        {hasStartingPlayer ? (
          <span className="rounded border border-emerald-600 px-1.5 py-0.5 text-xs font-bold text-emerald-700">
            P
          </span>
        ) : null}
      </div>
      <p className="text-sm text-stone-600">{cardCount} carte{cardCount > 1 ? "s" : ""}</p>
    </div>
  );
}

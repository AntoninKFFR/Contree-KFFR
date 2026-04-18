import type { PlayerId } from "@/engine/types";

type PlayerPanelProps = {
  playerId: PlayerId;
  name: string;
  isCurrent: boolean;
  hasStartingPlayer: boolean;
};

export function PlayerPanel({
  name,
  hasStartingPlayer,
  isCurrent,
}: PlayerPanelProps) {
  return (
    <div
      className={[
        "flex h-12 w-28 items-center justify-center rounded-md border bg-white px-3 text-center shadow-sm",
        isCurrent ? "border-emerald-600" : "border-stone-200",
      ].join(" ")}
    >
      <div className="flex items-center justify-center gap-2">
        <p className="text-xs font-semibold sm:text-sm">{name}</p>
        {hasStartingPlayer ? (
          <span className="rounded border border-emerald-600 px-1 py-0 text-[10px] font-bold text-emerald-700">
            P
          </span>
        ) : null}
      </div>
    </div>
  );
}

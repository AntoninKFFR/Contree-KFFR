import type { PlayerId } from "@/engine/types";

type PlayerPanelProps = {
  playerId: PlayerId;
  name: string;
  isConnected?: boolean;
  isBotTakeover?: boolean;
  isCurrent: boolean;
  hasStartingPlayer: boolean;
};

export function PlayerPanel({
  name,
  hasStartingPlayer,
  isBotTakeover = false,
  isConnected,
  isCurrent,
}: PlayerPanelProps) {
  return (
    <div
      className={[
        "flex h-10 w-20 items-center justify-center rounded-md border bg-white/95 px-2 text-center shadow-sm sm:h-12 sm:w-28 sm:px-3",
        isCurrent ? "border-emerald-600" : "border-stone-200",
      ].join(" ")}
    >
      <div className="flex items-center justify-center gap-1.5 sm:gap-2">
        <div className="min-w-0">
          <p className="max-w-[48px] truncate text-[11px] font-semibold sm:max-w-none sm:text-sm">
            {name}
          </p>
          {isConnected !== undefined ? (
            <p className="flex items-center justify-center gap-1 text-[8px] font-semibold text-stone-500 sm:text-[9px]">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-600" : "bg-stone-400"}`}
              />
              {isBotTakeover ? "Bot temporaire" : isConnected ? "En ligne" : "Hors ligne"}
            </p>
          ) : null}
        </div>
        {hasStartingPlayer ? (
          <span className="rounded border border-emerald-600 px-1 py-0 text-[10px] font-bold text-emerald-700">
            P
          </span>
        ) : null}
      </div>
    </div>
  );
}

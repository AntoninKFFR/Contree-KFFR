"use client";

import { CardView } from "@/components/CardView";
import { playerName } from "@/engine/players";
import type { PlayedCard, PlayerId } from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";
import type { GameState } from "@/engine/types";

type GameTableState = GameState | PlayerGameView;

type MobileAnnouncement = {
  label: string;
  isDominant: boolean;
  tone: "neutral" | "accent";
};

type MobileGameTableProps = {
  state: GameTableState;
  announcements: Partial<Record<PlayerId, MobileAnnouncement>>;
};

function nameForPlayer(state: GameTableState, playerId: PlayerId) {
  return playerName(playerId, state.playerNames);
}

function currentCardFor(cards: PlayedCard[], playerId: PlayerId): PlayedCard | undefined {
  return cards.find((played) => played.playerId === playerId);
}

function MobilePlayerChip({
  announcement,
  isCurrent,
  isStartingPlayer,
  name,
}: {
  announcement?: MobileAnnouncement;
  isCurrent: boolean;
  isStartingPlayer: boolean;
  name: string;
}) {
  return (
    <div
      className={[
        "rounded-lg border bg-white/92 p-2 text-center shadow-sm",
        isCurrent ? "border-emerald-500" : "border-stone-200",
        announcement?.isDominant ? "ring-1 ring-emerald-600/40" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-center gap-1">
        <p className="max-w-full truncate text-xs font-semibold text-stone-900">{name}</p>
        {isStartingPlayer ? (
          <span className="rounded border border-emerald-600 px-1 text-[9px] font-bold text-emerald-700">
            P
          </span>
        ) : null}
      </div>
      <div className="mt-1 min-h-5">
        {announcement ? (
          <span
            className={[
              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              announcement.tone === "accent"
                ? "border-stone-300 bg-white text-stone-900"
                : "border-stone-200 bg-stone-50 text-stone-500",
              announcement.isDominant ? "ring-1 ring-emerald-600/40" : "",
            ].join(" ")}
          >
            {announcement.label}
          </span>
        ) : (
          <span className="text-[10px] text-stone-400">...</span>
        )}
      </div>
    </div>
  );
}

function MobileCurrentTrick({ cards }: { cards: PlayedCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[2, 3, 1, 0].map((playerId) => {
        const played = currentCardFor(cards, playerId as PlayerId);

        return (
          <div
            className="flex min-h-[56px] items-center justify-center rounded-lg border border-white/20 bg-white/10"
            key={playerId}
          >
            {played ? (
              <CardView card={played.card} disabled muted={false} size="compact" />
            ) : (
              <span className="text-[10px] font-semibold text-white/60">...</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MobileGameTable({ state, announcements }: MobileGameTableProps) {
  if (state.phase === "bidding") {
    return (
      <section className="w-full max-w-full overflow-hidden rounded-lg border border-emerald-900/20 bg-emerald-700 px-2 py-2 text-stone-900 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          {[2, 3, 1, 0].map((playerId) => (
            <MobilePlayerChip
              announcement={announcements[playerId as PlayerId]}
              isCurrent={state.currentPlayerId === playerId}
              isStartingPlayer={state.startingPlayerId === playerId}
              key={playerId}
              name={nameForPlayer(state, playerId as PlayerId)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-full overflow-hidden rounded-lg border border-emerald-900/20 bg-emerald-700 px-2 py-2 text-white shadow-sm">
      <div className="mb-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
          {state.currentTrick.cards.length > 0 ? "Pli en cours" : "En jeu"}
        </p>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <p className="truncate text-left text-[11px] font-semibold text-white/90">
          {nameForPlayer(state, 3)}
        </p>
        <p className="truncate text-center text-[11px] font-semibold text-white/90">
          {nameForPlayer(state, 2)}
        </p>
        <p className="truncate text-right text-[11px] font-semibold text-white/90">
          {nameForPlayer(state, 1)}
        </p>
      </div>

      <div className="mx-auto mt-2 max-w-[180px]">
        <MobileCurrentTrick cards={state.currentTrick.cards} />
      </div>

      <div className="mt-2 text-center">
        <p className="truncate text-[11px] font-semibold text-white/90">{nameForPlayer(state, 0)}</p>
      </div>
    </section>
  );
}

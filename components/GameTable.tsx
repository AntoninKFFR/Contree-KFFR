import { CardView } from "@/components/CardView";
import { PlayerPanel } from "@/components/PlayerPanel";
import { formatCard } from "@/engine/cards";
import { playerName } from "@/engine/players";
import type { GameState, PlayedCard } from "@/engine/types";

type GameTableProps = {
  state: GameState;
};

function playedCardsToShow(state: GameState): { title: string; cards: PlayedCard[] } {
  if (state.currentTrick.cards.length > 0) {
    return { title: "Pli en cours", cards: state.currentTrick.cards };
  }

  const lastTrick = state.completedTricks.at(-1);
  if (lastTrick) {
    return { title: "Dernier pli", cards: lastTrick.cards };
  }

  return { title: "Pli en cours", cards: [] };
}

export function GameTable({ state }: GameTableProps) {
  const center = playedCardsToShow(state);

  return (
    <section className="relative min-h-[420px] overflow-hidden rounded-lg border border-stone-200 bg-emerald-700 text-stone-900 shadow-sm">
      <img
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        src="/table-felt.svg"
      />
      <div className="relative grid min-h-[420px] grid-cols-3 grid-rows-[auto_1fr_auto] gap-4 p-4">
        <div className="col-start-2">
          <PlayerPanel
            cardCount={state.hands[2].length}
            isCurrent={state.currentPlayerId === 2}
            playerId={2}
          />
        </div>
        <div className="row-start-2 flex items-center">
          <PlayerPanel
            cardCount={state.hands[3].length}
            isCurrent={state.currentPlayerId === 3}
            playerId={3}
          />
        </div>
        <div className="row-start-2 flex flex-col items-center justify-center gap-3">
          <h2 className="rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-sm">
            {center.title}
          </h2>
          <div className="flex min-h-32 flex-wrap items-center justify-center gap-3">
            {center.cards.length === 0 ? (
              <p className="rounded-lg bg-white px-4 py-3 text-sm text-stone-600">
                Aucune carte jouee.
              </p>
            ) : (
              center.cards.map((played) => (
                <div
                  className="flex flex-col items-center gap-1"
                  key={`${played.playerId}-${formatCard(played.card)}`}
                >
                  <CardView card={played.card} disabled />
                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold">
                    {playerName(played.playerId)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="row-start-2 flex items-center justify-end">
          <PlayerPanel
            cardCount={state.hands[1].length}
            isCurrent={state.currentPlayerId === 1}
            playerId={1}
          />
        </div>
        <div className="col-start-2 row-start-3">
          <PlayerPanel
            cardCount={state.hands[0].length}
            isCurrent={state.currentPlayerId === 0}
            playerId={0}
          />
        </div>
      </div>
    </section>
  );
}

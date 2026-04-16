import { CardView } from "@/components/CardView";
import { PlayerPanel } from "@/components/PlayerPanel";
import type { GameState, PlayedCard, PlayerId } from "@/engine/types";

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

function playedCardForPlayer(cards: PlayedCard[], playerId: PlayerId): PlayedCard | undefined {
  return cards.find((played) => played.playerId === playerId);
}

function PlayedCardSlot({
  cards,
  className,
  playerId,
}: {
  cards: PlayedCard[];
  className: string;
  playerId: PlayerId;
}) {
  const played = playedCardForPlayer(cards, playerId);

  return (
    <div className={className}>
      {played ? (
        <CardView card={played.card} disabled muted={false} size="compact" />
      ) : (
        <div className="flex h-24 w-16 items-center justify-center rounded-lg border border-dashed border-white/45 bg-white/20 text-xs font-semibold text-white/80">
          ...
        </div>
      )}
    </div>
  );
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
            hasStartingPlayer={state.startingPlayerId === 2}
            isCurrent={state.currentPlayerId === 2}
            playerId={2}
          />
        </div>
        <div className="row-start-2 flex items-center">
          <PlayerPanel
            cardCount={state.hands[3].length}
            hasStartingPlayer={state.startingPlayerId === 3}
            isCurrent={state.currentPlayerId === 3}
            playerId={3}
          />
        </div>
        <div className="row-start-2 grid min-h-64 grid-cols-[72px_92px_72px] grid-rows-[100px_52px_100px] items-center justify-items-center gap-2">
          <PlayedCardSlot cards={center.cards} className="col-start-2 row-start-1" playerId={2} />
          <PlayedCardSlot cards={center.cards} className="col-start-1 row-start-2" playerId={3} />
          <h2 className="col-start-2 row-start-2 rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold shadow-sm">
            {center.title}
          </h2>
          <PlayedCardSlot cards={center.cards} className="col-start-3 row-start-2" playerId={1} />
          <PlayedCardSlot cards={center.cards} className="col-start-2 row-start-3" playerId={0} />
        </div>
        <div className="row-start-2 flex items-center justify-end">
          <PlayerPanel
            cardCount={state.hands[1].length}
            hasStartingPlayer={state.startingPlayerId === 1}
            isCurrent={state.currentPlayerId === 1}
            playerId={1}
          />
        </div>
        <div className="col-start-2 row-start-3">
          <PlayerPanel
            cardCount={state.hands[0].length}
            hasStartingPlayer={state.startingPlayerId === 0}
            isCurrent={state.currentPlayerId === 0}
            playerId={0}
          />
        </div>
      </div>
    </section>
  );
}

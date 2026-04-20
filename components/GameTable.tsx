import { CardView } from "@/components/CardView";
import { PlayerPanel } from "@/components/PlayerPanel";
import { playerName } from "@/engine/players";
import type { GameState, PlayedCard, PlayerId } from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";

type GameTableState = GameState | PlayerGameView;

type GameTableProps = {
  state: GameTableState;
};

const TABLE_BACKGROUND_IMAGE = "/TapisKFFR.png";

function playedCardsToShow(state: GameTableState): { title: string; cards: PlayedCard[] } {
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
  playerId,
}: {
  cards: PlayedCard[];
  playerId: PlayerId;
}) {
  const played = playedCardForPlayer(cards, playerId);

  return (
    <div className="flex h-full w-full items-center justify-center">
      {played ? (
        <CardView card={played.card} disabled muted={false} size="compact" />
      ) : (
        <div className="flex h-20 w-14 items-center justify-center rounded-md border border-dashed border-white/45 bg-white/20 text-xs font-semibold text-white/80">
          ...
        </div>
      )}
    </div>
  );
}

function TrickCell({
  cards,
  className,
  playerId,
}: {
  cards: PlayedCard[];
  className: string;
  playerId: PlayerId;
}) {
  return (
    <div className={`${className} flex h-full w-full items-center justify-center`}>
      <PlayedCardSlot cards={cards} playerId={playerId} />
    </div>
  );
}

function TrickCenter({ cards, title }: { cards: PlayedCard[]; title: string }) {
  return (
    <div className="absolute left-1/2 top-1/2 grid grid-cols-[56px_88px_56px] grid-rows-[80px_80px_80px] place-items-center gap-2 -translate-x-1/2 -translate-y-1/2">
      <TrickCell cards={cards} className="col-start-2 row-start-1" playerId={2} />
      <TrickCell cards={cards} className="col-start-1 row-start-2" playerId={3} />
      <h2 className="col-start-2 row-start-2 flex items-center justify-center rounded-md bg-white px-2 py-1 text-center text-xs font-semibold shadow-sm">
        {title}
      </h2>
      <TrickCell cards={cards} className="col-start-3 row-start-2" playerId={1} />
      <TrickCell cards={cards} className="col-start-2 row-start-3" playerId={0} />
    </div>
  );
}

export function GameTable({ state }: GameTableProps) {
  const center = playedCardsToShow(state);
  const nameFor = (playerId: PlayerId) => playerName(playerId, state.playerNames);

  return (
    <section
      className="relative min-h-[320px] flex-1 overflow-hidden rounded-lg border border-emerald-900/20 bg-emerald-700 bg-cover bg-center text-stone-900 shadow-sm"
      style={{ backgroundImage: `url(${TABLE_BACKGROUND_IMAGE})` }}
    >
      <TrickCenter cards={center.cards} title={center.title} />

      <div className="absolute left-1/2 top-3 -translate-x-1/2">
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 2}
          isCurrent={state.currentPlayerId === 2}
          name={nameFor(2)}
          playerId={2}
        />
      </div>
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 3}
          isCurrent={state.currentPlayerId === 3}
          name={nameFor(3)}
          playerId={3}
        />
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 1}
          isCurrent={state.currentPlayerId === 1}
          name={nameFor(1)}
          playerId={1}
        />
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 0}
          isCurrent={state.currentPlayerId === 0}
          name={nameFor(0)}
          playerId={0}
        />
      </div>
    </section>
  );
}

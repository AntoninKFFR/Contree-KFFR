import { CardView } from "@/components/CardView";
import { cardId, sameCard, sortHand } from "@/engine/cards";
import { playerName } from "@/engine/players";
import type { Card, GameState, PlayerId, Suit } from "@/engine/types";

export function sortCardsForAnalysis(cards: Card[], trump?: Suit): Card[] {
  return sortHand(cards, trump);
}

export function AnalysisCardList({
  cards,
  chosenCard,
  label,
  trump,
}: {
  cards: Card[];
  chosenCard?: Card | null;
  label: string;
  trump?: Suit;
}) {
  const sortedCards = sortCardsForAnalysis(cards, trump);
  if (sortedCards.length === 0) {
    return <p className="text-sm text-stone-500">Aucune carte</p>;
  }

  return (
    <div aria-label={label} className="flex flex-wrap gap-1.5" role="group">
      {sortedCards.map((card) => {
        const isChosen = Boolean(chosenCard && sameCard(card, chosenCard));
        return (
          <div
            className="relative"
            data-card-id={cardId(card)}
            data-chosen={isChosen ? "true" : undefined}
            key={cardId(card)}
          >
            <CardView
              card={card}
              className={isChosen ? "ring-4 ring-amber-400 ring-offset-2" : ""}
              disabled
              muted={false}
              size="compact"
            />
            {isChosen ? (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-stone-950 shadow-sm">
                Jouée
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const BOT_POSITIONS: Array<{ playerId: PlayerId; position: string }> = [
  { playerId: 2, position: "Haut" },
  { playerId: 3, position: "Gauche" },
  { playerId: 1, position: "Droite" },
];

export function SoloBotHandsPanel({ state }: { state: GameState }) {
  return (
    <section
      aria-label="Mains des bots en mode analyse"
      className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-stone-950 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Mode analyse · mains des bots</h2>
        <p className="rounded-full bg-amber-200 px-2 py-1 text-xs font-semibold">Solo uniquement</p>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {BOT_POSITIONS.map(({ playerId, position }) => (
          <article className="rounded-md border border-amber-200 bg-white p-2" key={playerId}>
            <h3 className="mb-2 text-sm font-bold">
              {position} · P{playerId} · {playerName(playerId, state.playerNames)}
            </h3>
            <AnalysisCardList
              cards={state.hands[playerId]}
              label={`Main du bot P${playerId}, position ${position}`}
              trump={state.trump ?? undefined}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

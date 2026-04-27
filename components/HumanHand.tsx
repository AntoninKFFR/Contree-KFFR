import { CardView } from "@/components/CardView";
import { sameCard } from "@/engine/cards";
import type { Card } from "@/engine/types";

type HumanHandProps = {
  cards: Card[];
  legalCards: Card[];
  canPlay: boolean;
  onPlayCard: (card: Card) => void;
};

export function HumanHand({ cards, legalCards, canPlay, onPlayCard }: HumanHandProps) {
  return (
    <section className="shrink-0 rounded-lg border border-stone-200 bg-white/90 p-2 shadow-sm">
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <h2 className="text-sm font-semibold">Ta main</h2>
        <p className="text-xs text-stone-600">
          {canPlay ? "Choisis une carte autorisee." : "Les bots reflechissent..."}
        </p>
      </div>
      <div className="-mx-1 flex min-h-28 gap-2.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:min-h-24 sm:flex-wrap sm:justify-start sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
        {cards.map((card) => {
          const isPlayable = legalCards.some((legalCard) => sameCard(legalCard, card));

          return (
            <CardView
              card={card}
              className="coinche-card-enter"
              disabled={!canPlay}
              isPlayable={isPlayable}
              key={`${card.rank}-${card.suit}`}
              onClick={() => onPlayCard(card)}
            />
          );
        })}
      </div>
    </section>
  );
}

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
    <section className="w-full">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Ta main</h2>
        <p className="text-sm text-stone-600">
          {canPlay ? "Choisis une carte autorisee." : "Les bots reflechissent..."}
        </p>
      </div>
      <div className="flex min-h-32 flex-wrap gap-3">
        {cards.map((card) => {
          const isPlayable = legalCards.some((legalCard) => sameCard(legalCard, card));

          return (
            <CardView
              card={card}
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

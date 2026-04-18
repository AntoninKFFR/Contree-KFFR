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
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Ta main</h2>
        <p className="text-xs text-stone-600">
          {canPlay ? "Choisis une carte autorisee." : "Les bots reflechissent..."}
        </p>
      </div>
      <div className="flex min-h-24 flex-wrap justify-center gap-2 sm:justify-start">
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

import { CardView } from "@/components/CardView";
import { sameCard } from "@/engine/cards";
import type { Card } from "@/engine/types";

type HumanHandProps = {
  cards: Card[];
  legalCards: Card[];
  canPlay: boolean;
  onPlayCard: (card: Card) => void;
  embedded?: boolean;
};

export function HumanHand({
  cards,
  legalCards,
  canPlay,
  onPlayCard,
  embedded = false,
}: HumanHandProps) {
  return (
    <section
      className={
        embedded
          ? "rounded-xl border border-white/20 bg-black/20 p-2 text-white shadow-sm backdrop-blur-sm"
          : "shrink-0 rounded-lg border border-stone-200 bg-white/90 p-2 shadow-sm"
      }
    >
      <div
        className={[
          "mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
          embedded ? "mb-1" : "",
        ].join(" ")}
      >
        <h2 className={`text-sm font-semibold ${embedded ? "text-white" : ""}`}>Ta main</h2>
        <p className={`text-xs ${embedded ? "text-white/75" : "text-stone-600"}`}>
          {canPlay ? "Choisis une carte autorisee." : "Les bots reflechissent..."}
        </p>
      </div>
      <div
        className={[
          "-mx-1 flex min-h-28 gap-2.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:min-h-24 sm:flex-wrap sm:justify-start sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0",
          embedded ? "min-h-0 flex-nowrap gap-1.5 pb-0 sm:flex-nowrap sm:overflow-x-auto" : "",
        ].join(" ")}
      >
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
              size={embedded ? "compact" : "normal"}
            />
          );
        })}
      </div>
    </section>
  );
}

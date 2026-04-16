import { SUIT_SYMBOLS, cardId } from "@/engine/cards";
import type { Card } from "@/engine/types";

type CardViewProps = {
  card: Card;
  disabled?: boolean;
  isPlayable?: boolean;
  onClick?: () => void;
};

export function CardView({ card, disabled = false, isPlayable = true, onClick }: CardViewProps) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const classes = [
    "flex h-28 w-20 flex-col justify-between rounded-lg border bg-white p-2 text-left shadow-sm transition",
    isRed ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900",
    onClick && !disabled && isPlayable ? "cursor-pointer hover:-translate-y-2 hover:shadow-md" : "",
    disabled || !isPlayable ? "opacity-55" : "",
  ].join(" ");

  return (
    <button
      aria-label={`Jouer ${card.rank} ${SUIT_SYMBOLS[card.suit]}`}
      className={classes}
      disabled={disabled || !isPlayable}
      onClick={onClick}
      type="button"
    >
      <span className="text-lg font-bold">{card.rank}</span>
      <span className="self-center text-4xl">{SUIT_SYMBOLS[card.suit]}</span>
      <span className="self-end text-lg font-bold">{card.rank}</span>
      <span className="sr-only">{cardId(card)}</span>
    </button>
  );
}

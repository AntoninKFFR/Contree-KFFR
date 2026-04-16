import { SUIT_SYMBOLS, cardId } from "@/engine/cards";
import type { Card } from "@/engine/types";

type CardViewProps = {
  card: Card;
  disabled?: boolean;
  isPlayable?: boolean;
  muted?: boolean;
  onClick?: () => void;
  size?: "normal" | "compact";
};

export function CardView({
  card,
  disabled = false,
  isPlayable = true,
  muted,
  onClick,
  size = "normal",
}: CardViewProps) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const sizeClasses =
    size === "compact"
      ? "h-24 w-16 p-2"
      : "h-28 w-20 p-2";
  const rankClasses = size === "compact" ? "text-base" : "text-lg";
  const symbolClasses = size === "compact" ? "text-3xl" : "text-4xl";
  const classes = [
    "flex flex-col justify-between rounded-lg border bg-white text-left shadow-sm transition",
    sizeClasses,
    isRed ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900",
    onClick && !disabled && isPlayable ? "cursor-pointer hover:-translate-y-2 hover:shadow-md" : "",
    muted ?? (disabled || !isPlayable) ? "opacity-55" : "",
  ].join(" ");

  return (
    <button
      aria-label={`Jouer ${card.rank} ${SUIT_SYMBOLS[card.suit]}`}
      className={classes}
      disabled={disabled || !isPlayable}
      onClick={onClick}
      type="button"
    >
      <span className={`${rankClasses} font-bold`}>{card.rank}</span>
      <span className={`self-center ${symbolClasses}`}>{SUIT_SYMBOLS[card.suit]}</span>
      <span className={`self-end ${rankClasses} font-bold`}>{card.rank}</span>
      <span className="sr-only">{cardId(card)}</span>
    </button>
  );
}

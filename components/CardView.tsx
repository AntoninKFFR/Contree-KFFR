import { SUIT_SYMBOLS, cardId } from "@/engine/cards";
import type { Card } from "@/engine/types";

type CardViewProps = {
  card: Card;
  disabled?: boolean;
  isPlayable?: boolean;
  muted?: boolean;
  onClick?: () => void;
  size?: "normal" | "compact";
  className?: string;
};

export function CardView({
  card,
  disabled = false,
  isPlayable = true,
  muted,
  onClick,
  size = "normal",
  className = "",
}: CardViewProps) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const sizeClasses =
    size === "compact"
      ? "h-20 w-14 p-1.5"
      : "h-24 w-16 p-2";
  const rankClasses = size === "compact" ? "text-base" : "text-lg";
  const symbolClasses = size === "compact" ? "text-2xl" : "text-3xl";
  const classes = [
    "relative flex items-center justify-center rounded-md border bg-white text-center shadow-sm transition-all duration-200 ease-out",
    sizeClasses,
    isRed ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900",
    onClick && !disabled && isPlayable
      ? "cursor-pointer hover:-translate-y-1 hover:scale-[1.03] hover:shadow-md"
      : "",
    muted ?? (disabled || !isPlayable) ? "opacity-55" : "",
    className,
  ].join(" ");

  return (
    <button
      aria-label={`Jouer ${card.rank} ${SUIT_SYMBOLS[card.suit]}`}
      className={classes}
      disabled={disabled || !isPlayable}
      onClick={onClick}
      type="button"
    >
      <span className={`absolute left-1.5 top-1.5 ${rankClasses} font-bold leading-none`}>
        {card.rank}
      </span>
      <span className={`${symbolClasses} leading-none`}>{SUIT_SYMBOLS[card.suit]}</span>
      <span className={`absolute bottom-1.5 right-1.5 ${rankClasses} font-bold leading-none`}>
        {card.rank}
      </span>
      <span className="sr-only">{cardId(card)}</span>
    </button>
  );
}

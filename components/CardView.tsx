import { SUIT_SYMBOLS, cardId } from "@/engine/cards";
import type { Card } from "@/engine/types";

type CardViewProps = {
  card: Card;
  disabled?: boolean;
  isPlayable?: boolean;
  allowIllegalClick?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  muted?: boolean;
  onClick?: () => void;
  size?: "small" | "medium" | "large" | "normal" | "compact";
  className?: string;
};

export function CardView({
  card,
  disabled = false,
  isPlayable = true,
  allowIllegalClick = false,
  highlighted = false,
  dimmed = false,
  muted,
  onClick,
  size = "normal",
  className = "",
}: CardViewProps) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const sizeClasses =
    size === "compact"
      ? "h-16 w-11 p-1 sm:h-20 sm:w-14 sm:p-1.5"
      : size === "small"
        ? "h-20 w-14 p-1.5 sm:h-20 sm:w-14"
        : size === "large"
          ? "h-32 w-24 p-3 sm:h-28 sm:w-20"
          : "h-28 w-20 p-2.5 sm:h-24 sm:w-16 sm:p-2";
  const rankClasses = size === "compact" || size === "small" ? "text-sm sm:text-base" : size === "large" ? "text-2xl sm:text-xl" : "text-xl sm:text-lg";
  const symbolClasses = size === "compact" || size === "small" ? "text-xl sm:text-2xl" : size === "large" ? "text-5xl sm:text-4xl" : "text-4xl sm:text-3xl";
  const clickDisabled = disabled || (!isPlayable && !allowIllegalClick);
  const classes = [
    "relative flex touch-manipulation items-center justify-center rounded-md border bg-white text-center shadow-sm transition-all duration-200 ease-out",
    sizeClasses,
    isRed ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900",
    onClick && !clickDisabled
      ? "cursor-pointer hover:-translate-y-1 hover:scale-[1.03] hover:shadow-md"
      : "",
    highlighted ? "-translate-y-1 border-emerald-700 ring-2 ring-emerald-300 shadow-md" : "",
    muted ?? (disabled || dimmed) ? "opacity-55 saturate-50" : "",
    className,
  ].join(" ");

  return (
    <button
      aria-label={`Jouer ${card.rank} ${SUIT_SYMBOLS[card.suit]}`}
      className={classes}
      data-card-size={size === "normal" ? "medium" : size}
      data-dimmed={dimmed ? "true" : undefined}
      data-highlighted={highlighted ? "true" : undefined}
      data-playable={isPlayable ? "true" : "false"}
      aria-disabled={clickDisabled ? true : undefined}
      disabled={clickDisabled}
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

import { useEffect, useMemo, useState } from "react";
import { CardView } from "@/components/CardView";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { sameCard } from "@/engine/cards";
import type { Card, ContractMode } from "@/engine/types";
import { sortHandForDisplay } from "@/lib/preferences/handSorting";
import { isPreferenceAnimationEnabled } from "@/lib/preferences/presentation";

type HumanHandProps = {
  cards: Card[];
  legalCards: Card[];
  canPlay: boolean;
  onPlayCard: (card: Card) => void;
  contractMode?: ContractMode | null;
  illegalCardMessage?: (card: Card) => string;
  embedded?: boolean;
};

export function HumanHand({
  cards,
  legalCards,
  canPlay,
  onPlayCard,
  contractMode = null,
  illegalCardMessage,
  embedded = false,
}: HumanHandProps) {
  const { effectiveReducedMotion, preferences } = usePlayerPreferences();
  const [feedback, setFeedback] = useState<string | null>(null);
  const displayedCards = useMemo(
    () => sortHandForDisplay(cards, preferences.cards, contractMode),
    [cards, contractMode, preferences.cards],
  );
  useEffect(() => setFeedback(null), [canPlay, cards, legalCards]);
  useEffect(() => {
    if (!feedback) return;
    const timeoutId = window.setTimeout(() => setFeedback(null), 2_800);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);
  return (
    <section
      className={
        embedded
          ? "rounded-2xl border border-white/10 bg-[#07150f]/62 p-2 text-white shadow-xl backdrop-blur-md"
          : "relative shrink-0 rounded-2xl border border-white/10 bg-[#07150f]/82 px-2 pb-2 pt-1.5 text-white shadow-2xl backdrop-blur-md sm:px-4"
      }
    >
      <div
        className={[
          "mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
          embedded || preferences.visual.compactLayout ? "mb-1" : "",
        ].join(" ")}
      >
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#eadcb7]/75">Ta main</h2>
        <p className="text-xs text-white/55">
          {canPlay ? "Choisis une carte autorisée." : "Les bots réfléchissent…"}
        </p>
      </div>
      {feedback ? <p aria-live="polite" className={`mb-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm ${embedded ? "border-amber-200/60 bg-stone-950/80 text-white" : "border-amber-300 bg-amber-50 text-amber-950"}`} role="status">{feedback}</p> : null}
      <div
        className={[
          "-mx-1 flex min-h-28 justify-center gap-1 overflow-x-auto px-2 pb-1 sm:mx-0 sm:min-h-32 sm:flex-nowrap sm:items-end sm:justify-center sm:gap-0 sm:overflow-visible sm:px-0 sm:pb-0",
          embedded ? "min-h-0 flex-nowrap gap-1.5 pb-0 sm:flex-nowrap sm:overflow-x-auto" : "",
        ].join(" ")}
      >
        {displayedCards.map((card) => {
          const isPlayable = legalCards.some((legalCard) => sameCard(legalCard, card));

          return (
            <CardView
              card={card}
              allowIllegalClick={!preferences.assistance.disableIllegalCardClicks}
              className={`coinche-hand-card ${isPreferenceAnimationEnabled(preferences, "deal", effectiveReducedMotion) ? "coinche-card-enter" : ""}`}
              disabled={!canPlay}
              dimmed={canPlay && !isPlayable && preferences.assistance.dimIllegalCards}
              highlighted={isPlayable && canPlay && preferences.assistance.highlightLegalCards}
              isPlayable={isPlayable}
              key={`${card.rank}-${card.suit}`}
              onClick={() => {
                if (isPlayable) {
                  setFeedback(null);
                  onPlayCard(card);
                  return;
                }
                setFeedback(illegalCardMessage?.(card) ?? "Cette carte n'est pas jouable.");
              }}
              size={embedded && preferences.cards.cardSize === "medium" ? "compact" : preferences.cards.cardSize}
            />
          );
        })}
      </div>
    </section>
  );
}

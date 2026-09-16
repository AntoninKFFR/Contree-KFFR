import { type CSSProperties, useEffect, useMemo, useState } from "react";
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
  inScene?: boolean;
};

export function HumanHand({
  cards,
  legalCards,
  canPlay,
  onPlayCard,
  contractMode = null,
  illegalCardMessage,
  embedded = false,
  inScene = false,
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
        inScene
          ? "coinche-human-hand coinche-scene-hand-inner text-white"
          : embedded
          ? "coinche-human-hand rounded-2xl border border-white/10 bg-[#07150f]/62 p-2 text-white shadow-xl backdrop-blur-md"
          : "coinche-human-hand relative shrink-0 rounded-2xl border border-white/10 bg-[#07150f]/82 px-2 pb-2 pt-1.5 text-white shadow-2xl backdrop-blur-md sm:px-4"
      }
    >
      {!inScene ? <div
        className={[
          "mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
          embedded || preferences.visual.compactLayout ? "mb-1" : "",
        ].join(" ")}
      >
        <h2 className="coinche-panel-kicker text-xs font-bold uppercase tracking-[0.14em]">Ta main</h2>
      </div> : null}
      {feedback ? <p aria-live="polite" className={`mb-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm ${embedded ? "border-amber-200/60 bg-stone-950/80 text-white" : "border-amber-300 bg-amber-50 text-amber-950"}`} role="status">{feedback}</p> : null}
      <div
        className={[
          "-mx-1 flex min-h-28 justify-center gap-1 overflow-x-auto px-2 pb-1 sm:mx-0 sm:min-h-32 sm:flex-nowrap sm:items-end sm:justify-center sm:gap-0 sm:overflow-visible sm:px-0 sm:pb-0",
          embedded ? "min-h-0 flex-nowrap gap-1.5 pb-0 sm:flex-nowrap sm:overflow-x-auto" : "",
          inScene ? "coinche-scene-hand-cards" : "",
        ].join(" ")}
      >
        {displayedCards.map((card, index) => {
          const isPlayable = legalCards.some((legalCard) => sameCard(legalCard, card));

          return (
            <span className="coinche-scene-hand-card" key={`${card.rank}-${card.suit}`} style={inScene ? { "--hand-index": index, "--hand-rotation": `${(index - (displayedCards.length - 1) / 2) * 1.8}deg`, "--hand-offset": `${Math.abs(index - (displayedCards.length - 1) / 2) * 2}px` } as CSSProperties : undefined}>
            <CardView
              card={card}
              allowIllegalClick={!preferences.assistance.disableIllegalCardClicks}
              className={`coinche-hand-card ${isPreferenceAnimationEnabled(preferences, "deal", effectiveReducedMotion) ? "coinche-card-enter" : ""}`}
              disabled={!canPlay}
              dimmed={canPlay && !isPlayable && preferences.assistance.dimIllegalCards}
              highlighted={isPlayable && canPlay && preferences.assistance.highlightLegalCards}
              isPlayable={isPlayable}
              onClick={() => {
                if (isPlayable) {
                  setFeedback(null);
                  onPlayCard(card);
                  return;
                }
                setFeedback(illegalCardMessage?.(card) ?? "Cette carte n'est pas jouable.");
              }}
              size={(embedded || inScene) && preferences.cards.cardSize === "medium" ? "compact" : preferences.cards.cardSize}
            />
            </span>
          );
        })}
      </div>
    </section>
  );
}

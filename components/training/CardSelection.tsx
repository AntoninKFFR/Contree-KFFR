import * as React from "react";
import { cardId, RANKS, SUITS, SUIT_SYMBOLS } from "@/engine/cards";
import type { Card, Rank, Suit } from "@/engine/types";

const SUIT_NAMES: Record<Suit, string> = { clubs: "trèfle", diamonds: "carreau", hearts: "cœur", spades: "pique" };
const RANK_NAMES: Record<Rank, string> = { "7": "Sept", "8": "Huit", "9": "Neuf", J: "Valet", Q: "Dame", K: "Roi", "10": "Dix", A: "As" };

export function cardAccessibleName(card: Card): string {
  return `${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit]}`;
}

export function CardSelection({ cards, selectedCardIds, onToggle, disabled = false, maxSelections }: {
  cards: readonly Card[];
  selectedCardIds: readonly string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
  maxSelections?: number;
}) {
  const available = new Set(cards.map(cardId));
  return <div aria-label="Sélection des cartes" className="grid min-w-0 gap-3 sm:gap-4">
    {SUITS.map((suit) => {
      const group = RANKS.map((rank) => ({ rank, suit })).filter((card) => available.has(cardId(card)));
      if (group.length === 0) return null;
      const red = suit === "hearts" || suit === "diamonds";
      return <fieldset key={suit} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-2 sm:p-3">
        <legend className="px-1 text-sm font-bold">{SUIT_NAMES[suit]} <span aria-hidden="true" className={red ? "text-red-700" : "text-[var(--text-primary)]"}>{SUIT_SYMBOLS[suit]}</span></legend>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 sm:gap-2">
          {group.map((card) => {
            const id = cardId(card);
            const selected = selectedCardIds.includes(id);
            const unavailable = disabled || (!selected && maxSelections !== undefined && selectedCardIds.length >= maxSelections);
            return <button key={id} type="button" aria-label={cardAccessibleName(card)} aria-pressed={selected} disabled={unavailable}
              onClick={() => onToggle(id)}
              className={`min-h-11 min-w-0 rounded-lg border-2 px-0.5 py-1 text-center shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : `border-[var(--border-strong)] bg-[#fffef9] ${red ? "text-red-800" : "text-stone-900"}`} disabled:cursor-not-allowed disabled:opacity-50`}>
              <span className="block text-sm font-black leading-tight">{card.rank}</span>
              <span aria-hidden="true" className="block text-xl leading-none">{SUIT_SYMBOLS[suit]}</span>
            </button>;
          })}
        </div>
      </fieldset>;
    })}
  </div>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { SUIT_LABELS, SUIT_SYMBOLS, SUITS } from "@/engine/cards";
import { getAvailableBidValues } from "@/engine/bidding";
import type { BidValue, Contract, Suit } from "@/engine/types";

type BiddingPanelProps = {
  canBid: boolean;
  canCoinche: boolean;
  canSurcoinche: boolean;
  currentContract: Contract | null;
  compact?: boolean;
  onBid: (value: BidValue, trump: Suit) => void;
  onCoinche: () => void;
  onPass: () => void;
  onSurcoinche: () => void;
};

export function BiddingPanel({
  canBid,
  canCoinche,
  canSurcoinche,
  compact = false,
  currentContract,
  onBid,
  onCoinche,
  onPass,
  onSurcoinche,
}: BiddingPanelProps) {
  const availableValues = useMemo(
    () => getAvailableBidValues(currentContract),
    [currentContract],
  );
  const [value, setValue] = useState<BidValue | "">(availableValues[0] ?? "");
  const [trump, setTrump] = useState<Suit>("hearts");

  const canMakeBid = canBid && availableValues.length > 0;

  useEffect(() => {
    if (value === "" || !availableValues.includes(value)) {
      setValue(availableValues[0] ?? "");
    }
  }, [availableValues, value]);

  function handleBid() {
    if (!canMakeBid || value === "") return;
    onBid(value, trump);
  }

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-white/20 bg-black/20 p-2 text-white shadow-sm backdrop-blur-sm"
          : "shrink-0 rounded-lg border border-stone-200 bg-white/95 p-2 shadow-sm"
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={`text-xs uppercase tracking-wide ${compact ? "text-white/70" : "text-stone-500"}`}>
            Annonces
          </p>
          <h2 className={`text-sm font-bold ${compact ? "text-white" : ""}`}>
            {canBid ? "A toi de parler" : "Les autres joueurs annoncent..."}
          </h2>
        </div>
      </div>

      {canBid && availableValues.length === 0 ? (
        <p
          className={`mb-2 rounded-md px-2 py-1 text-xs ${
            compact ? "bg-white/15 text-white/85" : "bg-yellow-50 text-stone-700"
          }`}
        >
          {currentContract?.status === "coinched"
            ? "Contrat contré: tu peux seulement passer ou surcontrer."
            : "Le contrat est deja au maximum pour cette V1. Tu peux seulement passer."}
        </p>
      ) : null}

      <div className="grid gap-2 md:grid-cols-[120px_160px_1fr]">
        <label className={`flex flex-col gap-1 text-xs font-semibold ${compact ? "text-white/85" : "text-stone-700"}`}>
          Valeur
          <select
            className={`rounded-md px-2 py-2 text-sm ${
              compact
                ? "border border-white/20 bg-white/90 text-stone-900"
                : "border border-stone-300"
            }`}
            disabled={!canMakeBid}
            onChange={(event) => setValue(Number(event.target.value) as BidValue)}
            value={value}
          >
            {availableValues.length === 0 ? <option value="">Aucune surenchere</option> : null}
            {availableValues.map((bidValue) => (
              <option key={bidValue} value={bidValue}>
                {bidValue}
              </option>
            ))}
          </select>
        </label>

        <label className={`flex flex-col gap-1 text-xs font-semibold ${compact ? "text-white/85" : "text-stone-700"}`}>
          Atout
          <select
            className={`rounded-md px-2 py-2 text-sm ${
              compact
                ? "border border-white/20 bg-white/90 text-stone-900"
                : "border border-stone-300"
            }`}
            disabled={!canMakeBid}
            onChange={(event) => setTrump(event.target.value as Suit)}
            value={trump}
          >
            {SUITS.map((suit) => (
              <option key={suit} value={suit}>
                {SUIT_LABELS[suit]} {SUIT_SYMBOLS[suit]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
          <button
            className="rounded-md bg-stone-900 px-2 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canMakeBid}
            onClick={handleBid}
            type="button"
          >
            Annoncer
          </button>
          <button
            className="rounded-md border border-red-300 px-2 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCoinche}
            onClick={onCoinche}
            type="button"
          >
            Contrer
          </button>
          <button
            className="rounded-md border border-emerald-300 px-2 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSurcoinche}
            onClick={onSurcoinche}
            type="button"
          >
            Surcontrer
          </button>
          <button
            className="rounded-md border border-stone-300 px-2 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canBid}
            onClick={onPass}
            type="button"
          >
            Passer
          </button>
        </div>
      </div>
    </section>
  );
}

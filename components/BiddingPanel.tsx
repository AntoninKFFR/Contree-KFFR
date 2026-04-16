"use client";

import { useEffect, useMemo, useState } from "react";
import { SUIT_LABELS, SUIT_SYMBOLS, SUITS } from "@/engine/cards";
import { getAvailableBidValues } from "@/engine/bidding";
import type { BidValue, Contract, Suit } from "@/engine/types";

type BiddingPanelProps = {
  canBid: boolean;
  currentContract: Contract | null;
  onBid: (value: BidValue, trump: Suit) => void;
  onPass: () => void;
};

export function BiddingPanel({ canBid, currentContract, onBid, onPass }: BiddingPanelProps) {
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
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-sm uppercase tracking-wide text-stone-500">Annonces</p>
        <h2 className="text-xl font-bold">
          {canBid ? "A Anto de parler" : "Les autres joueurs annoncent..."}
        </h2>
      </div>

      {currentContract ? (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-stone-700">
          Contrat actuel: {currentContract.value} a {SUIT_LABELS[currentContract.trump]}{" "}
          {SUIT_SYMBOLS[currentContract.trump]}
        </p>
      ) : (
        <p className="mb-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          Aucun contrat pour l&apos;instant.
        </p>
      )}

      {canBid && availableValues.length === 0 ? (
        <p className="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-stone-700">
          Le contrat est deja au maximum pour cette V1. Anto peut seulement passer.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-stone-700">
          Valeur
          <select
            className="rounded-lg border border-stone-300 px-3 py-2"
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

        <label className="flex flex-col gap-1 text-sm font-semibold text-stone-700">
          Atout
          <select
            className="rounded-lg border border-stone-300 px-3 py-2"
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

        <div className="flex items-end gap-2">
          <button
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canMakeBid}
            onClick={handleBid}
            type="button"
          >
            Annoncer
          </button>
          <button
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
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

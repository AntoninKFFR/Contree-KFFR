"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { SUIT_LABELS, SUIT_SYMBOLS, SUITS } from "@/engine/cards";
import { canBidCapot, canBidGenerale, canBidGeneraleMode, getAvailableBidValues } from "@/engine/bidding";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import type { BidValue, Contract, ContractMode, Suit } from "@/engine/types";

type BiddingPanelProps = {
  canBid: boolean;
  canCoinche: boolean;
  canSurcoinche: boolean;
  currentContract: Contract | null;
  biddingRules?: GameRulesetSnapshot["bidding"];
  compact?: boolean;
  onBid: (value: BidValue, contractMode: ContractMode) => void;
  onCapot: (contractMode: ContractMode) => void;
  onGenerale: (contractMode: ContractMode) => void;
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
  biddingRules,
  onBid,
  onCapot,
  onGenerale,
  onCoinche,
  onPass,
  onSurcoinche,
}: BiddingPanelProps) {
  const { preferences } = usePlayerPreferences();
  const availableValues = useMemo(
    () => getAvailableBidValues(currentContract, biddingRules),
    [biddingRules, currentContract],
  );
  const [value, setValue] = useState<BidValue | "">(availableValues[0] ?? "");
  const [modeValue, setModeValue] = useState<Suit | "no-trump" | "all-trump">("hearts");
  const contractMode: ContractMode = modeValue === "no-trump" || modeValue === "all-trump"
    ? { kind: modeValue }
    : { kind: "suit", suit: modeValue };

  const canMakeBid = canBid && availableValues.length > 0;
  const canMakeCapot = canBid && canBidCapot(currentContract, biddingRules);
  const canMakeGenerale = Boolean(canBid && biddingRules && canBidGenerale(currentContract, biddingRules) && canBidGeneraleMode(contractMode, biddingRules));
  const canChooseMode = canMakeBid || canMakeCapot || canMakeGenerale;

  useEffect(() => {
    if (value === "" || !availableValues.includes(value)) {
      setValue(availableValues[0] ?? "");
    }
  }, [availableValues, value]);

  function handleBid() {
    if (!canMakeBid || value === "") return;
    onBid(value, contractMode);
  }

  function confirmed(message: string, enabled: boolean, action: () => void) {
    if (enabled && typeof window !== "undefined" && !window.confirm(message)) return;
    action();
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
            : currentContract?.kind === "generale"
              ? "Une Générale est déjà annoncée. Tu peux seulement passer ou contrer."
              : currentContract?.kind === "capot"
              ? "Un capot est déjà annoncé. Tu peux seulement passer ou contrer."
              : "Aucune enchère numérique supérieure. Le capot reste disponible."}
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
            disabled={!canChooseMode}
            onChange={(event) => setModeValue(event.target.value as typeof modeValue)}
            value={modeValue}
          >
            {SUITS.map((suit) => (
              <option key={suit} value={suit}>
                {SUIT_LABELS[suit]} {SUIT_SYMBOLS[suit]}
              </option>
            ))}
            {biddingRules?.allowNoTrump ? <option value="no-trump">Sans Atout</option> : null}
            {biddingRules?.allowAllTrump ? <option value="all-trump">Tout Atout</option> : null}
          </select>
        </label>

        <div className={`grid grid-cols-2 items-end gap-2 ${biddingRules?.allowGenerale ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
          <button
            className="rounded-md bg-stone-900 px-2 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canMakeBid}
            onClick={handleBid}
            type="button"
          >
            Annoncer
          </button>
          <button
            className="rounded-md border border-amber-300 px-2 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canMakeCapot}
            onClick={() => onCapot(contractMode)}
            type="button"
          >
            Capot
          </button>
          {biddingRules?.allowGenerale ? <button
            className="rounded-md border border-purple-300 px-2 py-2 text-xs font-semibold text-purple-800 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canMakeGenerale}
            onClick={() => confirmed("Confirmer cette Générale ?", preferences.gameplay.confirmGenerale, () => onGenerale(contractMode))}
            type="button"
          >
            Générale
          </button> : null}
          <button
            className="rounded-md border border-red-300 px-2 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCoinche}
            onClick={() => confirmed("Confirmer la Coinche ?", preferences.gameplay.confirmCoinche, onCoinche)}
            type="button"
          >
            Contrer
          </button>
          <button
            className="rounded-md border border-emerald-300 px-2 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSurcoinche}
            onClick={() => confirmed("Confirmer la Surcoinche ?", preferences.gameplay.confirmSurcoinche, onSurcoinche)}
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

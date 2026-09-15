"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { SUIT_LABELS, SUIT_SYMBOLS, SUITS } from "@/engine/cards";
import { canBidCapot, canBidGenerale, canBidGeneraleMode, getAvailableBidValues } from "@/engine/bidding";
import { formatContractLabel, formatContractMode, resolveContractMode } from "@/engine/contractMode";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import type { Bid, BidValue, Contract, ContractMode, PlayerId, Suit } from "@/engine/types";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";

export type ConfirmableBidAction = "coinche" | "surcoinche" | "capot" | "generale";

export function shouldConfirmBidAction(action: ConfirmableBidAction, preferences: PlayerPreferences): boolean {
  return action === "coinche" ? preferences.gameplay.confirmCoinche
    : action === "surcoinche" ? preferences.gameplay.confirmSurcoinche
      : action === "capot" ? preferences.gameplay.confirmCapot
        : preferences.gameplay.confirmGenerale;
}

export function bidConfirmationMessage(action: ConfirmableBidAction, contract: Contract | null, mode: ContractMode): string {
  if (action === "coinche") return `Coincher ${contract ? formatContractLabel(contract) : "ce contrat"} ?`;
  if (action === "surcoinche") return `Surcoincher ${contract ? formatContractLabel(contract) : "ce contrat"} ?`;
  return `Annoncer ${action === "capot" ? "un Capot" : "une Générale"} ${formatContractMode(mode)} ?`;
}

type BidConfirmationFocusTarget = Pick<HTMLButtonElement, "disabled" | "focus" | "isConnected">;

type BidModeValue = Suit | "no-trump" | "all-trump";

function modeValueFromContractMode(mode: ContractMode): BidModeValue {
  return mode.kind === "suit" ? mode.suit : mode.kind;
}

function lastBidModeFor(bids: Bid[], playerId: PlayerId): ContractMode | null {
  for (let index = bids.length - 1; index >= 0; index -= 1) {
    const bid = bids[index];
    if (bid.playerId !== playerId || bid.action === "pass" || bid.action === "coinche" || bid.action === "surcoinche") continue;
    const mode = resolveContractMode(bid);
    if (mode) return mode;
  }
  return null;
}

export function preferredBidMode(bids: Bid[], playerId: PlayerId, fallback: ContractMode = { kind: "suit", suit: "hearts" }): ContractMode {
  const ownMode = lastBidModeFor(bids, playerId);
  if (ownMode) return ownMode;
  const partnerId = ((playerId + 2) % 4) as PlayerId;
  return lastBidModeFor(bids, partnerId) ?? fallback;
}

export function biddingTurnKey(canBid: boolean, playerId: PlayerId | undefined, bidCount: number): string | null {
  return canBid && playerId !== undefined ? `${playerId}:${bidCount}` : null;
}

export function shouldInitializeBidMode(initializedTurnKey: string | null, currentTurnKey: string | null): boolean {
  return currentTurnKey !== null && initializedTurnKey !== currentTurnKey;
}

export function restoreBidConfirmationFocus(trigger: BidConfirmationFocusTarget | null): void {
  if (trigger?.isConnected && !trigger.disabled) trigger.focus();
}

type BiddingPanelProps = {
  bids?: Bid[];
  canBid: boolean;
  canCoinche: boolean;
  canSurcoinche: boolean;
  currentContract: Contract | null;
  biddingRules?: GameRulesetSnapshot["bidding"];
  compact?: boolean;
  playerId?: PlayerId;
  onBid: (value: BidValue, contractMode: ContractMode) => void;
  onCapot: (contractMode: ContractMode) => void;
  onGenerale: (contractMode: ContractMode) => void;
  onCoinche: () => void;
  onPass: () => void;
  onSurcoinche: () => void;
};

export function BiddingPanel({
  bids = [],
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
  playerId,
}: BiddingPanelProps) {
  const { preferences } = usePlayerPreferences();
  const availableValues = useMemo(
    () => getAvailableBidValues(currentContract, biddingRules),
    [biddingRules, currentContract],
  );
  const [value, setValue] = useState<BidValue | "">(availableValues[0] ?? "");
  const [modeValue, setModeValue] = useState<BidModeValue>("hearts");
  const [pendingConfirmation, setPendingConfirmation] = useState<{ message: string; action: () => void } | null>(null);
  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const initializedTurnKeyRef = useRef<string | null>(null);
  const contractMode: ContractMode = modeValue === "no-trump" || modeValue === "all-trump"
    ? { kind: modeValue }
    : { kind: "suit", suit: modeValue };

  const canMakeBid = canBid && availableValues.length > 0;
  const canMakeCapot = canBid && canBidCapot(currentContract, biddingRules);
  const canMakeGenerale = Boolean(canBid && biddingRules && canBidGenerale(currentContract, biddingRules) && canBidGeneraleMode(contractMode, biddingRules));
  const canChooseMode = canMakeBid || canMakeCapot || canMakeGenerale;
  const turnKey = biddingTurnKey(canBid, playerId, bids.length);

  useEffect(() => {
    if (!turnKey || playerId === undefined) {
      initializedTurnKeyRef.current = null;
      return;
    }
    if (!shouldInitializeBidMode(initializedTurnKeyRef.current, turnKey)) return;
    initializedTurnKeyRef.current = turnKey;
    const preferred = preferredBidMode(bids, playerId);
    if (preferred.kind === "no-trump" && !biddingRules?.allowNoTrump) return;
    if (preferred.kind === "all-trump" && !biddingRules?.allowAllTrump) return;
    setModeValue(modeValueFromContractMode(preferred));
  }, [biddingRules?.allowAllTrump, biddingRules?.allowNoTrump, bids, playerId, turnKey]);

  useEffect(() => {
    if (value === "" || !availableValues.includes(value)) {
      setValue(availableValues[0] ?? "");
    }
  }, [availableValues, value]);

  const dismissConfirmation = useCallback((action?: () => void) => {
    const trigger = confirmationTriggerRef.current;
    confirmationTriggerRef.current = null;
    setPendingConfirmation(null);
    action?.();
    requestAnimationFrame(() => restoreBidConfirmationFocus(trigger));
  }, []);

  useEffect(() => {
    if (!pendingConfirmation) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissConfirmation();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [dismissConfirmation, pendingConfirmation]);

  function handleBid() {
    if (!canMakeBid || value === "") return;
    onBid(value, contractMode);
  }

  function confirmed(message: string, enabled: boolean, action: () => void, trigger: HTMLButtonElement) {
    if (!enabled) { action(); return; }
    confirmationTriggerRef.current = trigger;
    setPendingConfirmation({ message, action });
  }

  return (
    <section
      className={`coinche-bidding-panel shrink-0 rounded-2xl border border-white/10 bg-[#07150f]/88 text-white shadow-2xl backdrop-blur-md ${compact ? "p-2" : "px-3 py-2.5 sm:px-4"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#e7d7ae]/60">Enchères</p><h2 className="text-sm font-black">{canBid ? "À toi de parler" : "Les autres joueurs annoncent…"}</h2></div>
        {currentContract ? <p className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/65">{formatContractLabel(currentContract)}</p> : null}
      </div>
      {pendingConfirmation ? <div aria-label="Confirmation d'enchère" aria-live="assertive" className="mb-2 rounded-xl border border-amber-200/35 bg-amber-100/10 p-3 shadow-sm" role="alertdialog"><p className="text-sm font-bold">{pendingConfirmation.message}</p><div className="mt-2 flex gap-2"><button autoFocus className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white" onClick={() => dismissConfirmation(pendingConfirmation.action)} type="button">Confirmer</button><button className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold" onClick={() => dismissConfirmation()} type="button">Annuler</button></div></div> : null}

      {canBid && availableValues.length === 0 ? (
        <p
          className="mb-2 rounded-lg bg-white/8 px-2.5 py-1.5 text-xs text-white/70"
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

      <div className={`grid gap-2 ${compact ? "grid-cols-[minmax(0,1fr)_auto]" : "lg:grid-cols-[1.15fr_1fr_1.35fr]"}`}>
        <fieldset><legend className="sr-only">Valeur</legend><div className="flex gap-1 overflow-x-auto pb-0.5">{availableValues.map((bidValue) => <button aria-label={`Valeur ${bidValue}`} aria-pressed={value === bidValue} className={`min-h-9 min-w-11 rounded-lg border px-2 text-xs font-black transition ${value === bidValue ? "border-[#e9d49d]/60 bg-[#e9d49d] text-stone-950" : "border-white/10 bg-white/5 text-white/75 hover:bg-white/12"}`} disabled={!canMakeBid} key={bidValue} onClick={() => setValue(bidValue)} type="button">{bidValue}</button>)}</div></fieldset>
        <fieldset><legend className="sr-only">Atout</legend><div className="flex gap-1 overflow-x-auto pb-0.5">{SUITS.map((suit) => <button aria-label={`Atout ${SUIT_LABELS[suit]}`} aria-pressed={modeValue === suit} className={`min-h-9 min-w-10 rounded-lg border text-lg transition ${modeValue === suit ? "border-[#e9d49d]/60 bg-white text-stone-950" : "border-white/10 bg-white/5 text-white hover:bg-white/12"}`} disabled={!canChooseMode} key={suit} onClick={() => setModeValue(suit)} type="button">{SUIT_SYMBOLS[suit]}</button>)}{biddingRules?.allowNoTrump ? <button aria-label="Atout Sans Atout" aria-pressed={modeValue === "no-trump"} className={`min-h-9 min-w-10 rounded-lg border px-2 text-[10px] font-black ${modeValue === "no-trump" ? "border-[#e9d49d]/60 bg-white text-stone-950" : "border-white/10 bg-white/5"}`} disabled={!canChooseMode} onClick={() => setModeValue("no-trump")} type="button">SA</button> : null}{biddingRules?.allowAllTrump ? <button aria-label="Atout Tout Atout" aria-pressed={modeValue === "all-trump"} className={`min-h-9 min-w-10 rounded-lg border px-2 text-[10px] font-black ${modeValue === "all-trump" ? "border-[#e9d49d]/60 bg-white text-stone-950" : "border-white/10 bg-white/5"}`} disabled={!canChooseMode} onClick={() => setModeValue("all-trump")} type="button">TA</button> : null}</div></fieldset>
        <div className={`grid grid-cols-3 gap-1 ${compact ? `col-span-2 ${biddingRules?.allowGenerale ? "grid-cols-6" : "grid-cols-5"}` : biddingRules?.allowGenerale ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
          <button
            className="rounded-lg bg-emerald-600 px-2 py-2 text-xs font-black text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canMakeBid}
            onClick={handleBid}
            type="button"
          >
            Annoncer
          </button>
          <button
            className="rounded-lg border border-[#e9d49d]/25 bg-[#e9d49d]/10 px-2 py-2 text-xs font-bold text-[#f5e6bd] hover:bg-[#e9d49d]/20 disabled:opacity-35"
            disabled={!canMakeCapot}
            onClick={(event) => confirmed(bidConfirmationMessage("capot", currentContract, contractMode), shouldConfirmBidAction("capot", preferences), () => onCapot(contractMode), event.currentTarget)}
            type="button"
          >
            Capot
          </button>
          {biddingRules?.allowGenerale ? <button
            className="rounded-lg border border-purple-300/25 bg-purple-300/10 px-2 py-2 text-xs font-bold text-purple-100 hover:bg-purple-300/20 disabled:opacity-35"
            disabled={!canMakeGenerale}
            onClick={(event) => confirmed(bidConfirmationMessage("generale", currentContract, contractMode), shouldConfirmBidAction("generale", preferences), () => onGenerale(contractMode), event.currentTarget)}
            type="button"
          >
            Générale
          </button> : null}
          <button
            className="rounded-lg border border-red-300/25 bg-red-300/10 px-2 py-2 text-xs font-bold text-red-100 hover:bg-red-300/20 disabled:opacity-35"
            disabled={!canCoinche}
            onClick={(event) => confirmed(bidConfirmationMessage("coinche", currentContract, contractMode), shouldConfirmBidAction("coinche", preferences), onCoinche, event.currentTarget)}
            type="button"
          >
            Contrer
          </button>
          <button
            className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-2 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-35"
            disabled={!canSurcoinche}
            onClick={(event) => confirmed(bidConfirmationMessage("surcoinche", currentContract, contractMode), shouldConfirmBidAction("surcoinche", preferences), onSurcoinche, event.currentTarget)}
            type="button"
          >
            Surcontrer
          </button>
          <button
            className="rounded-lg border border-white/12 bg-white/5 px-2 py-2 text-xs font-bold text-white/80 hover:bg-white/12 disabled:opacity-35"
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

"use client";

import { useEffect, useRef, useState } from "react";
import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import type { CountingReplay } from "@/engine/training/counting";
import type { Card } from "@/engine/types";
import { appPrimaryActionClass } from "@/components/ui/AppShell";
import { announcementLine, playerInSentence, playerLabel } from "@/components/training/countingCopy";

export type ReplaySpeed = "step" | "slow" | "normal" | "fast";

/** "Pas à pas" has no timer at all: the replay never forces a pace on the player. */
export const REPLAY_SPEEDS: readonly { id: ReplaySpeed; label: string; delayMs: number | null }[] = [
  { id: "step", label: "Pas à pas", delayMs: null },
  { id: "slow", label: "Lent", delayMs: 4000 },
  { id: "normal", label: "Normal", delayMs: 2500 },
  { id: "fast", label: "Rapide", delayMs: 1200 },
];

const STATUS_LABELS = { normal: "", coinched: " · coinché", surcoinched: " · surcoinché" } as const;

function ReplayCard({ card, player, winner }: { card: Card; player: string; winner: boolean }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return <li className="min-w-0 text-center">
    <div
      aria-label={`${player} : ${card.rank} de ${SUIT_LABELS[card.suit]}${winner ? ", remporte le pli" : ""}`}
      className={`coinche-card relative mx-auto flex aspect-[0.7] w-full max-w-20 items-center justify-center rounded-lg border bg-[#fffef9] shadow-lg ${winner ? "ring-2 ring-[var(--accent)]" : ""} ${red ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900"}`}
    >
      <span className="absolute left-1.5 top-1.5 text-lg font-bold leading-none">{card.rank}</span>
      <span aria-hidden="true" className="text-3xl sm:text-4xl">{SUIT_SYMBOLS[card.suit]}</span>
      <span className="absolute bottom-1.5 right-1.5 text-lg font-bold leading-none">{card.rank}</span>
    </div>
    <p className={`mt-2 truncate text-xs ${winner ? "font-black text-[var(--accent)]" : "font-semibold text-[var(--text-secondary)]"}`}>{player}</p>
  </li>;
}

type TrickReplayProps = {
  replay: CountingReplay;
  speed: ReplaySpeed;
  onSpeedChange: (speed: ReplaySpeed) => void;
  onFinished: () => void;
};

/** Shows tricks one at a time with public information only: never trick points or running totals. */
export function TrickReplay({ replay, speed, onSpeedChange, onFinished }: TrickReplayProps) {
  const [shown, setShown] = useState(0);
  const finish = useRef(onFinished);
  useEffect(() => { finish.current = onFinished; }, [onFinished]);

  const last = replay.tricks.length - 1;
  const delay = REPLAY_SPEEDS.find((option) => option.id === speed)?.delayMs ?? null;
  const advance = () => (shown < last ? setShown(shown + 1) : finish.current());

  useEffect(() => {
    if (delay === null) return;
    const timer = setTimeout(() => (shown < last ? setShown(shown + 1) : finish.current()), delay);
    return () => clearTimeout(timer);
  }, [delay, last, shown]);

  const { contract, contractMode, playerNames } = replay;
  const trick = replay.tricks[shown];
  const trump = contractMode.kind === "suit" ? contractMode.suit : null;
  const announcements = replay.beloteMoments.filter((moment) => moment.trickIndex === shown);

  return <section aria-label="Rejeu de la donne" className="min-w-0">
    <p className="text-sm text-[var(--text-secondary)]">
      Contrat : <strong className="text-[var(--text-primary)]">{contract.value}{trump ? ` ${SUIT_SYMBOLS[trump]} ${SUIT_LABELS[trump]}` : ""}</strong>,
      {" "}pris par {playerInSentence(contract.playerId, playerNames)}{STATUS_LABELS[contract.status]}
    </p>
    <div aria-live="polite" className="mt-4">
      <p className="text-lg font-black">Pli {shown + 1} / 8</p>
      <ol aria-label={`Cartes du pli ${shown + 1}`} className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-3">
        {trick.cards.map(({ playerId, card }) =>
          <ReplayCard card={card} key={`${shown}-${playerId}`} player={playerLabel(playerId, playerNames)} winner={playerId === trick.winnerId} />)}
      </ol>
      <p className="mt-3 text-sm">Pli remporté par <strong>{playerInSentence(trick.winnerId, playerNames)}</strong>.</p>
      {announcements.map((moment) => <p className="mt-1 text-sm font-bold text-[var(--accent)]" key={moment.kind}>
        {announcementLine(moment.playerId, playerNames, moment.kind)}
      </p>)}
    </div>
    <div aria-label="Vitesse du rejeu" className="mt-5 flex flex-wrap gap-1.5" role="group">
      {REPLAY_SPEEDS.map((option) => <button
        aria-pressed={speed === option.id}
        className={`min-h-11 rounded-xl border px-3 text-sm font-bold touch-manipulation ${speed === option.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "coinche-secondary-action"}`}
        key={option.id}
        onClick={() => onSpeedChange(option.id)}
        type="button"
      >{option.label}</button>)}
    </div>
    {delay === null
      ? <button className={`${appPrimaryActionClass} mt-3 w-full sm:w-auto`} onClick={advance} type="button">{shown < last ? "Pli suivant" : "Répondre"}</button>
      : null}
  </section>;
}

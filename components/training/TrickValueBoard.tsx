import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { formatContractMode } from "@/engine/contractMode";
import type { TrickValueExercise } from "@/engine/training/trickValue";
import type { Card } from "@/engine/types";

function TrainingCard({ card, index }: { card: Card; index: number }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return <li className="min-w-0 text-center">
    <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Carte {index + 1}</p>
    <div aria-label={`${card.rank} de ${SUIT_LABELS[card.suit]}`} className={`coinche-card relative mx-auto flex aspect-[0.7] w-full max-w-20 items-center justify-center rounded-lg border bg-[#fffef9] shadow-lg ${red ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900"}`}>
      <span className="absolute left-1.5 top-1.5 text-lg font-bold leading-none">{card.rank}</span>
      <span aria-hidden="true" className="text-3xl sm:text-4xl">{SUIT_SYMBOLS[card.suit]}</span>
      <span className="absolute bottom-1.5 right-1.5 text-lg font-bold leading-none">{card.rank}</span>
    </div>
  </li>;
}

export function TrickValueBoard({ exercise }: { exercise: TrickValueExercise }) {
  const trump = exercise.contractMode.kind === "suit" ? exercise.contractMode.suit : null;
  const redTrump = trump === "hearts" || trump === "diamonds";
  return <>
    <p className="text-lg font-black">Combien vaut ce pli ?</p>
    <div className="mt-3 flex items-center gap-3" aria-label={trump ? `Atout ${SUIT_LABELS[trump]}` : formatContractMode(exercise.contractMode)}>
      <span className="text-xs font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">Atout</span>
      {trump ? <span aria-hidden="true" className={`flex h-14 w-14 items-center justify-center rounded-xl border text-5xl leading-none shadow-sm ${redTrump ? "border-red-200 bg-[#fff5ed] text-red-700" : "border-stone-300 bg-[#fffef9] text-stone-900"}`}>{SUIT_SYMBOLS[trump]}</span> : <span>{formatContractMode(exercise.contractMode)}</span>}
    </div>
    <ol aria-label="Cartes du pli" className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-3">
      {exercise.cards.map((played, cardIndex) => <TrainingCard card={played.card} index={cardIndex} key={`${played.playerId}-${cardIndex}`} />)}
    </ol>
    {exercise.isLastTrick ? <div className="mt-4 flex items-center gap-3 text-xs font-bold tracking-wide text-[var(--accent)]"><span className="h-px flex-1 bg-[var(--border-strong)]" /><span>Dernier pli · 10 de der</span><span className="h-px flex-1 bg-[var(--border-strong)]" /></div> : null}
  </>;
}

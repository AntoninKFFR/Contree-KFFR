import { cardId, SUIT_SYMBOLS } from "@/engine/cards";
import { cardAccessibleName } from "@/components/training/CardSelection";
import type { MemoryExercise } from "@/engine/training/memory";
import type { PlayedCard } from "@/engine/types";

function PlayedCards({ cards, exercise }: { cards: PlayedCard[]; exercise: MemoryExercise }) {
  return <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
    {cards.map(({ card, playerId }) => <li key={cardId(card)} className="min-w-0 rounded-lg border border-[var(--border-strong)] bg-[#fffef9] p-1.5 text-center text-stone-900 shadow-sm">
      <span aria-label={cardAccessibleName(card)} className={card.suit === "hearts" || card.suit === "diamonds" ? "font-black text-red-800" : "font-black"}>
        {card.rank}<span aria-hidden="true">{SUIT_SYMBOLS[card.suit]}</span>
      </span>
      <span className="block truncate text-[10px] text-stone-700">{exercise.playerNames[playerId]}</span>
    </li>)}
  </ol>;
}

export function MemoryStudyPhase({ exercise, onAnswer }: { exercise: MemoryExercise; onAnswer: () => void }) {
  return <section aria-label="Phase d’observation">
    <p className="font-semibold">Observe les cartes jouées dans l’ordre des plis, puis mémorise-les.</p>
    <p className="mt-1 text-sm text-[var(--text-secondary)]">Atout : {SUIT_SYMBOLS[exercise.trump]}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {exercise.observation.completedTricks.map((cards, index) => <div key={index} className="rounded-xl border border-[var(--border)] p-2">
        <h2 className="mb-2 text-sm font-black">Pli {index + 1}</h2>
        <PlayedCards cards={cards} exercise={exercise} />
      </div>)}
      {exercise.observation.currentCards.length > 0 ? <div className="rounded-xl border border-[var(--border)] p-2">
        <h2 className="mb-2 text-sm font-black">Pli en cours</h2>
        <PlayedCards cards={exercise.observation.currentCards} exercise={exercise} />
      </div> : null}
    </div>
    {exercise.observation.ownHand ? <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
      <h2 className="mb-2 text-sm font-black">Ta main</h2>
      <p className="flex flex-wrap gap-1.5">{exercise.observation.ownHand.map((card) => <span key={cardId(card)} aria-label={cardAccessibleName(card)} className="rounded-md border border-[var(--border)] bg-[#fffef9] px-2 py-1 font-bold text-stone-900">{card.rank}{SUIT_SYMBOLS[card.suit]}</span>)}</p>
    </div> : null}
    <button type="button" className="mt-5 min-h-11 rounded-xl bg-[var(--accent)] px-5 py-2 font-bold text-white" onClick={onAnswer}>Répondre</button>
  </section>;
}

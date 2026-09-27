"use client";

import { useState, type FormEvent } from "react";
import { appPrimaryActionClass } from "@/components/ui/AppShell";
import { BID_READING_ASSERTION_LABELS, type BidReadingAnswer, type BidReadingExercise } from "@/engine/training/bidReading";
import type { BidPromiseAssertion } from "@/bots/strategy/advancedRulesBidReading";

export function BidReadingForm({ exercise, onAnswer }: {
  exercise: BidReadingExercise;
  onAnswer: (answer: BidReadingAnswer) => void;
}) {
  const [selected, setSelected] = useState<BidPromiseAssertion[]>([]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAnswer({ selectedAssertionIds: selected });
  };
  return <form onSubmit={submit}>
    <fieldset>
      <legend className="text-base font-black">Que peux-tu affirmer sur cette enchère ?</legend>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Coche uniquement les affirmations garanties par l’annonce publique. Il peut n’y en avoir aucune.</p>
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
        {exercise.assertionChoices.map((id) => <label key={id} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm">
          <input type="checkbox" checked={selected.includes(id)} onChange={() => setSelected((old) => old.includes(id)
            ? old.filter((value) => value !== id) : [...old, id])} />
          <span>{BID_READING_ASSERTION_LABELS[id]}</span>
        </label>)}
      </div>
    </fieldset>
    <button className={`${appPrimaryActionClass} mt-4 min-h-11`} type="submit">Valider</button>
  </form>;
}

import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import type { GameState } from "@/engine/types";

type ScoreBoardProps = {
  state: GameState;
  onNewGame: () => void;
};

export function ScoreBoard({ state, onNewGame }: ScoreBoardProps) {
  return (
    <aside className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-stone-500">Atout</p>
          <p className="text-2xl font-bold">
            {SUIT_LABELS[state.trump]} {SUIT_SYMBOLS[state.trump]}
          </p>
        </div>
        <button
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
          onClick={onNewGame}
          type="button"
        >
          Nouvelle partie
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-emerald-50 p-3">
          <p className="text-sm text-stone-600">Equipe Anto + Boulais</p>
          <p className="text-3xl font-bold">{state.trickPoints[0]}</p>
        </div>
        <div className="rounded-lg bg-yellow-50 p-3">
          <p className="text-sm text-stone-600">Equipe Max + Allan</p>
          <p className="text-3xl font-bold">{state.trickPoints[1]}</p>
        </div>
      </div>

      <p className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">{state.message}</p>
    </aside>
  );
}

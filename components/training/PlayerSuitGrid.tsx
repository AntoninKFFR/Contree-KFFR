import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { voidCellId } from "@/engine/training/opponentVoids";
import type { PlayerId, Suit } from "@/engine/types";

export type PlayerSuitGridFeedback = {
  correctCells: readonly string[];
  missedCells: readonly string[];
  unprovedCells: readonly string[];
};

export function PlayerSuitGrid({ players, suits, selected, onToggle, disabled = false, feedback }: {
  players: readonly { id: PlayerId; name: string }[];
  suits: readonly Suit[];
  selected: readonly string[];
  onToggle: (cell: string) => void;
  disabled?: boolean;
  feedback?: PlayerSuitGridFeedback;
}) {
  const otherPlayers = players.filter(({ id }) => id !== 0);
  const columns = `minmax(0, 1.1fr) repeat(${suits.length}, minmax(44px, 1fr))`;
  return <div aria-label="Grille des coupures" className="w-full min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-2 sm:p-3" role="group">
    <div className="grid min-w-0 gap-1.5 sm:gap-2" style={{ gridTemplateColumns: columns }}>
      <span aria-hidden="true" />
      {suits.map((suit) => <span key={suit} aria-label={SUIT_LABELS[suit]} className={`min-w-0 rounded-lg bg-[#fffef9] text-center text-lg font-black ${suit === "hearts" || suit === "diamonds" ? "text-red-800" : "text-stone-900"}`}>
        <span aria-hidden="true">{SUIT_SYMBOLS[suit]}</span>
      </span>)}
      {otherPlayers.flatMap(({ id, name }) => [
        <span key={`player-${id}`} className="flex min-w-0 items-center text-xs font-bold leading-tight sm:text-sm">{name}{id === 2 ? <span className="sr-only"> (partenaire)</span> : null}</span>,
        ...suits.map((suit) => {
          const key = voidCellId(id, suit);
          const pressed = selected.includes(key);
          const status = feedback ? feedback.correctCells.includes(key) ? "Prouvé ✓"
            : feedback.missedCells.includes(key) ? "Oublié !"
              : feedback.unprovedCells.includes(key) ? "Pas prouvé ×" : "Pas prouvé" : pressed ? "Coché" : "Non coché";
          const style = feedback?.correctCells.includes(key) ? "border-green-600 bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"
            : feedback?.missedCells.includes(key) ? "border-amber-600 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
              : feedback?.unprovedCells.includes(key) ? "border-red-600 bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100"
                : pressed ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)] bg-[var(--surface)]";
          return <button key={key} type="button" aria-pressed={pressed} aria-label={`${name} · ${SUIT_LABELS[suit]} · ${status}`}
            className={`min-h-12 min-w-0 rounded-xl border-2 px-0.5 py-1 text-[10px] font-black leading-tight touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:text-xs ${style}`}
            data-cell={key} data-feedback={feedback ? status : undefined} disabled={disabled} onClick={() => onToggle(key)}>
            <span aria-hidden="true" className="block text-base">{pressed ? "✓" : feedback?.missedCells.includes(key) ? "!" : "○"}</span>
            <span>{status}</span>
          </button>;
        }),
      ])}
    </div>
  </div>;
}

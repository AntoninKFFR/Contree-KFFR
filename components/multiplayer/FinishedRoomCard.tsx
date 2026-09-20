import { appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";

export function FinishedRoomCard({
  isHost, isResettingRoom, onRematch, onReturn, outcome, scores,
}: {
  isHost: boolean;
  isResettingRoom: boolean;
  onRematch: () => void;
  onReturn: () => void;
  outcome: string;
  scores: Record<0 | 1, number>;
}) {
  return <section className="coinche-app-surface w-full rounded-2xl border p-5 shadow-xl sm:p-7">
    <p className="coinche-ui-kicker text-xs font-semibold uppercase tracking-wide">Partie terminée</p>
    <h2 className="mt-2 text-2xl font-bold text-[color:var(--text-primary)]">{outcome}</h2>
    <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
      {[0, 1].map((team) => <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-[color:var(--text-secondary)]" key={team}>
        <span className="block text-xs font-semibold">Score équipe {team}</span>
        <strong className="mt-1 block text-xl text-[color:var(--text-primary)]">{scores[team as 0 | 1]}</strong>
      </p>)}
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {isHost ? <button className={appPrimaryActionClass} disabled={isResettingRoom} onClick={onRematch} type="button">{isResettingRoom ? "Préparation…" : "Rejouer"}</button> : null}
      <button className={appSecondaryActionClass} onClick={onReturn} type="button">Retour à la table</button>
    </div>
  </section>;
}

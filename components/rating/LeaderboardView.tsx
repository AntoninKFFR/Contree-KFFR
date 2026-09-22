import { AppSurface, appSecondaryActionClass } from "@/components/ui/AppShell";
import type { LeaderboardEntry } from "@/lib/rating/queries";

export type LeaderboardViewProps = {
  state: "loading" | "error" | "ready";
  entries: LeaderboardEntry[];
  page: number;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRetry: () => void;
};

export function LeaderboardView({ state, entries, page, hasNext, onPrevious, onNext, onRetry }: LeaderboardViewProps) {
  return (
    <AppSurface className="p-4 sm:p-6">
      {state === "loading" ? (
        <p className="py-6 text-sm text-[var(--text-muted)]" role="status">Chargement du classement…</p>
      ) : state === "error" ? (
        <div className="space-y-4 py-4">
          <p className="text-sm text-[var(--text-secondary)]" role="alert">Impossible de charger le classement pour le moment.</p>
          <button className={appSecondaryActionClass} onClick={onRetry} type="button">Réessayer</button>
        </div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-sm text-[var(--text-muted)]">Aucun joueur classé pour le moment.</p>
      ) : (
        <div>
          <div aria-hidden="true" className="hidden grid-cols-[4rem_minmax(0,1fr)_7rem_minmax(10rem,12rem)] gap-3 border-b border-[var(--border)] px-3 pb-3 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)] sm:grid">
            <span>#</span><span>Joueur</span><span>Elo</span><span>Rang</span>
          </div>
          <ol className="divide-y divide-[var(--border)]">
            {entries.map((entry) => (
              <li
                className={`grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-xl px-3 py-3 sm:grid-cols-[4rem_minmax(0,1fr)_7rem_minmax(10rem,12rem)] sm:items-center ${entry.position === 1 ? "bg-[var(--accent-soft)]" : ""}`}
                key={entry.username}
              >
                <span className={`col-start-1 row-start-1 font-bold ${entry.position <= 3 ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>#{entry.position}</span>
                <span className="col-start-2 row-start-1 min-w-0 break-words font-semibold text-[var(--text-primary)]">{entry.username}</span>
                <span className="col-start-3 row-start-1 whitespace-nowrap text-right font-bold tabular-nums text-[var(--text-primary)] sm:text-left">{new Intl.NumberFormat("fr-FR").format(entry.rating)}</span>
                <span className="col-span-2 col-start-2 row-start-2 text-sm text-[var(--text-secondary)] sm:col-auto sm:row-auto">{entry.rank}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {state === "ready" && (page > 0 || hasNext) ? (
        <nav aria-label="Pages du classement" className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <button aria-label="Page précédente du classement" className={appSecondaryActionClass} disabled={page === 0} onClick={onPrevious} type="button">Précédent</button>
          <span className="text-xs font-semibold text-[var(--text-muted)]">Page {page + 1}</span>
          <button aria-label="Page suivante du classement" className={appSecondaryActionClass} disabled={!hasNext} onClick={onNext} type="button">Suivant</button>
        </nav>
      ) : null}
    </AppSurface>
  );
}

import { appPrimaryActionClass } from "@/components/ui/AppShell";
import type { FinishedRatingState } from "@/components/multiplayer/useFinishedRatingResult";
import type { FinishedRoomPresentation } from "@/lib/multiplayerPostgame";

function RatingResult({ state }: { state: FinishedRatingState }) {
  if (state.kind === "hidden") return null;
  let content;
  if (state.kind === "loading") content = <p>Lecture du résultat Elo…</p>;
  else if (state.kind === "unrated") content = <p>Partie non classée</p>;
  else if (state.kind === "error") content = <p>Résultat Elo indisponible pour le moment.</p>;
  else if (state.result.status === "pending") content = <p>Calcul Elo en cours…</p>;
  else if (state.result.status === "void") content = <p>Résultat Elo annulé.</p>;
  else {
    const { delta, ratingBefore, ratingAfter } = state.result;
    const signedDelta = delta! > 0 ? `+${delta}` : String(delta);
    content = <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <strong aria-label={`Variation Elo KFFR : ${delta! > 0 ? `plus ${delta}` : delta! < 0 ? `moins ${Math.abs(delta!)}` : "zéro"} points`}
        className="text-3xl font-black tabular-nums text-[color:var(--text-primary)]">{signedDelta}</strong>
      <span className="text-sm font-semibold tabular-nums text-[color:var(--text-secondary)]">{ratingBefore} → {ratingAfter}</span>
    </div>;
  }
  return <section aria-label="Elo KFFR" className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-[color:var(--text-secondary)]">
    <h2 className="mb-1 text-xs font-black uppercase tracking-wider text-[color:var(--text-primary)]">Elo KFFR</h2>
    {content}
  </section>;
}

export function FinishedRoomCard({
  isHost, isResettingRoom, onRematch, presentation, rating,
}: {
  isHost: boolean;
  isResettingRoom: boolean;
  onRematch: () => void;
  presentation: FinishedRoomPresentation;
  rating: FinishedRatingState;
}) {
  return <section aria-label="Résultat de la partie" className="coinche-app-surface w-full rounded-2xl border p-4 shadow-xl sm:p-7">
    <p className="coinche-ui-kicker text-xs font-semibold uppercase tracking-wide">Partie terminée</p>
    <h1 className="mt-1 text-3xl font-black text-[color:var(--text-primary)] sm:text-4xl">{presentation.title}</h1>
    <div className="my-5 grid gap-3 sm:grid-cols-2">
      {presentation.teams.map((team) => <section aria-label={team.name}
        className={`min-w-0 rounded-xl border px-4 py-3 ${team.isWinner ? "border-[color:var(--border-strong)] bg-[color:var(--accent-soft)]" : "border-[color:var(--border)] bg-[color:var(--surface-muted)]"}`}
        key={team.id}>
        <h2 className="truncate text-base font-bold text-[color:var(--text-primary)]">{team.name}</h2>
        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{team.players.join(" · ")}</p>
        <p className="mt-3 text-3xl font-black tabular-nums text-[color:var(--text-primary)]">{team.score}<span className="ml-1 text-xs font-semibold text-[color:var(--text-secondary)]">points</span></p>
        {team.isWinner ? <p className="mt-1 text-xs font-bold text-[color:var(--text-primary)]">Équipe gagnante</p> : null}
      </section>)}
    </div>
    <RatingResult state={rating} />
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {isHost ? <button className={`${appPrimaryActionClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]`}
        disabled={isResettingRoom} onClick={onRematch} type="button">{isResettingRoom ? "Retour en cours…" : "Retour au lobby"}</button>
        : <p className="text-sm text-[color:var(--text-secondary)]">En attente de l’hôte pour revenir au lobby.</p>}
    </div>
  </section>;
}

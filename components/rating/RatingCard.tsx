import { AppEyebrow, AppSurface, appSecondaryActionClass } from "@/components/ui/AppShell";
import { RankEmblem } from "@/components/rating/RankEmblem";
import { getRatingProgress } from "@/lib/rating/formulaV1";
import type { RatingSummary } from "@/lib/rating/queries";

export type RatingCardProps =
  | { state: "loading" | "error"; summary?: never }
  | { state: "ready"; summary: RatingSummary };

const formatElo = (rating: number) => `${new Intl.NumberFormat("fr-FR").format(rating)} Elo`;

export function RatingCard(props: RatingCardProps) {
  const summary = props.state === "ready" ? props.summary : null;
  const progress = summary?.isRanked ? getRatingProgress(summary.rating) : null;

  return (
    <AppSurface className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <AppEyebrow>Elo officiel</AppEyebrow>
          <h2 className="mt-2 text-xl font-bold text-[var(--text-primary)]">Classement Contrée</h2>
        </div>
        {summary && summary.pendingMatches > 0 ? (
          <p aria-live="polite" className="rounded-full border border-[var(--border-strong)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]" role="status">
            Mise à jour du classement en cours
          </p>
        ) : null}
      </div>

      {props.state === "loading" ? (
        <p className="mt-5 text-sm text-[var(--text-muted)]" role="status">Chargement du classement…</p>
      ) : props.state === "error" ? (
        <p className="mt-5 text-sm text-[var(--text-secondary)]" role="alert">Impossible de charger le classement pour le moment.</p>
      ) : summary ? (
        <div className="mt-5 space-y-5">
          {!summary.isRanked && summary.ratedGames < 5 ? (
            <div className="space-y-3 py-2 text-center sm:text-left">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">Placement</p>
                <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">{summary.placementGames} / 5 parties</p>
                <p className="mt-1 text-xl font-bold text-[var(--text-secondary)]">{formatElo(summary.rating)}</p>
              </div>
              <ProgressBar label="Progression du placement" max={5} value={summary.placementGames} />
              <p className="text-sm text-[var(--text-muted)]">
                {summary.ratedGames === 0
                  ? "Joue 5 parties de Contrée classique pour obtenir ton rang."
                  : `Encore ${5 - summary.ratedGames} partie${5 - summary.ratedGames > 1 ? "s" : ""} classée${5 - summary.ratedGames > 1 ? "s" : ""} pour apparaître au classement.`}
              </p>
            </div>
          ) : !summary.isRanked ? (
            <div className="space-y-3 py-2">
              <p className="text-3xl font-black tracking-tight text-[var(--text-primary)]">{formatElo(summary.rating)}</p>
              <p className="text-sm text-[var(--text-secondary)]">Ajoute un pseudo pour apparaître dans le classement.</p>
              <a className={appSecondaryActionClass} href="#profile-username">Modifier mon pseudo</a>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center">
                <RankEmblem decorative rating={summary.rating} showDivision size="xl" />
                <p className="mt-4 text-2xl font-black text-[var(--text-primary)]">{summary.rank}</p>
                <p className="mt-1 text-3xl font-black tracking-tight text-[var(--text-primary)]">{formatElo(summary.rating)}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">#{summary.position} au classement</p>
              </div>
              {progress?.nextRank && progress.pointsIntoRank !== null && progress.pointsToNextRank !== null ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap justify-between gap-2 text-sm text-[var(--text-secondary)]">
                    <span>Vers {progress.nextRank}</span>
                    <span>{progress.pointsIntoRank} / {progress.pointsToNextRank} Elo</span>
                  </div>
                  <ProgressBar label={`Progression vers ${progress.nextRank}`} max={progress.pointsToNextRank} value={progress.pointsIntoRank} />
                </div>
              ) : progress?.nextRank ? (
                <p className="text-sm text-[var(--text-secondary)]">Encore {progress.pointsRemaining} Elo vers {progress.nextRank}.</p>
              ) : (
                <p className="text-sm font-semibold text-[var(--text-secondary)]">Rang maximal</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 text-sm sm:grid-cols-4">
            <Stat label="Parties classées" value={summary.ratedGames} />
            <Stat label="Victoires" value={summary.wins} />
            <Stat label="Défaites" value={summary.losses} />
            <Stat label="Pic Elo" value={summary.peakRating} />
          </div>
        </div>
      ) : null}
    </AppSurface>
  );
}

function ProgressBar({ label, max, value }: { label: string; max: number; value: number }) {
  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value}
      className="h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]"
      role="progressbar"
    >
      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 font-bold text-[var(--text-primary)]">{new Intl.NumberFormat("fr-FR").format(value)}</p>
    </div>
  );
}

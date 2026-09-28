import Link from "next/link";
import type { ReactNode } from "react";
import { appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { cardAccessibleName } from "@/components/training/CardSelection";
import { SUIT_SYMBOLS } from "@/engine/cards";
import type { Card } from "@/engine/types";

export function TrainingCardFace({ card }: { card: Card }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return <span aria-label={cardAccessibleName(card)} className={`coinche-card relative flex h-16 w-11 shrink-0 items-center justify-center rounded-lg border bg-[#fffef9] shadow-sm sm:h-20 sm:w-14 ${red ? "border-red-200 text-red-700" : "border-stone-300 text-stone-900"}`}>
    <span className="absolute left-1 top-1 text-xs font-black">{card.rank}</span><span aria-hidden="true" className="text-2xl">{SUIT_SYMBOLS[card.suit]}</span>
  </span>;
}

export function TrainingSectionHeader({ kicker, title, description, id }: { kicker: string; title: string; description: string; id: string }) {
  return <header className="training-section-heading" id={id}>
    <span className="training-kicker">{kicker}</span>
    <h2>{title}</h2>
    <p>{description}</p>
  </header>;
}

export function TrainingLevelTrack({ title, current, total, href, names }: {
  title: string; current: number; total: number; href: (level: number) => string; names?: Record<number, string>;
}) {
  return <div className="training-levels" aria-label={`Niveaux de ${title}`}>
    <span className="training-kicker">Niveaux</span>
    <div className="training-level-track">{Array.from({ length: total }, (_, index) => index + 1).map((level) => level <= current
      ? <Link key={level} href={href(level)} aria-label={`Niveau ${level}${names?.[level] ? ` · ${names[level]}` : ""}`} aria-current={level === current ? "step" : undefined} className="training-level training-level-available">{level}</Link>
      : <span key={level} aria-label={`Niveau ${level} verrouillé`} className="training-level training-level-locked">{level}</span>)}</div>
    {current < total ? <p className="training-lock-note">Niveau {current + 1} verrouillé · Réussis 8/10 au niveau précédent.</p> : null}
  </div>;
}

export function TrainingModeCard({ title, description, level, levelName, record, accountRecord, href, action = "Jouer", children, featured = false }: {
  title: string; description: string; level?: number; levelName?: string; record?: string; accountRecord?: string;
  href?: string; action?: string; children?: ReactNode; featured?: boolean;
}) {
  return <article className={`training-mode-card${featured ? " training-mode-card-featured" : ""}`}>
    <div><h3>{title}</h3><p className="training-card-description">{description}</p></div>
    {level ? <p className="training-card-level">Niveau {level}{levelName ? ` · ${levelName}` : ""}</p> : null}
    {children}
    <div className="training-card-bottom">
      {record ? <p className="training-card-record">{record}</p> : null}
      {accountRecord ? <p className="training-card-record">Compte · {accountRecord}</p> : null}
      {href ? <Link className={`${appPrimaryActionClass} training-card-action`} href={href}>{action}</Link> : null}
    </div>
  </article>;
}

export function TrainingSessionHeader({ title, level, levelName, index, total, score, backLabel = "Retour à l’entraînement", backHref = "/training", heading }: {
  title: string; level?: number; levelName?: string; index: number; total: number; score?: number; backLabel?: string; backHref?: string; heading?: string;
}) {
  return <header className="training-session-header">
    <Link href={backHref} className="coinche-ui-link training-back-link">← {backLabel}</Link>
    <div className="training-session-title"><div><span className="training-kicker">Entraînement</span><h1>{heading ?? title}</h1><p>{level ? `Niveau ${level}${levelName ? ` · ${levelName}` : ""}` : levelName}</p></div>
      {score !== undefined ? <p className="training-score">Score <strong>{score}</strong></p> : null}</div>
    <div className="training-progress-copy"><span aria-label={`Exercice ${index} sur ${total}`}>Exercice {index} / {total}</span><span>{Math.round((index / total) * 100)} %</span></div>
    <div className="training-progress-track" role="progressbar" aria-label="Progression de la série" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}><span style={{ width: `${index / total * 100}%` }} /></div>
  </header>;
}

export function TrainingResultSummary({ title, level, levelName, score, total, best, unlocked, children }: {
  title: string; level?: number; levelName?: string; score: number; total: number; best?: string; unlocked?: string; children: ReactNode;
}) {
  return <section className="training-result" aria-label="Résultat de la série">
    <span className="training-kicker">Série terminée{level ? ` · Niveau ${level}` : ""}{levelName ? ` · ${levelName}` : ""}</span>
    <h1>Résultat</h1><p className="training-result-score">{score} <span>/ {total}</span></p>
    <p className="training-result-message">{Math.round(score / total * 100)} % de bonnes réponses</p>
    {best ? <p className="training-result-best">{best}</p> : null}
    {unlocked ? <p className="training-unlocked" role="status">✦ {unlocked}</p> : null}
    <div className="training-result-actions">{children}</div>
    <span className="sr-only">{title}</span>
  </section>;
}

export { appSecondaryActionClass };

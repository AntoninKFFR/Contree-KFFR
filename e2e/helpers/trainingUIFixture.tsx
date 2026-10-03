/** @jsxImportSource react */
import React from "react";
import Link from "next/link";
import { renderToStaticMarkup } from "react-dom/server";
import { AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "../../components/ui/AppShell";
import { TrainingLevelTrack, TrainingModeCard, TrainingSessionHeader, TrainingResultSummary } from "../../components/training/TrainingUI";

export const LONG_TRAINING_NAME = "Lire les enchères et toutes les surenchères des partenaires et adversaires";
export const LONG_TRAINING_LEVEL = "Lire les soutiens, les réponses et les surenchères en situation complexe";
export function trainingUIFixture() {
  return renderToStaticMarkup(<AppPage width="wide">
    <div className="training-page"><TrainingModeCard title={LONG_TRAINING_NAME} description="La description pédagogique entière explique les indices des annonces, les cartes promises et toutes les limites de ces informations." level={3} levelName={LONG_TRAINING_LEVEL} record="Record local · 9 / 10" accountRecord="Record compte : 10 / 10 · Meilleur temps : 123,4 s · Niveau 4" href="/training/puzzle/bid-reading?level=3" featured>
      <TrainingLevelTrack title={LONG_TRAINING_NAME} current={3} total={5} names={{ 3: LONG_TRAINING_LEVEL }} href={(level) => `/training/puzzle/bid-reading?level=${level}`} />
    </TrainingModeCard></div>
    <div className="training-exercise"><AppSurface>
      <TrainingSessionHeader title={LONG_TRAINING_NAME} level={3} levelName={LONG_TRAINING_LEVEL} index={3} total={10} score={4} />
      <section className="training-feedback training-exercise-body"><p>Ce long feedback conserve tous les indices observables, les cartes oubliées et les raisons détaillées pour lesquelles cette réponse ne peut pas être affirmée à partir des plis publics.</p><button className={appPrimaryActionClass}>Exercice suivant</button></section>
    </AppSurface></div>
    <TrainingResultSummary title={LONG_TRAINING_NAME} level={3} levelName={LONG_TRAINING_LEVEL} score={8} total={10} best="Record compte : 10 / 10 · Meilleur temps : 123,4 s · Niveau 4" unlocked="Niveau 4 débloqué ! Les prochaines lectures de surenchères sont maintenant disponibles.">
      <button className={appPrimaryActionClass}>Rejouer</button><Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
    </TrainingResultSummary>
  </AppPage>);
}

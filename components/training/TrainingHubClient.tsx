"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass } from "@/components/ui/AppShell";
import { formatDuration, PILE_COUNT_MODE_COPY, PILE_COUNT_TITLE } from "@/components/training/pileCountCopy";
import {
  isPileCountModeUnlocked, isTrickValueChallengeUnlocked, isTrickValueLevelUnlocked, PASSING_SCORE, readTrainingProgress,
  type TrainingProgress,
} from "@/components/training/progress";
import { PILE_COUNT_MODES, PILE_COUNT_SERIES_LENGTH, type PileCountMode } from "@/engine/training/pileCount";
import type { TrickValueChallengeMode } from "@/engine/training/trickValueChallenge";
import { MEMORY_AXIS_IDS, MEMORY_LABELS, MEMORY_LEVELS, type MemoryAxisId } from "@/engine/training/memory";
import { OPPONENT_VOIDS_LEVELS } from "@/engine/training/opponentVoids";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { readAccountTrainingRecords, type AccountTrainingRecord } from "@/lib/trainingRecordsClient";

function AccountRecord({ record, showLevel = false }: { record: AccountTrainingRecord | undefined; showLevel?: boolean }) {
  if (!record) return null;
  const seconds = record.bestDurationMs === null ? null : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(record.bestDurationMs / 1000);
  return <p className="mt-1 text-sm">{showLevel ? `Niveau ${record.level} · ` : ""}Record compte : {record.bestScore} / 10{seconds ? ` · Meilleur temps : ${seconds} s` : ""}</p>;
}

function MemoryCard({ axisId, progress, accountRecords }: { axisId: MemoryAxisId; progress: TrainingProgress | null; accountRecords: AccountTrainingRecord[] }) {
  const axis = progress?.axes[axisId];
  const level = axis?.unlockedLevel ?? 1;
  const record = axis?.levels[level];
  return <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
    <h3 className="text-lg font-black">{MEMORY_LABELS[axisId]}</h3>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">Niveau débloqué : {level}</p>
    <p className="mt-1 flex-1 text-sm">{record?.completedSeries ? `Meilleur score : ${record.bestScore} / 10` : "Record à établir"}</p>
    {accountRecords.map((record) => <AccountRecord key={record.level} record={record} showLevel />)}
    <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Niveaux de ${MEMORY_LABELS[axisId]}`}>
      {Array.from({ length: MEMORY_LEVELS[axisId] }, (_, index) => index + 1).map((availableLevel) => availableLevel <= level
        ? <Link key={availableLevel} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" href={`/training/puzzle/${axisId}?level=${availableLevel}`}>Niveau {availableLevel}</Link>
        : <span key={availableLevel} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)]">Niveau {availableLevel} 🔒</span>)}
    </div>
    <Link className={`${appPrimaryActionClass} mt-4 w-full`} href={`/training/puzzle/${axisId}?level=${level}`}>Jouer</Link>
  </article>;
}

function PileCountModeCard({ mode, progress }: { mode: PileCountMode; progress: TrainingProgress | null }) {
  const copy = PILE_COUNT_MODE_COPY[mode];
  const unlocked = progress ? isPileCountModeUnlocked(progress, mode) : mode !== "normal";
  const saved = progress?.axes["pile-count"].modes;
  const status = !saved ? "" : mode === "free"
    ? "Sans record"
    : mode === "manual"
      ? saved.manual.bestTimeMs !== null ? `Record : ${formatDuration(saved.manual.bestTimeMs)}` : "Record à établir (10/10)"
      : saved[mode].completedSeries ? `Meilleur score : ${saved[mode].bestScore} / ${PILE_COUNT_SERIES_LENGTH}` : "Accessible";
  return <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
    <h3 className="text-xl font-black">{copy.name}</h3>
    <p className="mt-2 flex-1 text-sm text-[var(--text-secondary)]">{copy.description}</p>
    {unlocked ? <>
      <p className="mt-4 text-sm font-semibold">{status}</p>
      <Link aria-label={`${PILE_COUNT_TITLE} en mode ${copy.name}`} className={`${appPrimaryActionClass} mt-4 w-full`} href={`/training/puzzle/pile-count?mode=${mode}`}>Commencer</Link>
    </> : <p className="mt-4 text-sm font-semibold">Réussis {PASSING_SCORE}/{PILE_COUNT_SERIES_LENGTH} en Débutant pour débloquer ce mode.</p>}
  </article>;
}

function ChallengeCard({ mode, unlocked, progress }: {
  mode: TrickValueChallengeMode;
  unlocked: boolean;
  progress: TrainingProgress | null;
}) {
  const label = mode === "survival" ? "Survie" : "Blitz";
  const description = mode === "survival"
    ? "3 vies. Le temps diminue à mesure que tu progresses."
    : "60 secondes. Les erreurs consécutives peuvent détruire ta run.";
  const record = progress?.axes["trick-value"].challenges[mode];
  return <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
    <h3 className="text-xl font-black">{label}</h3>
    <p className="mt-2 flex-1 text-sm text-[var(--text-secondary)]">{description}</p>
    {unlocked ? <>
      <p className="mt-4 text-sm font-semibold">{record?.completedRuns
        ? `Record : ${record.bestScore} ${mode === "survival" ? record.bestScore === 1 ? "pli" : "plis" : record.bestScore === 1 ? "bonne réponse" : "bonnes réponses"}`
        : "Record à établir"}</p>
      <Link className={`${appPrimaryActionClass} mt-4 w-full`} href={`/training/puzzle/trick-value?mode=${mode}`}>Jouer en {label}</Link>
    </> : <p className="mt-4 text-sm font-semibold">Réussis 8/10 en Confirmé pour débloquer ce mode.</p>}
  </article>;
}

export function TrainingHubClient() {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  useEffect(() => setProgress(readTrainingProgress()), []);
  const [account, setAccount] = useState<{ signedIn: boolean; records: AccountTrainingRecord[]; failed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void readAccountTrainingRecords().then((result) => { if (active) setAccount(result); }); };
    refresh();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const listener = getSupabaseClient()?.auth.onAuthStateChange((_event, session) => {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      if (!session) setAccount({ signedIn: false, records: [], failed: false });
      else refreshTimer = setTimeout(refresh, 0);
    });
    return () => { active = false; if (refreshTimer !== null) clearTimeout(refreshTimer); listener?.data.subscription.unsubscribe(); };
  }, []);
  const accountRecord = (axisId: AccountTrainingRecord["axisId"], level: number) =>
    account?.records.find((record) => record.axisId === axisId && record.level === level);
  const accountRecords = (axisId: AccountTrainingRecord["axisId"]) =>
    account?.records.filter((record) => record.axisId === axisId).sort((left, right) => left.level - right.level) ?? [];
  const axis = progress?.axes["trick-value"];
  const opponentAxis = progress?.axes["opponent-voids"];
  const opponentLevel = opponentAxis?.unlockedLevel ?? 1;
  const opponentRecord = opponentAxis?.levels[opponentLevel];
  const level2Unlocked = progress ? isTrickValueLevelUnlocked(progress, 2) : false;
  const challengesUnlocked = progress ? isTrickValueChallengeUnlocked(progress) : false;

  return <AppPage width="wide">
    <header className="py-3 sm:py-5">
      <AppEyebrow>Jouer et apprendre</AppEyebrow>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Entraînement</h1>
      <p className="mt-3 max-w-2xl text-[var(--text-secondary)]">Apprends les points des plis, puis tente les défis chronométrés. Aucun compte n’est nécessaire.</p>
      {account?.signedIn === false ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Connecte-toi pour sauvegarder tes nouveaux records sur ton compte.</p> : null}
      {account?.failed ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Records du compte indisponibles pour le moment.</p> : null}
    </header>
    <AppSurface className="mb-4">
      <h2 className="text-2xl font-black">Jouer une partie</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Joue une vraie partie contre les bots et réponds à des questions aux moments clés.</p>
      <Link className={`${appPrimaryActionClass} mt-4 w-full sm:w-auto`} href="/training/game">Entraînement en partie</Link>
    </AppSurface>
    <AppSurface>
      <h2 className="text-2xl font-black">Valeur d’un pli</h2>
      <div className="mt-5"><AppEyebrow>Apprentissage</AppEyebrow></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-widest text-[var(--ui-kicker)]">Niveau 1</p>
          <h3 className="mt-2 text-xl font-black">Fondamentaux</h3>
          <p className="mt-2 flex-1 text-sm text-[var(--text-secondary)]">Apprendre à compter les points des cartes à l’atout et hors atout.</p>
          <p className="mt-4 text-sm font-semibold">{axis?.levels[1].completedSeries ? `Meilleur score : ${axis.levels[1].bestScore} / 10` : "Toujours accessible"}</p>
          <AccountRecord record={accountRecord("trick-value", 1)} />
          <Link className={`${appPrimaryActionClass} mt-4 w-full`} href="/training/puzzle/trick-value?level=1">Jouer le niveau 1</Link>
        </article>
        <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-widest text-[var(--ui-kicker)]">Niveau 2</p>
          <h3 className="mt-2 text-xl font-black">Confirmé</h3>
          <p className="mt-2 flex-1 text-sm text-[var(--text-secondary)]">Compter sans aide et gérer aussi le bonus du dernier pli.</p>
          {level2Unlocked ? <>
            <p className="mt-4 text-sm font-semibold">{axis?.levels[2].completedSeries ? `Meilleur score : ${axis.levels[2].bestScore} / 10` : "Débloqué"}</p>
            <AccountRecord record={accountRecord("trick-value", 2)} />
            <Link className={`${appPrimaryActionClass} mt-4 w-full`} href="/training/puzzle/trick-value?level=2">Jouer le niveau 2</Link>
          </> : <>
            <p className="mt-4 text-sm font-semibold">Niveau verrouillé</p>
            <AccountRecord record={accountRecord("trick-value", 2)} />
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Obtiens 8/10 au niveau 1 pour débloquer ce niveau.</p>
          </>}
        </article>
      </div>
      <div className="mt-7"><AppEyebrow>Défis</AppEyebrow></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChallengeCard mode="survival" progress={progress} unlocked={challengesUnlocked} />
        <ChallengeCard mode="blitz" progress={progress} unlocked={challengesUnlocked} />
      </div>
      <div className="mt-7"><AppEyebrow>Mémoriser</AppEyebrow></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MEMORY_AXIS_IDS.map((axisId) => <MemoryCard key={axisId} axisId={axisId} progress={progress}
          accountRecords={accountRecords(axisId)} />)}
      </div>
      <div className="mt-7"><AppEyebrow>Déduire</AppEyebrow></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 sm:p-5">
          <h3 className="text-lg font-black">Jeu des autres</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Repère les couleurs dont les autres joueurs sont certainement coupés.</p>
          <p className="mt-2 text-sm">Niveau débloqué : {opponentLevel}</p>
          <p className="mt-1 flex-1 text-sm">{opponentRecord?.completedSeries ? `Meilleur score : ${opponentRecord.bestScore} / 10` : "Record à établir"}</p>
          {accountRecords("opponent-voids").map((record) => <AccountRecord key={record.level} record={record} showLevel />)}
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Niveaux de Jeu des autres">
            {Array.from({ length: OPPONENT_VOIDS_LEVELS }, (_, index) => index + 1).map((level) => level <= opponentLevel
              ? <Link key={level} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-bold" href={`/training/puzzle/opponent-voids?level=${level}`}>Niveau {level}</Link>
              : <span key={level} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)]">Niveau {level} 🔒</span>)}
          </div>
          <Link className={`${appPrimaryActionClass} mt-4 w-full`} href={`/training/puzzle/opponent-voids?level=${opponentLevel}`}>Jouer</Link>
        </article>
      </div>
    </AppSurface>
    <AppSurface className="mt-4">
      <h2 className="text-2xl font-black">{PILE_COUNT_TITLE}</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Les cartes du tas de ton équipe défilent une à une : compte tes points de fin de donne, 10 de der et belote compris.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PILE_COUNT_MODES.map((mode) => <PileCountModeCard key={mode} mode={mode} progress={progress} />)}
      </div>
    </AppSurface>
  </AppPage>;
}

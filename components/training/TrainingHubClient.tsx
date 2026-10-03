"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppPage, AppPageHeader } from "@/components/ui/AppShell";
import { TrainingLevelTrack, TrainingModeCard, TrainingSectionHeader } from "@/components/training/TrainingUI";
import { formatDuration, PILE_COUNT_MODE_COPY, PILE_COUNT_TITLE } from "@/components/training/pileCountCopy";
import { isPileCountModeUnlocked, isTrickValueChallengeUnlocked, PASSING_SCORE, readTrainingProgress, type TrainingProgress } from "@/components/training/progress";
import { PILE_COUNT_MODES, PILE_COUNT_SERIES_LENGTH, type PileCountMode } from "@/engine/training/pileCount";
import { MEMORY_AXIS_IDS, MEMORY_LABELS, MEMORY_LEVELS, type MemoryAxisId } from "@/engine/training/memory";
import { OPPONENT_VOIDS_LEVELS } from "@/engine/training/opponentVoids";
import { BIDDING_LEVEL_NAMES, BIDDING_LEVELS, type BiddingLevel } from "@/engine/training/bidding";
import { BID_READING_LEVEL_NAMES, BID_READING_LEVELS, type BidReadingLevel } from "@/engine/training/bidReading";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { readAccountTrainingRecords, type AccountTrainingRecord } from "@/lib/trainingRecordsClient";
import { TrainingFriendsLeaderboard } from "@/components/training/TrainingFriendsLeaderboard";

const recordLabel = (score: number, completed: number) => completed ? `Record local · ${score} / 10` : undefined;
function AccountRecord({ record }: { record: AccountTrainingRecord | undefined }) {
  if (!record) return null;
  const seconds = record.bestDurationMs === null ? null : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(record.bestDurationMs / 1000);
  return <p className="training-card-record">Record compte : {record.bestScore} / 10{seconds ? ` · Meilleur temps : ${seconds} s` : ""}{record.level > 1 ? ` · Niveau ${record.level}` : ""}</p>;
}

function MemoryCard({ axisId, progress, accountRecords }: { axisId: MemoryAxisId; progress: TrainingProgress | null; accountRecords: AccountTrainingRecord[] }) {
  const axis = progress?.axes[axisId];
  const level = axis?.unlockedLevel ?? 1;
  const saved = axis?.levels[level];
  return <TrainingModeCard title={MEMORY_LABELS[axisId]} description="Observe, retiens et retrouve les cartes au fil du jeu."
    level={level} record={recordLabel(saved?.bestScore ?? 0, saved?.completedSeries ?? 0)}
    href={`/training/puzzle/${axisId}?level=${level}`}>
    <TrainingLevelTrack title={MEMORY_LABELS[axisId]} current={level} total={MEMORY_LEVELS[axisId]} href={(value) => `/training/puzzle/${axisId}?level=${value}`} />
    {accountRecords.map((record) => <AccountRecord key={record.level} record={record} />)}
  </TrainingModeCard>;
}

function PileCountModeCard({ mode, progress }: { mode: PileCountMode; progress: TrainingProgress | null }) {
  const copy = PILE_COUNT_MODE_COPY[mode];
  const unlocked = progress ? isPileCountModeUnlocked(progress, mode) : mode !== "normal";
  const saved = progress?.axes["pile-count"].modes;
  const status = !saved ? "" : mode === "free" ? "" : mode === "manual"
    ? saved.manual.bestTimeMs !== null ? `Record : ${formatDuration(saved.manual.bestTimeMs)}` : ""
    : saved[mode].completedSeries ? `Meilleur score : ${saved[mode].bestScore} / ${PILE_COUNT_SERIES_LENGTH}` : "";
  return <TrainingModeCard title={copy.name} description={copy.description} record={unlocked ? status : undefined}
    href={unlocked ? `/training/puzzle/pile-count?mode=${mode}` : undefined} action="Commencer" actionLabel={`${PILE_COUNT_TITLE} en mode ${copy.name}`}>
    {!unlocked ? <p className="training-lock-note">Réussis {PASSING_SCORE}/{PILE_COUNT_SERIES_LENGTH} en Débutant pour débloquer ce mode.</p> : null}
  </TrainingModeCard>;
}

export function TrainingHubClient() {
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  useEffect(() => setProgress(readTrainingProgress()), []);
  const refreshGeneration = useRef(0);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [account, setAccount] = useState<{ signedIn: boolean; records: AccountTrainingRecord[]; failed: boolean } | null>(null);
  const initialFragmentHandled = useRef(false);
  useEffect(() => {
    // The gate mounts the hub after the browser's initial fragment lookup.
    // Wait for initial layout data, then replay native navigation once. CSS
    // owns the offset; later record refreshes must not move the reader.
    if (!progress || !account || initialFragmentHandled.current) return;
    initialFragmentHandled.current = true;
    if (["#calculer", "#memoriser", "#deduire", "#annoncer"].includes(window.location.hash)) {
      window.location.replace(window.location.hash);
    }
  }, [progress, account]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      const generation = ++refreshGeneration.current;
      setAuthEpoch(generation);
      void readAccountTrainingRecords().then((result) => {
        if (active && generation === refreshGeneration.current) setAccount(result);
      });
    };
    refresh();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const listener = getSupabaseClient()?.auth.onAuthStateChange((_event, session) => {
      setAuthEpoch(++refreshGeneration.current);
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      if (!session) setAccount({ signedIn: false, records: [], failed: false });
      else { setAccount(null); refreshTimer = setTimeout(refresh, 0); }
    });
    return () => { active = false; if (refreshTimer !== null) clearTimeout(refreshTimer); listener?.data.subscription.unsubscribe(); };
  }, []);
  const accountRecord = (axisId: AccountTrainingRecord["axisId"], level: number) =>
    account?.records.find((record) => record.axisId === axisId && record.level === level);
  const accountRecords = (axisId: AccountTrainingRecord["axisId"]) =>
    account?.records.filter((record) => record.axisId === axisId).sort((left, right) => left.level - right.level) ?? [];
  const trick = progress?.axes["trick-value"];
  const trickLevel = trick?.unlockedLevel ?? 1;
  const opponent = progress?.axes["opponent-voids"];
  const opponentLevel = opponent?.unlockedLevel ?? 1;
  const bidding = progress?.axes.bidding;
  const biddingLevel = bidding?.unlockedLevel ?? 1;
  const bidReading = progress?.axes["bid-reading"];
  const bidReadingLevel = bidReading?.unlockedLevel ?? 1;
  const challengesUnlocked = progress ? isTrickValueChallengeUnlocked(progress) : false;

  return <AppPage width="wide" className="training-page">
    <AppPageHeader eyebrow="Entraînement" title="Entraînement" description="Progresse dans tous les aspects de la Contrée. Calcul, mémoire, lecture du jeu et enchères." />
    {account?.signedIn === false ? <p className="text-sm text-[var(--text-secondary)]">Connecte-toi pour synchroniser tes records. Les annonces restent locales.</p> : null}
    {account?.failed ? <p className="text-sm text-[var(--text-secondary)]">Records du compte indisponibles pour le moment.</p> : null}
    <div className="training-catalogue">
      <section aria-labelledby="calculer"><TrainingSectionHeader kicker="01 · Les fondamentaux" title="Calculer" id="calculer" description="Compte les points, puis relève des défis lorsque tes bases sont solides." />
        <div className="training-card-grid max-w-xl">
          <TrainingModeCard title="Valeur d’un pli" description="Compte les points des cartes à l’atout et hors atout, puis le bonus du dernier pli."
            level={trickLevel} levelName={trickLevel === 1 ? "Fondamentaux" : "Confirmé"}
            record={recordLabel(trick?.levels[trickLevel as 1 | 2].bestScore ?? 0, trick?.levels[trickLevel as 1 | 2].completedSeries ?? 0)}
            href={`/training/puzzle/trick-value?level=${trickLevel}`}>
            <TrainingLevelTrack title="Valeur d’un pli" current={trickLevel} total={2} href={(level) => `/training/puzzle/trick-value?level=${level}`} names={{ 1: "Fondamentaux", 2: "Confirmé" }} />
            {([1, 2] as const).filter((level) => level !== trickLevel && trick?.levels[level].completedSeries).map((level) =>
              <p className="training-card-record" key={`local-${level}`}>Niveau {level} · Record local : {trick?.levels[level].bestScore} / 10</p>)}
            {[1, 2].map((level) => <AccountRecord key={level} record={accountRecord("trick-value", level)} />)}
          </TrainingModeCard>
        </div>
        <h3 className="training-subheading mb-3 mt-7 text-lg font-black">Défis</h3>
        <div className="training-card-grid">
          {(["survival", "blitz"] as const).map((mode) => <TrainingModeCard key={mode} title={mode === "survival" ? "Survie" : "Blitz"}
            description={mode === "survival" ? "3 vies. Le temps diminue à mesure que tu progresses." : "60 secondes. Les erreurs consécutives peuvent détruire ta run."}
            record={challengesUnlocked && trick?.challenges[mode].completedRuns ? `Record : ${trick.challenges[mode].bestScore} ${mode === "survival" ? trick.challenges[mode].bestScore === 1 ? "pli" : "plis" : trick.challenges[mode].bestScore === 1 ? "bonne réponse" : "bonnes réponses"}` : undefined}
            href={challengesUnlocked ? `/training/puzzle/trick-value?mode=${mode}` : undefined} action={`Jouer en ${mode === "survival" ? "Survie" : "Blitz"}`}>
            {!challengesUnlocked ? <p className="training-lock-note">Réussis 8/10 en Confirmé pour débloquer ce mode.</p> : null}
          </TrainingModeCard>)}
        </div>
        <div className="training-pile-section mt-7"><h3 className="text-xl font-black">{PILE_COUNT_TITLE}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Les cartes du tas de ton équipe défilent une à une : compte tes points de fin de donne, 10 de der et belote compris.</p>
          <div className="training-card-grid mt-4">{PILE_COUNT_MODES.map((mode) => <PileCountModeCard key={mode} mode={mode} progress={progress} />)}</div></div>
      </section>
      <section aria-labelledby="memoriser"><TrainingSectionHeader kicker="02 · Observer" title="Mémoriser" id="memoriser" description="Retiens les cartes jouées et retrouve ce qui reste en main." />
        <div className="training-card-grid">{MEMORY_AXIS_IDS.map((axisId) => <MemoryCard key={axisId} axisId={axisId} progress={progress} accountRecords={accountRecords(axisId)} />)}</div>
      </section>
      <section aria-labelledby="deduire"><TrainingSectionHeader kicker="03 · Lire le jeu" title="Déduire" id="deduire" description="Repère les indices laissés par les autres joueurs." />
        <div className="training-card-grid"><TrainingModeCard title="Jeu des autres" description="Repère les couleurs dont les autres joueurs sont certainement coupés."
          level={opponentLevel} record={recordLabel(opponent?.levels[opponentLevel].bestScore ?? 0, opponent?.levels[opponentLevel].completedSeries ?? 0)}
          href={`/training/puzzle/opponent-voids?level=${opponentLevel}`}>
          <TrainingLevelTrack title="Jeu des autres" current={opponentLevel} total={OPPONENT_VOIDS_LEVELS} href={(level) => `/training/puzzle/opponent-voids?level=${level}`} />
          {accountRecords("opponent-voids").map((record) => <AccountRecord key={record.level} record={record} />)}
        </TrainingModeCard>
        <TrainingModeCard title="Entraînement en partie" description="Joue une vraie partie contre les bots et réponds à des questions aux moments clés." href="/training/game" action="Jouer une partie" /></div>
      </section>
      <section aria-labelledby="annoncer"><TrainingSectionHeader kicker="04 · La table" title="Annoncer" id="annoncer" description="Fais ton annonce, puis apprends à lire ce que les enchères promettent réellement." />
        <div className="training-card-grid">
          <TrainingModeCard title="Faire son annonce" description="Choisis quoi annoncer selon la doctrine KFFR : ouvrir, soutenir, surenchérir, passer ou Coincher."
            level={biddingLevel} levelName={BIDDING_LEVEL_NAMES[biddingLevel as BiddingLevel]}
            record={recordLabel(bidding?.levels[biddingLevel as BiddingLevel].bestScore ?? 0, bidding?.levels[biddingLevel as BiddingLevel].completedSeries ?? 0)}
            href={`/training/puzzle/bidding?level=${biddingLevel}`}>
            <TrainingLevelTrack title="Faire son annonce" current={biddingLevel} total={BIDDING_LEVELS} href={(level) => `/training/puzzle/bidding?level=${level}`} names={BIDDING_LEVEL_NAMES} />
            <Link className="coinche-ui-link text-sm font-bold" href="/training/conventions/bidding">Voir les conventions</Link>
          </TrainingModeCard>
          <TrainingModeCard title="Lire les enchères" description="Apprends ce qu’une annonce permet d’affirmer sur la main du partenaire ou d’un adversaire."
            level={bidReadingLevel} levelName={BID_READING_LEVEL_NAMES[bidReadingLevel as BidReadingLevel]}
            record={recordLabel(bidReading?.levels[bidReadingLevel as BidReadingLevel].bestScore ?? 0, bidReading?.levels[bidReadingLevel as BidReadingLevel].completedSeries ?? 0)}
            href={`/training/puzzle/bid-reading?level=${bidReadingLevel}`} action="Jouer en solo" featured>
            <TrainingLevelTrack title="Lire les enchères" current={bidReadingLevel} total={BID_READING_LEVELS} href={(level) => `/training/puzzle/bid-reading?level=${level}`} names={BID_READING_LEVEL_NAMES} />
            <p className="text-sm text-[var(--text-secondary)]">Même série, deux réponses indépendantes.</p>
            <div className="training-secondary-links">
              <Link className="coinche-ui-link text-sm font-bold" href="/training/duo">Jouer à deux</Link>
              <Link className="coinche-ui-link text-sm font-bold" href="/training/conventions/bidding">Voir les conventions</Link>
            </div>
          </TrainingModeCard>
        </div>
      </section>
    </div>
    <TrainingFriendsLeaderboard signedIn={account?.signedIn ?? null} authEpoch={authEpoch} authGeneration={refreshGeneration} />
  </AppPage>;
}

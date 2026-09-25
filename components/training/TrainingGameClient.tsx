"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BiddingPanel } from "@/components/BiddingPanel";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { MobileLandscapeNotice } from "@/components/MobileLandscapeNotice";
import { RoundCompletionCard } from "@/components/RoundCompletionCard";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { AppEyebrow, AppPage, AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { TrainingInGameOverlay } from "@/components/training/TrainingInGameOverlay";
import { inGameAxisLabel } from "@/components/training/inGameLabels";
import { readTrainingProgress, type TrainingProgress } from "@/components/training/progress";
import { explainIllegalCard } from "@/engine/illegalCardExplanation";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { trainingAxes } from "@/engine/training/axes";
import type { InGameAnswer, InGameAxisId, InGameGrade } from "@/engine/training/inGame";
import type { BidValue, Card, ContractMode, GameState } from "@/engine/types";
import { useSoloGameLoop } from "@/lib/solo/useSoloGameLoop";
import { detectInGameBoundary, emptyInGameSchedulerState, scheduleInGameQuestion,
  type InGameConfiguration, type ScheduledInGameQuestion } from "@/lib/training/inGameScheduler";
import { defaultInGameConfiguration, readInGameConfiguration, saveInGameConfiguration } from "@/lib/training/inGameSettings";
import { inGameSuccessPercent, recordInGameAnswer, type InGameSummary } from "@/lib/training/inGameSummary";

const TRAINING_RULESET = buildCustomRuleset({ presetId: "contree-kffr" });
export const IN_GAME_QUESTION_REVEAL_MS = 600;

function levelUnlocked(progress: TrainingProgress, id: InGameAxisId): number {
  return progress.axes[id].unlockedLevel;
}

export function TrainingGameClient() {
  const { preferences, effectiveReducedMotion } = usePlayerPreferences();
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [configuration, setConfiguration] = useState<InGameConfiguration>(defaultInGameConfiguration);
  const [screen, setScreen] = useState<"setup" | "game">("setup");
  const [question, setQuestion] = useState<ScheduledInGameQuestion | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<ScheduledInGameQuestion | null>(null);
  const [grade, setGrade] = useState<InGameGrade | null>(null);
  const [summary, setSummary] = useState<InGameSummary>({});
  const [mobileLandscape, setMobileLandscape] = useState(false);
  const [mobilePortrait, setMobilePortrait] = useState(false);
  const previousGameStateRef = useRef<GameState | null>(null);
  const schedulerRef = useRef(emptyInGameSchedulerState());
  const sessionSeedRef = useRef(0);
  const gradedQuestionKeyRef = useRef<string | null>(null);
  const {
    gameState, humanCanPlay, humanCanBid, humanCanCoinche, humanCanSurcoinche,
    currentContract, currentMode, gameRules, legalHumanCards,
    dispatchGameAction, startGame, startNextRound, onAutoCollectComplete,
  } = useSoloGameLoop({ preferences, effectiveReducedMotion,
    paused: pendingQuestion !== null || question !== null, tableVisible: !mobilePortrait });

  useEffect(() => {
    const savedProgress = readTrainingProgress();
    setProgress(savedProgress);
    setConfiguration(readInGameConfiguration(savedProgress));
    const media = window.matchMedia("(max-width: 900px) and (orientation: landscape)");
    const portrait = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    const update = () => { setMobileLandscape(media.matches); setMobilePortrait(portrait.matches); };
    update();
    media.addEventListener("change", update);
    portrait.addEventListener("change", update);
    return () => { media.removeEventListener("change", update); portrait.removeEventListener("change", update); };
  }, []);

  useLayoutEffect(() => {
    if (!gameState) return;
    const previous = previousGameStateRef.current;
    previousGameStateRef.current = gameState;
    if (screen !== "game") return;
    const boundary = detectInGameBoundary(previous, gameState);
    if (!boundary) return;
    const scheduled = scheduleInGameQuestion(schedulerRef.current, boundary, configuration, sessionSeedRef.current);
    schedulerRef.current = scheduled.state;
    if (scheduled.question) { setGrade(null); setPendingQuestion(scheduled.question); }
  }, [configuration, gameState, screen]);

  useEffect(() => {
    if (!pendingQuestion) return;
    const timer = window.setTimeout(() => {
      setQuestion(pendingQuestion);
      setPendingQuestion(null);
    }, IN_GAME_QUESTION_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [pendingQuestion]);

  const updateConfiguration = (next: InGameConfiguration) => {
    setConfiguration(next);
    saveInGameConfiguration(next);
  };
  const launch = () => {
    previousGameStateRef.current = null;
    schedulerRef.current = emptyInGameSchedulerState();
    gradedQuestionKeyRef.current = null;
    sessionSeedRef.current = crypto.getRandomValues(new Uint32Array(1))[0];
    setSummary({}); setPendingQuestion(null); setQuestion(null); setGrade(null); setScreen("game");
    startGame(TRAINING_RULESET);
  };
  const handleGrade = (answer: InGameAnswer) => {
    if (!question || grade || gradedQuestionKeyRef.current === question.eventKey) return;
    const capability = trainingAxes.resolve(question.axisId).inGame!;
    const result = capability.grade(question.exercise, answer);
    gradedQuestionKeyRef.current = question.eventKey;
    setGrade(result);
    setSummary((previous) => recordInGameAnswer(previous, question.axisId, result));
  };
  const illegalCardMessage = (card: Card): string => {
    if (!gameState || !currentMode || !gameRules) return "Cette carte n'est pas jouable.";
    return explainIllegalCard({ hand: gameState.hands[0], trick: gameState.currentTrick, card,
      playerId: 0, mode: currentMode, rules: gameRules.cardPlay }) ?? "Cette carte n'est pas jouable.";
  };

  if (screen === "setup") {
    return <AppPage width="wide">
      <Link className="coinche-ui-link text-sm font-bold" href="/training">← Retour à l’entraînement</Link>
      <header className="mt-4"><AppEyebrow>Une vraie partie, des questions au bon moment</AppEyebrow>
        <h1 className="mt-2 text-3xl font-black">Entraînement en partie</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-secondary)]">Joue contre les trois bots officiels. La partie se met en pause pour une question, puis reprend sans changer le résultat.</p>
      </header>
      <AppSurface className="mt-5">
        <h2 className="text-xl font-black">Axes à travailler</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {configuration.axes.map((choice) => {
            const axis = trainingAxes.resolve(choice.id);
            const unlocked = progress ? Math.min(axis.inGame!.levelCount, levelUnlocked(progress, choice.id)) : 1;
            return <div key={choice.id} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
              <label className="flex min-h-11 items-center gap-3 font-bold">
                <input type="checkbox" checked={choice.enabled} onChange={(event) => updateConfiguration({ ...configuration,
                  axes: configuration.axes.map((item) => item.id === choice.id ? { ...item, enabled: event.target.checked } : item) })} />
                {inGameAxisLabel(choice.id)}
              </label>
              <label className="mt-2 block text-sm" htmlFor={`level-${choice.id}`}>Niveau</label>
              <select id={`level-${choice.id}`} className="coinche-input mt-1 min-h-11 w-full rounded-lg border px-3"
                value={Math.min(choice.level, unlocked)} onChange={(event) => updateConfiguration({ ...configuration,
                  axes: configuration.axes.map((item) => item.id === choice.id ? { ...item, level: Number(event.target.value) } : item) })}>
                {Array.from({ length: unlocked }, (_, index) => index + 1).map((level) => <option key={level} value={level}>Niveau {level}</option>)}
              </select>
              {unlocked < axis.inGame!.levelCount ? <p className="mt-2 text-xs text-[var(--text-secondary)]">Les niveaux suivants se débloquent dans les puzzles.</p> : null}
            </div>;
          })}
        </div>
        <fieldset className="mt-6"><legend className="font-bold">Questions par manche</legend>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Maximum total, tous axes confondus, même en fin de manche.</p>
          <div className="mt-2 flex flex-wrap gap-2">{([1, 2, 3] as const).map((budget) => <label key={budget}
            className={`flex min-h-11 items-center gap-2 rounded-lg border px-4 ${configuration.budgetPerRound === budget ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
            <input type="radio" name="budget" value={budget} checked={configuration.budgetPerRound === budget}
              onChange={() => updateConfiguration({ ...configuration, budgetPerRound: budget })} />{budget}
          </label>)}</div>
        </fieldset>
        <button className={`${appPrimaryActionClass} mt-6 min-h-12 w-full sm:w-auto`} disabled={!progress || !configuration.axes.some((axis) => axis.enabled)}
          onClick={launch} type="button">Lancer la partie</button>
      </AppSurface>
    </AppPage>;
  }

  if (!gameState) return <AppPage><p role="status">Préparation de la partie…</p></AppPage>;

  if (gameState.phase === "game-over" && !question && !pendingQuestion) {
    return <AppPage width="medium">
      <AppSurface className="mx-auto w-full max-w-2xl py-8">
        <AppEyebrow>Partie terminée</AppEyebrow>
        <h1 className="mt-2 text-3xl font-black">Bilan de l’entraînement</h1>
        <p className="mt-3 text-sm">Résultat de la partie : {gameState.totalScore[0]} — {gameState.totalScore[1]}</p>
        <div className="mt-5 space-y-3">{configuration.axes.filter((axis) => axis.enabled && summary[axis.id]?.questions).map((axis) => {
          const record = summary[axis.id]!;
          return <section key={axis.id} className="rounded-xl border border-[var(--border)] p-4">
            <h2 className="font-black">{inGameAxisLabel(axis.id)}</h2>
            <p className="mt-1 text-sm">{record.questions} question{record.questions > 1 ? "s" : ""} · {record.earnedScore} / {record.possibleScore} point{record.possibleScore > 1 ? "s" : ""} · {inGameSuccessPercent(record)} %</p>
          </section>;
        })}</div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className={appPrimaryActionClass} onClick={launch} type="button">Rejouer avec la même configuration</button>
          <button className={appSecondaryActionClass} onClick={() => setScreen("setup")} type="button">Modifier l’entraînement</button>
          <Link className={appSecondaryActionClass} href="/training">Retour à l’entraînement</Link>
        </div>
      </AppSurface>
    </AppPage>;
  }

  const humanActions = {
    bid: (value: BidValue, contractMode: ContractMode) => dispatchGameAction({ type: "bid", playerId: 0, value, contractMode }),
    capot: (contractMode: ContractMode) => dispatchGameAction({ type: "capot", playerId: 0, contractMode }),
    generale: (contractMode: ContractMode) => dispatchGameAction({ type: "generale", playerId: 0, contractMode }),
    pass: () => dispatchGameAction({ type: "pass", playerId: 0 }),
    coinche: () => dispatchGameAction({ type: "coinche", playerId: 0 }),
    surcoinche: () => dispatchGameAction({ type: "surcoinche", playerId: 0 }),
  };
  return <main aria-label="Partie d’entraînement"
    data-training-question-pending={pendingQuestion !== null}
    data-game-state-key={`${gameState.phase}:${gameState.roundNumber}:${gameState.completedTricks.length}:${gameState.currentPlayerId}:${gameState.currentTrick.cards.length}:${gameState.bids.length}`}
    className={`coinche-game-shell h-[calc(100dvh-56px)] min-h-0 overflow-x-hidden overflow-y-auto px-2 py-2 sm:px-3 lg:overflow-hidden ${mobileLandscape ? "overflow-hidden px-0 py-0 sm:px-4" : ""}`}>
    {mobilePortrait ? <MobileLandscapeNotice /> : <div className="mx-auto flex h-full w-full max-w-none flex-col gap-2">
      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-2">
        <GameTable state={gameState} immersiveMobileLandscape={mobileLandscape}
          showLiveScore={preferences.assistance.showLivePoints} onAutoCollectComplete={onAutoCollectComplete}
          biddingControls={gameState.phase === "bidding" && humanCanBid ? <BiddingPanel
            bids={gameState.bids} biddingRules={gameRules?.bidding} canBid={humanCanBid}
            canCoinche={humanCanCoinche} canSurcoinche={humanCanSurcoinche} compact currentContract={currentContract}
            onBid={humanActions.bid} onCapot={humanActions.capot} onGenerale={humanActions.generale}
            onPass={humanActions.pass} onCoinche={humanActions.coinche} onSurcoinche={humanActions.surcoinche} playerId={0} /> : null}
          hand={gameState.phase === "playing" || gameState.phase === "bidding" ? <HumanHand
            canPlay={humanCanPlay} cards={gameState.hands[0]} contractMode={currentMode}
            illegalCardMessage={illegalCardMessage} inScene legalCards={legalHumanCards}
            onPlayCard={(card) => dispatchGameAction({ type: "play-card", playerId: 0, card })} /> : null} />
      </div>
    </div>}
    {gameState.phase === "finished" && !question && !pendingQuestion ? <RoundCompletionCard actionLabel="Manche suivante" onAction={startNextRound} state={gameState} /> : null}
    {pendingQuestion ? <p className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--surface-raised)]/90 px-4 py-2 text-sm font-bold shadow-lg" role="status">Observe la table…</p> : null}
    {question ? <TrainingInGameOverlay key={question.eventKey} question={question} grade={grade} onGrade={handleGrade}
      onResume={() => { if (grade) { setQuestion(null); setGrade(null); } }} /> : null}
  </main>;
}

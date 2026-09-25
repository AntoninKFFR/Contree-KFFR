"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import { BiddingPanel } from "@/components/BiddingPanel";
import { BotReviewHistory, BotReviewPanel } from "@/components/BotReviewPanel";
import { SoloBotHandsPanel } from "@/components/BotHandAnalysis";
import { GameTable } from "@/components/GameTable";
import { GameMenuPopover } from "@/components/GameMenuPopover";
import { HumanHand } from "@/components/HumanHand";
import { MobileLandscapeNotice } from "@/components/MobileLandscapeNotice";
import { RoundCompletionCard } from "@/components/RoundCompletionCard";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { RulesetSummary, rulesetDisplayName } from "@/components/rules/RulesetSummary";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { appDangerActionClass, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { PlayerSettingsDialog } from "@/components/settings/PlayerSettingsPanel";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { applyGameAction, type GameAction } from "@/engine/actions";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { resolveContractMode } from "@/engine/contractMode";
import { explainIllegalCard } from "@/engine/illegalCardExplanation";
import {
  getCurrentContract,
  playableCardsForCurrentPlayer,
} from "@/engine/game";
import {
  firstHumanSeat,
  isBotSeat,
  isHumanSeat,
  SOLO_SEAT_ASSIGNMENTS,
} from "@/engine/seats";
import type { BidValue, Card, ContractMode, GameState } from "@/engine/types";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { buildCustomRuleset, rulesetToCustomInput, type CustomRulesetInput } from "@/engine/rulesets/custom";
import { saveCompletedGame } from "@/lib/games";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  BOT_REVIEW_MODE_ENABLED,
  appendBotReviewHistory,
  captureBotReviewScenario,
  createBotReviewBundle,
  createEmptyBotReviewHistory,
  type BotReviewPublicAuctionV2,
  type BotReviewScenarioV1,
  updateBotReviewPublicAuctions,
} from "@/bots/botReview";
import {
  isSoloDesktopAnalysisLayout,
  soloContentClassName,
  soloGridClassName,
  soloMainClassName,
  shouldShowBotReviewAction,
} from "@/app/solo/soloAnalysis";
import { createSoloGame, loadSoloRules, saveSoloRules } from "@/app/solo/soloGameInitialization";
import { queueForcedHumanLastCard } from "@/lib/soloLastTrick";
import { scheduleSoloBotTurn, soloBotCollectionKey, type SoloBotTurnPacer } from "@/lib/soloBotPacing";

const soloSeatAssignments = SOLO_SEAT_ASSIGNMENTS;
const localHumanPlayerId = firstHumanSeat(soloSeatAssignments) ?? 0;

export default function SoloPage() {
  const { preferences, effectiveReducedMotion } = usePlayerPreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const reducedMotionRef = useRef(effectiveReducedMotion);
  reducedMotionRef.current = effectiveReducedMotion;
  const botTurnPacerRef = useRef<SoloBotTurnPacer | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const hasLoadedRulesRef = useRef(false);
  const savedGameIdsRef = useRef(new Set<string>());
  const botDecisionNumberRef = useRef(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hasLoadedRules, setHasLoadedRules] = useState(false);
  const [lastBotReview, setLastBotReview] = useState<BotReviewScenarioV1 | null>(null);
  const [botReviewHistory, setBotReviewHistory] = useState<BotReviewScenarioV1[]>(createEmptyBotReviewHistory);
  const [botReviewPublicAuctions, setBotReviewPublicAuctions] = useState<BotReviewPublicAuctionV2[]>([]);
  const [selectedBotReviewId, setSelectedBotReviewId] = useState<string | null>(null);
  const [isBotReviewOpen, setIsBotReviewOpen] = useState(false);
  const [isAnalysisModeEnabled, setIsAnalysisModeEnabled] = useState(false);
  const [rulesInput, setRulesInput] = useState<CustomRulesetInput>({ presetId: "contree-kffr" });
  const [rulesDraft, setRulesDraft] = useState<CustomRulesetInput>({ presetId: "contree-kffr" });
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNewGameConfirmationOpen, setIsNewGameConfirmationOpen] = useState(false);

  const humanCanPlay =
    gameState?.phase === "playing" &&
    isHumanSeat(soloSeatAssignments, gameState.currentPlayerId);
  const humanCanBid =
    gameState?.phase === "bidding" &&
    isHumanSeat(soloSeatAssignments, gameState.currentPlayerId);
  const currentContract = useMemo(() => gameState ? getCurrentContract(gameState) : null, [gameState]);
  const gameRules = useMemo(() => gameState ? resolveGameRules(gameState.settings) : null, [gameState]);
  const currentMode = useMemo(() => gameState ? resolveContractMode(gameState) : null, [gameState]);
  const humanCanCoinche = humanCanBid && canCoinche(localHumanPlayerId, currentContract, gameRules?.bidding);
  const humanCanSurcoinche = humanCanBid && canSurcoinche(localHumanPlayerId, currentContract, gameRules?.bidding);
  const legalHumanCards = useMemo(() => {
    if (!humanCanPlay || !gameState) return [];
    return playableCardsForCurrentPlayer(gameState);
  }, [gameState, humanCanPlay]);
  const displayedBotReview = useMemo(
    () => botReviewHistory.find((scenario) => scenario.decisionId === selectedBotReviewId) ?? lastBotReview,
    [botReviewHistory, lastBotReview, selectedBotReviewId],
  );
  const analysisDesktop = isSoloDesktopAnalysisLayout(
    BOT_REVIEW_MODE_ENABLED,
    isAnalysisModeEnabled,
    isMobileLandscape,
  );

  useEffect(() => {
    if (hasLoadedRulesRef.current) {
      return;
    }

    hasLoadedRulesRef.current = true;
    const savedRules = loadSoloRules(window.localStorage);
    setRulesInput(savedRules);
    setRulesDraft(savedRules);
    setHasLoadedRules(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const portraitQuery = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    const landscapeQuery = window.matchMedia("(max-width: 900px) and (orientation: landscape)");
    const update = () => {
      setIsMobilePortrait(portraitQuery.matches);
      setIsMobileLandscape(landscapeQuery.matches);
    };

    update();
    portraitQuery.addEventListener("change", update);
    landscapeQuery.addEventListener("change", update);
    window.addEventListener("resize", update);

    return () => {
      portraitQuery.removeEventListener("change", update);
      landscapeQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function dispatchGameAction(action: GameAction) {
    if (!gameState) {
      return;
    }

    const nextState = applyGameAction(gameState, action);
    if (BOT_REVIEW_MODE_ENABLED && gameState.phase === "bidding") {
      setBotReviewPublicAuctions((auctions) => updateBotReviewPublicAuctions(auctions, nextState));
    }
    setGameState(nextState);
  }

  useEffect(() => {
    if (
      !gameState ||
      (gameState.phase !== "playing" && gameState.phase !== "bidding") ||
      !isBotSeat(soloSeatAssignments, gameState.currentPlayerId)
    ) {
      return;
    }

    const currentState = gameState;
    botDecisionNumberRef.current += 1;
    const started = performance.now();
    let nextState: GameState;
    if (currentState.phase === "bidding") {
      const { bid: botBid, biddingTrace } = chooseBotBidWithTrace(currentState);
      const elapsedMs = performance.now() - started;
      if (BOT_REVIEW_MODE_ENABLED) {
        const scenario = captureBotReviewScenario(currentState, { decisionNumber: botDecisionNumberRef.current, elapsedMs, chosenBid: botBid, biddingTrace });
        setLastBotReview(scenario);
        setBotReviewHistory((history) => appendBotReviewHistory(history, scenario));
      }
      nextState = botBid.action === "bid" || botBid.action === "generale"
        ? applyGameAction(currentState, { type: botBid.action, playerId: currentState.currentPlayerId, ...("value" in botBid ? { value: botBid.value } : {}), ...("trump" in botBid ? { trump: botBid.trump } : {}), contractMode: botBid.contractMode } as GameAction)
        : applyGameAction(currentState, { type: botBid.action, playerId: currentState.currentPlayerId });
      if (BOT_REVIEW_MODE_ENABLED) setBotReviewPublicAuctions((auctions) => updateBotReviewPublicAuctions(auctions, nextState));
    } else {
      const botCard = chooseBotCard(currentState);
      const elapsedMs = performance.now() - started;
      if (BOT_REVIEW_MODE_ENABLED) {
        const scenario = captureBotReviewScenario(currentState, { decisionNumber: botDecisionNumberRef.current, elapsedMs, chosenCard: botCard });
        setLastBotReview(scenario);
        setBotReviewHistory((history) => appendBotReviewHistory(history, scenario));
      }
      nextState = applyGameAction(currentState, { type: "play-card", playerId: currentState.currentPlayerId, card: botCard });
    }
    const currentPreferences = preferencesRef.current;
    const delayMs = currentState.phase === "bidding" ? currentPreferences.gameplay.biddingDelayMs : currentPreferences.gameplay.botDelayMs;
    const pacer = scheduleSoloBotTurn(
      delayMs,
      soloBotCollectionKey(currentState, currentPreferences, reducedMotionRef.current),
      () => setGameState((latest) => latest === currentState ? nextState : latest),
    );
    botTurnPacerRef.current = pacer;

    return () => {
      pacer.cancel();
      if (botTurnPacerRef.current === pacer) botTurnPacerRef.current = null;
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState && (isMobilePortrait || soloBotCollectionKey(gameState, preferences, effectiveReducedMotion) === null)) {
      botTurnPacerRef.current?.releaseCollection();
    }
  }, [effectiveReducedMotion, gameState, isMobilePortrait, preferences]);

  useEffect(() => {
    if (!gameState || !isHumanSeat(soloSeatAssignments, gameState.currentPlayerId)) return;
    return queueForcedHumanLastCard(gameState, localHumanPlayerId, preferencesRef.current.gameplay.botDelayMs, (currentState, card) => {
      setGameState((latest) => latest === currentState
        ? applyGameAction(latest, { type: "play-card", playerId: localHumanPlayerId, card }) : latest);
    });
  }, [gameState]);

  useEffect(() => {
    const gameId = gameIdRef.current;
    if (!gameState || !gameId || gameState.phase !== "game-over" || savedGameIdsRef.current.has(gameId)) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    let isCancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;

      if (!userId || isCancelled || savedGameIdsRef.current.has(gameId)) {
        return;
      }

      savedGameIdsRef.current.add(gameId);

      const { error } = await saveCompletedGame(supabase, gameState, userId);

      if (error) {
        savedGameIdsRef.current.delete(gameId);
        console.error("Impossible d'enregistrer la partie terminee.", error);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [gameState]);

  function handlePlayCard(card: Card) {
    dispatchGameAction({ type: "play-card", playerId: localHumanPlayerId, card });
  }

  function illegalCardMessage(card: Card): string {
    if (!gameState || !currentMode || !gameRules) return "Cette carte n'est pas jouable.";
    return explainIllegalCard({ hand: gameState.hands[localHumanPlayerId], trick: gameState.currentTrick, card, playerId: localHumanPlayerId, mode: currentMode, rules: gameRules.cardPlay }) ?? "Cette carte n'est pas jouable.";
  }

  function handleHumanBid(value: BidValue, contractMode: ContractMode) {
    dispatchGameAction({ type: "bid", playerId: localHumanPlayerId, value, contractMode });
  }

  function handleHumanCapot(contractMode: ContractMode) {
    dispatchGameAction({ type: "capot", playerId: localHumanPlayerId, contractMode });
  }

  function handleHumanGenerale(contractMode: ContractMode) {
    dispatchGameAction({ type: "generale", playerId: localHumanPlayerId, contractMode });
  }

  function handleHumanPass() {
    dispatchGameAction({ type: "pass", playerId: localHumanPlayerId });
  }

  function handleHumanCoinche() {
    dispatchGameAction({ type: "coinche", playerId: localHumanPlayerId });
  }

  function handleHumanSurcoinche() {
    dispatchGameAction({ type: "surcoinche", playerId: localHumanPlayerId });
  }

  function resetBotReview() {
    botDecisionNumberRef.current = 0;
    setLastBotReview(null);
    setBotReviewHistory(createEmptyBotReviewHistory());
    setBotReviewPublicAuctions([]);
    setSelectedBotReviewId(null);
    setIsBotReviewOpen(false);
  }

  function startSoloGame(ruleset = buildCustomRuleset(rulesInput)) {
    gameIdRef.current = crypto.randomUUID();
    resetBotReview();
    setGameState(createSoloGame(Math.random, ruleset));
  }

  function activeGameId(): string {
    if (!gameIdRef.current) throw new Error("Partie Solo sans identifiant actif.");
    return gameIdRef.current;
  }

  function handleNewGame() {
    startSoloGame();
  }

  function applyRules() {
    const safe = buildCustomRuleset(rulesDraft);
    const normalized = rulesetToCustomInput(safe);
    saveSoloRules(window.localStorage, normalized);
    setRulesInput(normalized);
    setRulesDraft(normalized);
    setIsRulesOpen(false);
    if (gameState) {
      startSoloGame(safe);
    }
  }

  function handleNextRound() {
    dispatchGameAction({ type: "start-next-round" });
  }

  const rulesDialog = isRulesOpen ? <AccessibleDialog description={gameState ? "Ces règles remplaceront la partie en cours." : "Ces règles seront utilisées au démarrage de la partie."} footer={<div className="grid items-center gap-2 sm:grid-cols-[1fr_auto]"><div className="hidden sm:block"><RulesetSummary ruleset={buildCustomRuleset(rulesDraft)} compact /></div><button className={`${appPrimaryActionClass} w-full sm:w-auto`} type="button" onClick={applyRules}>{gameState ? "Appliquer et nouvelle partie" : "Enregistrer les règles"}</button></div>} onClose={() => setIsRulesOpen(false)} stableHeight title="Règles de la prochaine partie"><RulesetConfigurator value={rulesDraft} onChange={setRulesDraft} /></AccessibleDialog> : null;
  const soloMenuActions = [
    { label: "Règles de la prochaine partie", onSelect: () => { setRulesDraft(rulesInput); setIsRulesOpen(true); } },
    ...(BOT_REVIEW_MODE_ENABLED ? [{ label: `Mode développeur : ${isAnalysisModeEnabled ? "activé" : "désactivé"}`, onSelect: () => setIsAnalysisModeEnabled((current) => !current) }] : []),
    ...(gameState ? [{ label: "Abandonner et redistribuer", tone: "danger" as const, onSelect: () => setIsNewGameConfirmationOpen(true) }] : []),
  ];

  if (!gameState) {
    return (
      <>
        <GameMenuPopover focusMode={isFocusMode} menuActions={soloMenuActions} onOpenPreferences={() => setIsSettingsOpen(true)} onToggleFocusMode={() => setIsFocusMode((current) => !current)} preferencesLabel="Paramètres" showFocusMode={false} />
        <main className="coinche-game-shell flex min-h-[calc(100dvh-56px)] items-center justify-center overflow-x-hidden px-5 py-10 text-center">
          <section aria-labelledby="solo-start-title" className="flex w-full max-w-xl flex-col items-center">
            <p className="coinche-ui-kicker text-xs font-black uppercase tracking-[0.24em]">Contrée Solo</p>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-[var(--text-primary)] sm:text-5xl" id="solo-start-title">Prêt à lancer une partie&nbsp;?</h1>
            <button className={`${appPrimaryActionClass} mt-8 min-w-56 px-7 py-3 text-base`} disabled={!hasLoadedRules} onClick={() => startSoloGame()} type="button">Commencer la partie</button>
            <p className="mt-4 text-sm font-semibold text-[var(--text-muted)]">{rulesetDisplayName(buildCustomRuleset(rulesInput))}</p>
          </section>
        </main>
        {rulesDialog}
        {isSettingsOpen ? <PlayerSettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}
      </>
    );
  }

  if (isMobilePortrait) {
    return <><GameMenuPopover focusMode={isFocusMode} menuActions={soloMenuActions} onOpenPreferences={() => setIsSettingsOpen(true)} onToggleFocusMode={() => setIsFocusMode((current) => !current)} preferencesLabel="Paramètres" /><MobileLandscapeNotice />{rulesDialog}{isSettingsOpen ? <PlayerSettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}</>;
  }

  return (
    <><GameMenuPopover focusMode={isFocusMode} menuActions={soloMenuActions} onOpenPreferences={() => setIsSettingsOpen(true)} onToggleFocusMode={() => setIsFocusMode((current) => !current)} preferencesLabel="Paramètres" /><main
      aria-label={`Partie Solo, objectif ${gameState.settings.targetScore} points`}
      className={soloMainClassName(analysisDesktop, isMobileLandscape)}
    >
      <div className={soloContentClassName(analysisDesktop)}>
        <div
          className={soloGridClassName(analysisDesktop, isMobileLandscape)}
        >
          <div className={`flex min-h-0 flex-col gap-2 ${isMobileLandscape ? "gap-0" : ""}`}>
            <GameTable
              biddingControls={gameState.phase === "bidding" && humanCanBid ? <BiddingPanel
                bids={gameState.bids}
                biddingRules={gameRules?.bidding}
                canBid={humanCanBid}
                canCoinche={humanCanCoinche}
                canSurcoinche={humanCanSurcoinche}
                compact
                currentContract={currentContract}
                onBid={handleHumanBid}
                onCapot={handleHumanCapot}
                onGenerale={handleHumanGenerale}
                onCoinche={handleHumanCoinche}
                onPass={handleHumanPass}
                onSurcoinche={handleHumanSurcoinche}
                playerId={localHumanPlayerId}
              /> : null}
              hand={(gameState.phase === "bidding" || gameState.phase === "playing") ? <HumanHand
                canPlay={humanCanPlay}
                cards={gameState.hands[localHumanPlayerId]}
                contractMode={currentMode}
                illegalCardMessage={illegalCardMessage}
                inScene
                legalCards={legalHumanCards}
                onPlayCard={handlePlayCard}
              /> : null}
              immersiveMobileLandscape={isMobileLandscape}
              minimalHud={isFocusMode}
              onAutoCollectComplete={(trickKey) => botTurnPacerRef.current?.autoCollected(trickKey)}
              state={gameState}
              showLiveScore={preferences.assistance.showLivePoints}
            />

            {BOT_REVIEW_MODE_ENABLED && isAnalysisModeEnabled && !isMobileLandscape && !isFocusMode ? (
              <>
                <SoloBotHandsPanel state={gameState} />
                {botReviewHistory.length > 0 ? (
                  <BotReviewHistory
                    decisions={botReviewHistory}
                    onSelect={(scenario) => {
                      setSelectedBotReviewId(scenario.decisionId);
                      setIsBotReviewOpen(true);
                    }}
                    playerNames={gameState.playerNames}
                    selectedDecisionId={displayedBotReview?.decisionId ?? null}
                  />
                ) : null}
              </>
            ) : null}

            {shouldShowBotReviewAction(BOT_REVIEW_MODE_ENABLED, isAnalysisModeEnabled, isMobileLandscape, Boolean(lastBotReview), isFocusMode) && lastBotReview ? (
              <div className="grid gap-2">
                <button
                  className="justify-self-end rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-sm hover:bg-amber-100"
                  onClick={() => {
                    setSelectedBotReviewId(null);
                    setIsBotReviewOpen(true);
                  }}
                  type="button"
                >
                  Analyser ce coup
                </button>
                {isBotReviewOpen && displayedBotReview ? (
                  <BotReviewPanel
                    createFullBundle={(humanComment) => createBotReviewBundle(gameState, botReviewHistory, {
                      gameId: activeGameId(),
                      humanComment,
                      publicAuctions: botReviewPublicAuctions,
                      selectedDecisionId: displayedBotReview.decisionId,
                    })}
                    key={displayedBotReview.decisionId}
                    onClose={() => setIsBotReviewOpen(false)}
                    scenario={displayedBotReview}
                  />
                ) : null}
              </div>
            ) : null}

          </div>

        </div>
      </div>
      {gameState.phase === "finished" ? <RoundCompletionCard actionLabel="Manche suivante" onAction={handleNextRound} state={gameState} /> : null}
      {gameState.phase === "game-over" ? <RoundCompletionCard actionLabel="Nouvelle partie" onAction={handleNewGame} state={gameState} /> : null}
      {rulesDialog}
      {isNewGameConfirmationOpen ? <AccessibleDialog description="La donne en cours sera remplacée par une nouvelle partie." footer={<div className="flex justify-end gap-2"><button className={appSecondaryActionClass} onClick={() => setIsNewGameConfirmationOpen(false)} type="button">Continuer la partie</button><button className={appDangerActionClass} onClick={() => { setIsNewGameConfirmationOpen(false); handleNewGame(); }} type="button">Abandonner et redistribuer</button></div>} onClose={() => setIsNewGameConfirmationOpen(false)} title="Abandonner la partie ?"><div /></AccessibleDialog> : null}
      {isSettingsOpen ? <PlayerSettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}
    </main></>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import { BiddingPanel } from "@/components/BiddingPanel";
import { BotReviewHistory, BotReviewPanel } from "@/components/BotReviewPanel";
import { SoloBotHandsPanel } from "@/components/BotHandAnalysis";
import { GameTable } from "@/components/GameTable";
import { GameTopBar } from "@/components/GameTopBar";
import { HumanHand } from "@/components/HumanHand";
import { MobileLandscapeNotice } from "@/components/MobileLandscapeNotice";
import { RoundCompletionCard } from "@/components/RoundCompletionCard";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { RulesetSummary } from "@/components/rules/RulesetSummary";
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

const soloSeatAssignments = SOLO_SEAT_ASSIGNMENTS;
const localHumanPlayerId = firstHumanSeat(soloSeatAssignments) ?? 0;

export default function SoloPage() {
  const { preferences } = usePlayerPreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const gameIdRef = useRef(crypto.randomUUID());
  const hasInitializedRandomGameRef = useRef(false);
  const savedGameIdsRef = useRef(new Set<string>());
  const botDecisionNumberRef = useRef(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
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
    if (hasInitializedRandomGameRef.current) {
      return;
    }

    hasInitializedRandomGameRef.current = true;
    const savedRules = loadSoloRules(window.localStorage);
    setRulesInput(savedRules);
    setRulesDraft(savedRules);
    setGameState(createSoloGame(Math.random, buildCustomRuleset(savedRules)));
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
    const timeoutId = window.setTimeout(() => {
      setGameState((latest) => latest === currentState ? nextState : latest);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [gameState]);

  useEffect(() => {
    if (!gameState || gameState.phase !== "game-over" || savedGameIdsRef.current.has(gameIdRef.current)) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    let isCancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;

      if (!userId || isCancelled || savedGameIdsRef.current.has(gameIdRef.current)) {
        return;
      }

      savedGameIdsRef.current.add(gameIdRef.current);

      const { error } = await saveCompletedGame(supabase, gameState, userId);

      if (error) {
        savedGameIdsRef.current.delete(gameIdRef.current);
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
    gameIdRef.current = crypto.randomUUID();
    botDecisionNumberRef.current = 0;
    setLastBotReview(null);
    setBotReviewHistory(createEmptyBotReviewHistory());
    setBotReviewPublicAuctions([]);
    setSelectedBotReviewId(null);
    setIsBotReviewOpen(false);
  }

  function handleNewGame() {
    resetBotReview();
    setGameState(createSoloGame(Math.random, buildCustomRuleset(rulesInput)));
  }

  function applyRulesAndStartGame() {
    const safe = buildCustomRuleset(rulesDraft);
    const normalized = rulesetToCustomInput(safe);
    saveSoloRules(window.localStorage, normalized);
    setRulesInput(normalized);
    setRulesDraft(normalized);
    setIsRulesOpen(false);
    resetBotReview();
    setGameState(createSoloGame(Math.random, safe));
  }

  function handleNextRound() {
    dispatchGameAction({ type: "start-next-round" });
  }

  const rulesDialog = isRulesOpen ? <AccessibleDialog description="Ces règles s'appliqueront à la prochaine partie." footer={<div className="grid items-center gap-2 sm:grid-cols-[1fr_auto]"><div className="hidden sm:block"><RulesetSummary ruleset={buildCustomRuleset(rulesDraft)} compact /></div><button className={`${appPrimaryActionClass} w-full sm:w-auto`} type="button" onClick={applyRulesAndStartGame}>Appliquer et nouvelle partie</button></div>} onClose={() => setIsRulesOpen(false)} stableHeight title="Règles de la prochaine partie"><RulesetConfigurator value={rulesDraft} onChange={setRulesDraft} /></AccessibleDialog> : null;
  const soloMenuActions = [
    { label: "Règles de la prochaine partie", onSelect: () => { setRulesDraft(rulesInput); setIsRulesOpen(true); } },
    ...(BOT_REVIEW_MODE_ENABLED ? [{ label: `Mode développeur : ${isAnalysisModeEnabled ? "activé" : "désactivé"}`, onSelect: () => setIsAnalysisModeEnabled((current) => !current) }] : []),
    { label: "Abandonner et redistribuer", tone: "danger" as const, onSelect: () => setIsNewGameConfirmationOpen(true) },
  ];

  if (!gameState) {
    return (
      <main className="coinche-game-shell flex min-h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Préparation de la partie…
      </main>
    );
  }

  if (isMobilePortrait) {
    return <><GameTopBar contextLabel="Solo" focusMode={isFocusMode} menuActions={soloMenuActions} onOpenPreferences={() => setIsSettingsOpen(true)} onToggleFocusMode={() => setIsFocusMode((current) => !current)} preferencesLabel="Paramètres" /><MobileLandscapeNotice />{rulesDialog}{isSettingsOpen ? <PlayerSettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}</>;
  }

  return (
    <><GameTopBar contextLabel="Solo" focusMode={isFocusMode} menuActions={soloMenuActions} onOpenPreferences={() => setIsSettingsOpen(true)} onToggleFocusMode={() => setIsFocusMode((current) => !current)} preferencesLabel="Paramètres" /><main
      className={soloMainClassName(analysisDesktop, isMobileLandscape)}
    >
      <div className={soloContentClassName(analysisDesktop)}>
        <div
          className={soloGridClassName(analysisDesktop, isMobileLandscape)}
        >
          <div className={`flex min-h-0 flex-col gap-2 ${isMobileLandscape ? "gap-0" : ""}`}>
            <GameTable
              bottomOverlay={
                isMobileLandscape
                  ? gameState.phase === "bidding"
                    ? (
                        <BiddingPanel
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
                        />
                      )
                    : gameState.phase === "playing"
                      ? (
                          <HumanHand
                            canPlay={humanCanPlay}
                            cards={gameState.hands[localHumanPlayerId]}
                            contractMode={currentMode}
                            embedded
                            illegalCardMessage={illegalCardMessage}
                            legalCards={legalHumanCards}
                            onPlayCard={handlePlayCard}
                          />
                        )
                      : null
                  : undefined
              }
              immersiveMobileLandscape={isMobileLandscape}
              minimalHud={isFocusMode}
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
                      gameId: gameIdRef.current,
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

            {!isMobileLandscape && gameState.phase === "bidding" ? (
              <BiddingPanel
                bids={gameState.bids}
                biddingRules={gameRules?.bidding}
                canBid={humanCanBid}
                canCoinche={humanCanCoinche}
                canSurcoinche={humanCanSurcoinche}
                currentContract={currentContract}
                onBid={handleHumanBid}
                onCapot={handleHumanCapot}
                onGenerale={handleHumanGenerale}
                onCoinche={handleHumanCoinche}
                onPass={handleHumanPass}
                onSurcoinche={handleHumanSurcoinche}
                playerId={localHumanPlayerId}
              />
            ) : null}

            {!isMobileLandscape && (gameState.phase === "bidding" || gameState.phase === "playing") ? (
              <div>
                <HumanHand
                  canPlay={humanCanPlay}
                  cards={gameState.hands[localHumanPlayerId]}
                  contractMode={currentMode}
                  illegalCardMessage={illegalCardMessage}
                  legalCards={legalHumanCards}
                  onPlayCard={handlePlayCard}
                />
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

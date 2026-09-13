"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import { BiddingPanel } from "@/components/BiddingPanel";
import { BotReviewHistory, BotReviewPanel } from "@/components/BotReviewPanel";
import { SoloBotHandsPanel } from "@/components/BotHandAnalysis";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { MobileLandscapeNotice } from "@/components/MobileLandscapeNotice";
import { ScoreBoard } from "@/components/ScoreBoard";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { RulesetSummary } from "@/components/rules/RulesetSummary";
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
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
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
    const landscapeQuery = window.matchMedia("(max-width: 767px) and (orientation: landscape)");
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

  useEffect(() => {
    if (gameState?.phase === "playing") {
      setIsRightPanelOpen(false);
      return;
    }

    if (gameState?.phase === "finished" || gameState?.phase === "game-over") {
      setIsRightPanelOpen(true);
    }
  }, [gameState?.phase]);

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

  if (!gameState) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-100 text-sm text-stone-600">
        Préparation de la partie…
      </main>
    );
  }

  if (isMobilePortrait) {
    return <><MobileLandscapeNotice /><button className="fixed right-3 top-16 z-40 rounded-md border bg-white px-3 py-2 text-sm font-semibold shadow" onClick={() => setIsSettingsOpen(true)} type="button">Paramètres</button>{isSettingsOpen ? <PlayerSettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}</>;
  }

  return (
    <main
      className={soloMainClassName(analysisDesktop, isMobileLandscape)}
    >
      <div className={soloContentClassName(analysisDesktop)}>
        <div
          className={soloGridClassName(analysisDesktop, isMobileLandscape, isRightPanelOpen)}
        >
          <div className={`flex min-h-0 flex-col gap-2 ${isMobileLandscape ? "gap-0" : ""}`}>
            <div className={`flex items-center justify-end lg:hidden ${isMobileLandscape ? "hidden" : ""}`} />
            <div className={`flex items-center justify-end ${isMobileLandscape ? "hidden" : ""}`}>
              <button className="mr-2 rounded-md border border-stone-300 bg-white/90 px-2 py-1 text-xs font-semibold text-stone-700 shadow-sm hover:bg-white" type="button" onClick={() => setIsSettingsOpen(true)}>Paramètres</button>
              <button className="mr-2 rounded-md border border-stone-300 bg-white/90 px-2 py-1 text-xs font-semibold text-stone-700 shadow-sm hover:bg-white" type="button" onClick={() => { setRulesDraft(rulesInput); setIsRulesOpen(true); }}>Règles de la partie</button>
              {BOT_REVIEW_MODE_ENABLED ? (
                <button
                  aria-pressed={isAnalysisModeEnabled}
                  className={[
                    "mr-2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm",
                    isAnalysisModeEnabled
                      ? "border-amber-500 bg-amber-100 text-stone-950"
                      : "border-stone-300 bg-white/90 text-stone-700 hover:bg-white",
                  ].join(" ")}
                  onClick={() => setIsAnalysisModeEnabled((current) => !current)}
                  type="button"
                >
                  Mode analyse : {isAnalysisModeEnabled ? "activé" : "désactivé"}
                </button>
              ) : null}
              <button
                className="hidden rounded-md border border-stone-300 bg-white/90 px-2 py-1 text-xs font-semibold text-stone-700 shadow-sm hover:bg-white lg:inline-flex"
                onClick={() => setIsRightPanelOpen((current) => !current)}
                type="button"
              >
                {isRightPanelOpen ? "Masquer infos" : "Afficher infos"}
              </button>
            </div>
            {isMobileLandscape ? <button className="fixed right-1 top-[58px] z-40 rounded-md border border-white/40 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white" onClick={() => setIsSettingsOpen(true)} type="button">Paramètres</button> : null}

            <GameTable
              bottomOverlay={
                isMobileLandscape
                  ? gameState.phase === "bidding"
                    ? (
                        <BiddingPanel
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
              state={gameState}
              showLiveScore={preferences.assistance.showLivePoints}
            />

            {BOT_REVIEW_MODE_ENABLED && isAnalysisModeEnabled && !isMobileLandscape ? (
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

            {BOT_REVIEW_MODE_ENABLED && !isMobileLandscape && lastBotReview ? (
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
              />
            ) : null}

            {gameState.phase === "finished" ? (
              <div className="grid gap-2 lg:hidden">
                <button
                  className="rounded-md bg-stone-900 px-3 py-3 text-sm font-semibold text-white"
                  onClick={handleNextRound}
                  type="button"
                >
                  Manche suivante
                </button>
              </div>
            ) : null}

            {gameState.phase === "game-over" ? (
              <div className="grid gap-2 lg:hidden">
                <button
                  className="rounded-md bg-stone-900 px-3 py-3 text-sm font-semibold text-white"
                  onClick={handleNewGame}
                  type="button"
                >
                  Nouvelle partie
                </button>
              </div>
            ) : null}

            {!isMobileLandscape ? (
              <div className={gameState.phase === "bidding" ? "hidden sm:block" : ""}>
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

          {isRightPanelOpen && !isMobileLandscape ? (
            <ScoreBoard
              state={gameState}
              onNewGame={handleNewGame}
              onNextRound={handleNextRound}
            />
          ) : null}
        </div>
      </div>
      {isRulesOpen ? <div aria-modal="true" role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"><section className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-xl bg-[#f4f1e8] p-4 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-bold">Règles de la prochaine partie</h2><p className="text-xs text-stone-600">La partie en cours reste inchangée.</p></div><button className="rounded border px-3 py-1" type="button" onClick={() => setIsRulesOpen(false)}>Fermer</button></div><RulesetConfigurator value={rulesDraft} onChange={setRulesDraft} /><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><RulesetSummary ruleset={buildCustomRuleset(rulesDraft)} compact /><button className="rounded-lg bg-emerald-800 px-4 py-3 font-bold text-white" type="button" onClick={applyRulesAndStartGame}>Appliquer et nouvelle partie</button></div></section></div> : null}
      {isSettingsOpen ? <PlayerSettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}
    </main>
  );
}

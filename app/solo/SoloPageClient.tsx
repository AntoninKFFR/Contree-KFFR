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
import { applyGameAction, type GameAction } from "@/engine/actions";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
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
import type { BidValue, Card, GameState, Suit } from "@/engine/types";
import { resolveGameRules } from "@/engine/rulesets/resolve";
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
import { createSoloGame } from "@/app/solo/soloGameInitialization";

const soloSeatAssignments = SOLO_SEAT_ASSIGNMENTS;
const localHumanPlayerId = firstHumanSeat(soloSeatAssignments) ?? 0;

export default function SoloPage() {
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

  const humanCanPlay =
    gameState?.phase === "playing" &&
    isHumanSeat(soloSeatAssignments, gameState.currentPlayerId);
  const humanCanBid =
    gameState?.phase === "bidding" &&
    isHumanSeat(soloSeatAssignments, gameState.currentPlayerId);
  const currentContract = useMemo(() => gameState ? getCurrentContract(gameState) : null, [gameState]);
  const gameRules = useMemo(() => gameState ? resolveGameRules(gameState.settings) : null, [gameState]);
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
    setGameState(createSoloGame());
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

    const timeoutId = window.setTimeout(() => {
      const currentState = gameState;
      if (
        (currentState.phase !== "playing" && currentState.phase !== "bidding") ||
        !isBotSeat(soloSeatAssignments, currentState.currentPlayerId)
      ) {
        return;
      }

      botDecisionNumberRef.current += 1;
      const started = performance.now();

      if (currentState.phase === "bidding") {
        const { bid: botBid, biddingTrace } = chooseBotBidWithTrace(currentState);
        const elapsedMs = performance.now() - started;
        if (BOT_REVIEW_MODE_ENABLED) {
          const scenario = captureBotReviewScenario(currentState, {
            decisionNumber: botDecisionNumberRef.current,
            elapsedMs,
            chosenBid: botBid,
            biddingTrace,
          });
          setLastBotReview(scenario);
          setBotReviewHistory((history) => appendBotReviewHistory(history, scenario));
        }
        if (botBid.action === "bid") {
          const nextState = applyGameAction(currentState, {
              type: "bid",
              playerId: currentState.currentPlayerId,
              value: botBid.value,
              trump: botBid.trump,
          });
          if (BOT_REVIEW_MODE_ENABLED) {
            setBotReviewPublicAuctions((auctions) => updateBotReviewPublicAuctions(auctions, nextState));
          }
          setGameState(nextState);
          return;
        }
        const nextState = applyGameAction(currentState, {
            type: botBid.action,
            playerId: currentState.currentPlayerId,
        });
        if (BOT_REVIEW_MODE_ENABLED) {
          setBotReviewPublicAuctions((auctions) => updateBotReviewPublicAuctions(auctions, nextState));
        }
        setGameState(nextState);
        return;
      }

      const botCard = chooseBotCard(currentState);
      const elapsedMs = performance.now() - started;
      if (BOT_REVIEW_MODE_ENABLED) {
        const scenario = captureBotReviewScenario(currentState, {
          decisionNumber: botDecisionNumberRef.current,
          elapsedMs,
          chosenCard: botCard,
        });
        setLastBotReview(scenario);
        setBotReviewHistory((history) => appendBotReviewHistory(history, scenario));
      }
      setGameState(applyGameAction(currentState, {
          type: "play-card",
          playerId: currentState.currentPlayerId,
          card: botCard,
      }));
    }, 650);

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

  function handleHumanBid(value: BidValue, trump: Suit) {
    dispatchGameAction({ type: "bid", playerId: localHumanPlayerId, value, trump });
  }

  function handleHumanCapot(trump: Suit) {
    dispatchGameAction({ type: "capot", playerId: localHumanPlayerId, trump });
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

  function handleNewGame() {
    gameIdRef.current = crypto.randomUUID();
    botDecisionNumberRef.current = 0;
    setLastBotReview(null);
    setBotReviewHistory(createEmptyBotReviewHistory());
    setBotReviewPublicAuctions([]);
    setSelectedBotReviewId(null);
    setIsBotReviewOpen(false);
    setGameState(createSoloGame());
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
    return <MobileLandscapeNotice />;
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
                            embedded
                            legalCards={legalHumanCards}
                            onPlayCard={handlePlayCard}
                          />
                        )
                      : null
                  : undefined
              }
              immersiveMobileLandscape={isMobileLandscape}
              state={gameState}
              showLiveScore={isMobileLandscape || (!isRightPanelOpen && gameState.phase === "playing")}
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
    </main>
  );
}

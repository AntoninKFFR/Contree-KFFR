"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import { BiddingPanel } from "@/components/BiddingPanel";
import { BotReviewPanel } from "@/components/BotReviewPanel";
import { SoloBotHandsPanel } from "@/components/BotHandAnalysis";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { MobileLandscapeNotice } from "@/components/MobileLandscapeNotice";
import { ScoreBoard } from "@/components/ScoreBoard";
import { applyGameAction, type GameAction } from "@/engine/actions";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import {
  createInitialGame,
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
import { saveCompletedGame } from "@/lib/games";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  BOT_REVIEW_MODE_ENABLED,
  captureBotReviewScenario,
  type BotReviewScenarioV1,
} from "@/bots/botReview";
import { PRODUCT_SCORING_MODE } from "@/lib/productGame";

const initialRenderRandom = () => 0.42;
const soloSeatAssignments = SOLO_SEAT_ASSIGNMENTS;
const localHumanPlayerId = firstHumanSeat(soloSeatAssignments) ?? 0;

export default function SoloPage() {
  const gameIdRef = useRef(crypto.randomUUID());
  const savedGameIdsRef = useRef(new Set<string>());
  const botDecisionNumberRef = useRef(0);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGame(initialRenderRandom, {
      scoringMode: PRODUCT_SCORING_MODE,
    }),
  );
  const [lastBotReview, setLastBotReview] = useState<BotReviewScenarioV1 | null>(null);
  const [isBotReviewOpen, setIsBotReviewOpen] = useState(false);
  const [isAnalysisModeEnabled, setIsAnalysisModeEnabled] = useState(false);

  const humanCanPlay =
    gameState.phase === "playing" &&
    isHumanSeat(soloSeatAssignments, gameState.currentPlayerId);
  const humanCanBid =
    gameState.phase === "bidding" &&
    isHumanSeat(soloSeatAssignments, gameState.currentPlayerId);
  const currentContract = useMemo(() => getCurrentContract(gameState), [gameState]);
  const humanCanCoinche = humanCanBid && canCoinche(localHumanPlayerId, currentContract);
  const humanCanSurcoinche = humanCanBid && canSurcoinche(localHumanPlayerId, currentContract);
  const legalHumanCards = useMemo(() => {
    if (!humanCanPlay) return [];
    return playableCardsForCurrentPlayer(gameState);
  }, [gameState, humanCanPlay]);

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
    if (gameState.phase === "playing") {
      setIsRightPanelOpen(false);
      return;
    }

    if (gameState.phase === "finished" || gameState.phase === "game-over") {
      setIsRightPanelOpen(true);
    }
  }, [gameState.phase]);

  function dispatchGameAction(action: GameAction) {
    setGameState((currentState) => applyGameAction(currentState, action));
  }

  useEffect(() => {
    if (
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
          setLastBotReview(captureBotReviewScenario(currentState, {
            decisionNumber: botDecisionNumberRef.current,
            elapsedMs,
            chosenBid: botBid,
            biddingTrace,
          }));
        }
        if (botBid.action === "bid") {
          setGameState(applyGameAction(currentState, {
              type: "bid",
              playerId: currentState.currentPlayerId,
              value: botBid.value,
              trump: botBid.trump,
          }));
          return;
        }
        setGameState(applyGameAction(currentState, {
            type: botBid.action,
            playerId: currentState.currentPlayerId,
        }));
        return;
      }

      const botCard = chooseBotCard(currentState);
      const elapsedMs = performance.now() - started;
      if (BOT_REVIEW_MODE_ENABLED) {
        setLastBotReview(captureBotReviewScenario(currentState, {
          decisionNumber: botDecisionNumberRef.current,
          elapsedMs,
          chosenCard: botCard,
        }));
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
    if (gameState.phase !== "game-over" || savedGameIdsRef.current.has(gameIdRef.current)) {
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
    setIsBotReviewOpen(false);
    setGameState(
      createInitialGame(Math.random, {
        scoringMode: PRODUCT_SCORING_MODE,
      }),
    );
  }

  function handleNextRound() {
    dispatchGameAction({ type: "start-next-round" });
  }

  if (isMobilePortrait) {
    return <MobileLandscapeNotice />;
  }

  return (
    <main
      className={[
        "min-h-[calc(100dvh-56px)] overflow-x-hidden overflow-y-auto bg-[#f4f1e8] px-3 py-2 text-stone-950 sm:px-4 lg:h-[calc(100dvh-56px)] lg:overflow-hidden",
        isMobileLandscape ? "overflow-hidden px-0 py-0 sm:px-4" : "",
      ].join(" ")}
    >
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-2">
        <div
          className={[
            "grid min-h-0 flex-1 gap-2",
            isMobileLandscape
              ? "grid-cols-[minmax(0,1fr)]"
              : isRightPanelOpen
                ? "lg:grid-cols-[minmax(0,1fr)_310px]"
                : "lg:grid-cols-[minmax(0,1fr)]",
          ].join(" ")}
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
              <SoloBotHandsPanel state={gameState} />
            ) : null}

            {BOT_REVIEW_MODE_ENABLED && !isMobileLandscape && lastBotReview ? (
              <div className="grid gap-2">
                <button
                  className="justify-self-end rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-sm hover:bg-amber-100"
                  onClick={() => setIsBotReviewOpen(true)}
                  type="button"
                >
                  Analyser ce coup
                </button>
                {isBotReviewOpen ? (
                  <BotReviewPanel
                    key={lastBotReview.decisionId}
                    onClose={() => setIsBotReviewOpen(false)}
                    scenario={lastBotReview}
                  />
                ) : null}
              </div>
            ) : null}

            {!isMobileLandscape && gameState.phase === "bidding" ? (
              <BiddingPanel
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

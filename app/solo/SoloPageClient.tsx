"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chooseBotBid, chooseBotCard } from "@/bots/simpleBot";
import { BiddingPanel } from "@/components/BiddingPanel";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { MobileLandscapeNotice } from "@/components/MobileLandscapeNotice";
import { ScoreBoard } from "@/components/ScoreBoard";
import { applyGameAction, type GameAction } from "@/engine/actions";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import {
  createInitialGame,
  getDefaultTargetScore,
  getCurrentContract,
  playableCardsForCurrentPlayer,
} from "@/engine/game";
import {
  firstHumanSeat,
  isBotSeat,
  isHumanSeat,
  SOLO_SEAT_ASSIGNMENTS,
} from "@/engine/seats";
import type { BidValue, Card, GameState, ScoringMode, Suit } from "@/engine/types";
import { saveCompletedGame } from "@/lib/games";
import { getSupabaseClient } from "@/lib/supabaseClient";

const initialRenderRandom = () => 0.42;
const soloSeatAssignments = SOLO_SEAT_ASSIGNMENTS;
const localHumanPlayerId = firstHumanSeat(soloSeatAssignments) ?? 0;

export default function SoloPage() {
  const gameIdRef = useRef(crypto.randomUUID());
  const savedGameIdsRef = useRef(new Set<string>());
  const [scoringMode, setScoringMode] = useState<ScoringMode>("made-points");
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGame(initialRenderRandom, {
      scoringMode: "made-points",
      targetScore: getDefaultTargetScore("made-points"),
    }),
  );

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
      setGameState((currentState) => {
        if (
          (currentState.phase !== "playing" && currentState.phase !== "bidding") ||
          !isBotSeat(soloSeatAssignments, currentState.currentPlayerId)
        ) {
          return currentState;
        }

        if (currentState.phase === "bidding") {
          const botBid = chooseBotBid(currentState);
          if (botBid.action === "bid") {
            return applyGameAction(currentState, {
              type: "bid",
              playerId: currentState.currentPlayerId,
              value: botBid.value,
              trump: botBid.trump,
            });
          }

          return applyGameAction(currentState, {
            type: botBid.action,
            playerId: currentState.currentPlayerId,
          });
        }

        const botCard = chooseBotCard(currentState);
        return applyGameAction(currentState, {
          type: "play-card",
          playerId: currentState.currentPlayerId,
          card: botCard,
        });
      });
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
    setGameState(
      createInitialGame(Math.random, {
        scoringMode,
        targetScore: getDefaultTargetScore(scoringMode),
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
        <div className={`flex shrink-0 justify-end ${isMobileLandscape ? "hidden" : ""}`}>
          <select
            aria-label="Mode de score"
            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-semibold shadow-sm"
            onChange={(event) => setScoringMode(event.target.value as ScoringMode)}
            value={scoringMode}
          >
            <option value="made-points">Points faits</option>
            <option value="announced-points">Points annonces</option>
          </select>
        </div>

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

            {!isMobileLandscape && gameState.phase === "bidding" ? (
              <BiddingPanel
                canBid={humanCanBid}
                canCoinche={humanCanCoinche}
                canSurcoinche={humanCanSurcoinche}
                currentContract={currentContract}
                onBid={handleHumanBid}
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

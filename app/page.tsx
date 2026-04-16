"use client";

import { useEffect, useMemo, useState } from "react";
import { chooseBotBid, chooseBotCard, isBotPlayer } from "@/bots/simpleBot";
import { BiddingPanel } from "@/components/BiddingPanel";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { ScoreBoard } from "@/components/ScoreBoard";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import {
  createInitialGame,
  getCurrentContract,
  makeBid,
  playableCardsForCurrentPlayer,
  playCard,
} from "@/engine/game";
import type { BidValue, Card, GameState, ScoringMode, Suit } from "@/engine/types";

const initialRenderRandom = () => 0.42;

export default function Home() {
  const [scoringMode, setScoringMode] = useState<ScoringMode>("made-points");
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGame(initialRenderRandom, { scoringMode: "made-points" }),
  );

  const humanCanPlay = gameState.phase === "playing" && gameState.currentPlayerId === 0;
  const humanCanBid = gameState.phase === "bidding" && gameState.currentPlayerId === 0;
  const currentContract = useMemo(() => getCurrentContract(gameState), [gameState]);
  const humanCanCoinche = humanCanBid && canCoinche(0, currentContract);
  const humanCanSurcoinche = humanCanBid && canSurcoinche(0, currentContract);
  const legalHumanCards = useMemo(() => {
    if (!humanCanPlay) return [];
    return playableCardsForCurrentPlayer(gameState);
  }, [gameState, humanCanPlay]);

  useEffect(() => {
    if (
      (gameState.phase !== "playing" && gameState.phase !== "bidding") ||
      !isBotPlayer(gameState.currentPlayerId)
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGameState((currentState) => {
        if (
          (currentState.phase !== "playing" && currentState.phase !== "bidding") ||
          !isBotPlayer(currentState.currentPlayerId)
        ) {
          return currentState;
        }

        if (currentState.phase === "bidding") {
          const botBid = chooseBotBid(currentState);
          return makeBid(currentState, currentState.currentPlayerId, botBid);
        }

        const botCard = chooseBotCard(currentState);
        return playCard(currentState, currentState.currentPlayerId, botCard);
      });
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [gameState]);

  function handlePlayCard(card: Card) {
    setGameState((currentState) => playCard(currentState, 0, card));
  }

  function handleHumanBid(value: BidValue, trump: Suit) {
    setGameState((currentState) => makeBid(currentState, 0, { action: "bid", value, trump }));
  }

  function handleHumanPass() {
    setGameState((currentState) => makeBid(currentState, 0, { action: "pass" }));
  }

  function handleHumanCoinche() {
    setGameState((currentState) => makeBid(currentState, 0, { action: "coinche" }));
  }

  function handleHumanSurcoinche() {
    setGameState((currentState) => makeBid(currentState, 0, { action: "surcoinche" }));
  }

  function handleNewGame() {
    setGameState(createInitialGame(Math.random, { scoringMode }));
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              Coinche / Contree V1
            </p>
            <h1 className="text-3xl font-bold text-stone-950 sm:text-4xl">
              Anto et Boulais contre Max et Allan
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-stone-700">
            Clique une carte quand c&apos;est ton tour. Les bots jouent seuls, le pli gagnant rejoue.
          </p>
        </header>

        <section className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-stone-500">Mode de score</p>
            <p className="text-sm text-stone-700">
              Choisis le mode, puis lance une nouvelle partie.
            </p>
          </div>
          <select
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold"
            onChange={(event) => setScoringMode(event.target.value as ScoringMode)}
            value={scoringMode}
          >
            <option value="made-points">Points faits</option>
            <option value="announced-points">Points annonces</option>
          </select>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <GameTable state={gameState} />
          <ScoreBoard state={gameState} onNewGame={handleNewGame} />
        </div>

        {gameState.phase === "bidding" ? (
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

        <HumanHand
          canPlay={humanCanPlay}
          cards={gameState.hands[0]}
          legalCards={legalHumanCards}
          onPlayCard={handlePlayCard}
        />
      </div>
    </main>
  );
}

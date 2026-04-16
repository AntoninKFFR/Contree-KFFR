"use client";

import { useEffect, useMemo, useState } from "react";
import { chooseBotCard, isBotPlayer } from "@/bots/simpleBot";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { ScoreBoard } from "@/components/ScoreBoard";
import { createInitialGame, playableCardsForCurrentPlayer, playCard } from "@/engine/game";
import type { Card, GameState } from "@/engine/types";

const initialRenderRandom = () => 0.42;

export default function Home() {
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGame(initialRenderRandom),
  );

  const humanCanPlay = gameState.phase === "playing" && gameState.currentPlayerId === 0;
  const legalHumanCards = useMemo(() => {
    if (!humanCanPlay) return [];
    return playableCardsForCurrentPlayer(gameState);
  }, [gameState, humanCanPlay]);

  useEffect(() => {
    if (gameState.phase !== "playing" || !isBotPlayer(gameState.currentPlayerId)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGameState((currentState) => {
        if (currentState.phase !== "playing" || !isBotPlayer(currentState.currentPlayerId)) {
          return currentState;
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

  function handleNewGame() {
    setGameState(createInitialGame());
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
              Toi contre trois bots
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-stone-700">
            Clique une carte quand c&apos;est ton tour. Les bots jouent seuls, le pli gagnant rejoue.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <GameTable state={gameState} />
          <ScoreBoard state={gameState} onNewGame={handleNewGame} />
        </div>

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

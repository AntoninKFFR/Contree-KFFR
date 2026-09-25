"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseBotBidWithTrace, chooseBotCard } from "@/bots/simpleBot";
import { applyGameAction, type GameAction } from "@/engine/actions";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { resolveContractMode } from "@/engine/contractMode";
import { createInitialGame, getCurrentContract, playableCardsForCurrentPlayer } from "@/engine/game";
import { resolveGameRules, createGameSettings } from "@/engine/rulesets/resolve";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import { firstHumanSeat, isBotSeat, isHumanSeat, SOLO_SEAT_ASSIGNMENTS } from "@/engine/seats";
import type { GameState } from "@/engine/types";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";
import { scheduleSoloBotTurn, soloBotCollectionKey, type SoloBotTurnPacer } from "@/lib/soloBotPacing";
import { queueForcedHumanLastCard } from "@/lib/soloLastTrick";

const humanPlayerId = firstHumanSeat(SOLO_SEAT_ASSIGNMENTS) ?? 0;

export type SoloBotDecision =
  | { kind: "bid"; state: GameState; decisionNumber: number; elapsedMs: number;
      chosenBid: ReturnType<typeof chooseBotBidWithTrace>["bid"];
      biddingTrace: ReturnType<typeof chooseBotBidWithTrace>["biddingTrace"] }
  | { kind: "card"; state: GameState; decisionNumber: number; elapsedMs: number;
      chosenCard: ReturnType<typeof chooseBotCard> };

export type SoloGameLoopOptions = {
  preferences: PlayerPreferences;
  effectiveReducedMotion: boolean;
  paused?: boolean;
  /** A hidden table cannot send a collection-complete signal. */
  tableVisible?: boolean;
  onGameStart?: () => void;
  onBotDecision?: (decision: SoloBotDecision) => void;
  onBiddingStateChange?: (state: GameState) => void;
};

/** Shared browser-only Solo loop. Persistence and presentation belong to its caller. */
export function useSoloGameLoop({
  preferences,
  effectiveReducedMotion,
  paused = false,
  tableVisible = true,
  onGameStart,
  onBotDecision,
  onBiddingStateChange,
}: SoloGameLoopOptions) {
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const reducedMotionRef = useRef(effectiveReducedMotion);
  reducedMotionRef.current = effectiveReducedMotion;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const callbacksRef = useRef({ onGameStart, onBotDecision, onBiddingStateChange });
  callbacksRef.current = { onGameStart, onBotDecision, onBiddingStateChange };
  const botTurnPacerRef = useRef<SoloBotTurnPacer | null>(null);
  const collectedTrickKeysRef = useRef(new Set<string>());
  const botDecisionNumberRef = useRef(0);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const humanCanPlay = !paused && gameState?.phase === "playing"
    && isHumanSeat(SOLO_SEAT_ASSIGNMENTS, gameState.currentPlayerId);
  const humanCanBid = !paused && gameState?.phase === "bidding"
    && isHumanSeat(SOLO_SEAT_ASSIGNMENTS, gameState.currentPlayerId);
  const currentContract = useMemo(() => gameState ? getCurrentContract(gameState) : null, [gameState]);
  const gameRules = useMemo(() => gameState ? resolveGameRules(gameState.settings) : null, [gameState]);
  const currentMode = useMemo(() => gameState ? resolveContractMode(gameState) : null, [gameState]);
  const humanCanCoinche = humanCanBid && canCoinche(humanPlayerId, currentContract, gameRules?.bidding);
  const humanCanSurcoinche = humanCanBid && canSurcoinche(humanPlayerId, currentContract, gameRules?.bidding);
  const legalHumanCards = useMemo(() => {
    if (!humanCanPlay || !gameState) return [];
    return playableCardsForCurrentPlayer(gameState);
  }, [gameState, humanCanPlay]);

  function dispatchGameAction(action: GameAction) {
    if (!gameState || pausedRef.current) return;
    const nextState = applyGameAction(gameState, action);
    if (gameState.phase === "bidding") callbacksRef.current.onBiddingStateChange?.(nextState);
    setGameState(nextState);
  }

  function startGame(ruleset?: GameRulesetSnapshot) {
    botDecisionNumberRef.current = 0;
    collectedTrickKeysRef.current.clear();
    callbacksRef.current.onGameStart?.();
    setGameState(createInitialGame(Math.random, createGameSettings(ruleset ? { ruleset } : {})));
  }

  function startNextRound() {
    dispatchGameAction({ type: "start-next-round" });
  }

  const onAutoCollectComplete = useCallback((trickKey: string) => {
    collectedTrickKeysRef.current.add(trickKey);
    botTurnPacerRef.current?.autoCollected(trickKey);
  }, []);

  useEffect(() => {
    if (paused || !gameState || (gameState.phase !== "playing" && gameState.phase !== "bidding")
      || !isBotSeat(SOLO_SEAT_ASSIGNMENTS, gameState.currentPlayerId)) return;

    const currentState = gameState;
    botDecisionNumberRef.current += 1;
    const decisionNumber = botDecisionNumberRef.current;
    const started = performance.now();
    let nextState: GameState;
    if (currentState.phase === "bidding") {
      const { bid: botBid, biddingTrace } = chooseBotBidWithTrace(currentState);
      callbacksRef.current.onBotDecision?.({ kind: "bid", state: currentState, decisionNumber,
        elapsedMs: performance.now() - started, chosenBid: botBid, biddingTrace });
      nextState = botBid.action === "bid" || botBid.action === "generale"
        ? applyGameAction(currentState, { type: botBid.action, playerId: currentState.currentPlayerId,
            ...("value" in botBid ? { value: botBid.value } : {}),
            ...("trump" in botBid ? { trump: botBid.trump } : {}),
            contractMode: botBid.contractMode } as GameAction)
        : applyGameAction(currentState, { type: botBid.action, playerId: currentState.currentPlayerId });
      callbacksRef.current.onBiddingStateChange?.(nextState);
    } else {
      const botCard = chooseBotCard(currentState);
      callbacksRef.current.onBotDecision?.({ kind: "card", state: currentState, decisionNumber,
        elapsedMs: performance.now() - started, chosenCard: botCard });
      nextState = applyGameAction(currentState, { type: "play-card", playerId: currentState.currentPlayerId, card: botCard });
    }
    const currentPreferences = preferencesRef.current;
    const delayMs = currentState.phase === "bidding"
      ? currentPreferences.gameplay.biddingDelayMs : currentPreferences.gameplay.botDelayMs;
    const collectionKey = soloBotCollectionKey(currentState, currentPreferences, reducedMotionRef.current);
    const pacer = scheduleSoloBotTurn(delayMs, collectionKey,
      () => setGameState((latest) => !pausedRef.current && latest === currentState ? nextState : latest));
    botTurnPacerRef.current = pacer;
    if (collectionKey && collectedTrickKeysRef.current.has(collectionKey)) pacer.autoCollected(collectionKey);
    return () => {
      pacer.cancel();
      if (botTurnPacerRef.current === pacer) botTurnPacerRef.current = null;
    };
  }, [gameState, paused]);

  useEffect(() => {
    if (gameState && (!tableVisible || soloBotCollectionKey(gameState, preferences, effectiveReducedMotion) === null)) {
      botTurnPacerRef.current?.releaseCollection();
    }
  }, [effectiveReducedMotion, gameState, paused, preferences, tableVisible]);

  useEffect(() => {
    if (paused || !gameState || !isHumanSeat(SOLO_SEAT_ASSIGNMENTS, gameState.currentPlayerId)) return;
    return queueForcedHumanLastCard(gameState, humanPlayerId, preferencesRef.current.gameplay.botDelayMs,
      (currentState, card) => {
        setGameState((latest) => !pausedRef.current && latest === currentState
          ? applyGameAction(latest, { type: "play-card", playerId: humanPlayerId, card }) : latest);
      });
  }, [gameState, paused]);

  return {
    gameState,
    humanPlayerId,
    humanCanPlay,
    humanCanBid,
    humanCanCoinche,
    humanCanSurcoinche,
    legalHumanCards,
    currentContract,
    gameRules,
    currentMode,
    dispatchGameAction,
    startGame,
    startNextRound,
    onAutoCollectComplete,
  };
}

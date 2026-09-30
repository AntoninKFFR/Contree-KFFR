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
import { rulesetToCustomInput } from "@/engine/rulesets/custom";
import type { SoloSession, SoloIntent, SoloTransport } from "./sessionTypes";

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
  transport?: SoloTransport;
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
  transport,
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
  const sessionRef = useRef<SoloSession | null>(null);
  const generationRef = useRef(0);
  const pendingRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(Boolean(transport));
  const [isBusy, setIsBusy] = useState(Boolean(transport));
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  function synchronize(work: () => Promise<SoloSession | null>, fallback?: () => void) {
    const generation = generationRef.current;
    const run = () => {
      busyRef.current = true;
      setIsBusy(true);
      setConnectionError(null);
      void work().then((result) => {
        if (generation !== generationRef.current) return;
        sessionRef.current = result;
        setSessionId(result?.id ?? null);
        if (result) {
          if (result.state.phase === "bidding" || gameState?.phase === "bidding") callbacksRef.current.onBiddingStateChange?.(result.state);
          setGameState(result.state);
        } else fallback?.();
        pendingRef.current = null;
      }).catch(() => {
        if (generation === generationRef.current) setConnectionError("La partie n’a pas pu être synchronisée. Réessaie pour continuer.");
      }).finally(() => {
        if (generation === generationRef.current) { busyRef.current = false; setIsBusy(false); }
      });
    };
    pendingRef.current = run;
    run();
  }
  useEffect(() => {
    if (!transport) return;
    synchronize(() => transport.load());
    return () => { generationRef.current += 1; };
    // Transport is a stable caller-owned adapter; presentation rerenders don't reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);

  function remoteMove(intent: SoloIntent) {
    const current = sessionRef.current;
    if (!current || !transport || busyRef.current) return;
    synchronize(() => transport.move(current, intent));
  }

  const humanCanPlay = !paused && !isBusy && !connectionError && gameState?.phase === "playing"
    && isHumanSeat(SOLO_SEAT_ASSIGNMENTS, gameState.currentPlayerId);
  const humanCanBid = !paused && !isBusy && !connectionError && gameState?.phase === "bidding"
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
    if (sessionRef.current) { remoteMove(action); return; }
    const nextState = applyGameAction(gameState, action);
    if (gameState.phase === "bidding") callbacksRef.current.onBiddingStateChange?.(nextState);
    setGameState(nextState);
  }

  function startGame(ruleset?: GameRulesetSnapshot) {
    if (busyRef.current) return;
    generationRef.current += 1;
    botDecisionNumberRef.current = 0;
    collectedTrickKeysRef.current.clear();
    callbacksRef.current.onGameStart?.();
    const local = () => setGameState(createInitialGame(Math.random, createGameSettings(ruleset ? { ruleset } : {})));
    if (transport) {
      const startKey = crypto.randomUUID();
      synchronize(() => transport.start(ruleset ? rulesetToCustomInput(ruleset) : { presetId: "contree-kffr" }, startKey), local);
    } else local();
  }

  function startNextRound() {
    dispatchGameAction({ type: "start-next-round" });
  }

  const onAutoCollectComplete = useCallback((trickKey: string) => {
    collectedTrickKeysRef.current.add(trickKey);
    botTurnPacerRef.current?.autoCollected(trickKey);
  }, []);

  useEffect(() => {
    if (paused || isBusy || connectionError || !gameState || (gameState.phase !== "playing" && gameState.phase !== "bidding")
      || !isBotSeat(SOLO_SEAT_ASSIGNMENTS, gameState.currentPlayerId)) return;

    const currentState = gameState;
    if (sessionRef.current) {
      // Developer analysis remains available, but this local trace never drives
      // the trusted state: the request asks the server to choose the bot action.
      if (callbacksRef.current.onBotDecision) {
        botDecisionNumberRef.current += 1;
        const started = performance.now();
        if (currentState.phase === "bidding") {
          const { bid, biddingTrace } = chooseBotBidWithTrace(currentState);
          callbacksRef.current.onBotDecision({ kind: "bid", state: currentState, decisionNumber: botDecisionNumberRef.current,
            elapsedMs: performance.now() - started, chosenBid: bid, biddingTrace });
        } else {
          const chosenCard = chooseBotCard(currentState);
          callbacksRef.current.onBotDecision({ kind: "card", state: currentState, decisionNumber: botDecisionNumberRef.current,
            elapsedMs: performance.now() - started, chosenCard });
        }
      }
      const delayMs = currentState.phase === "bidding" ? preferencesRef.current.gameplay.biddingDelayMs : preferencesRef.current.gameplay.botDelayMs;
      const collectionKey = soloBotCollectionKey(currentState, preferencesRef.current, reducedMotionRef.current);
      const pacer = scheduleSoloBotTurn(delayMs, collectionKey, () => {
        if (!pausedRef.current) remoteMove({ type: "advance-bot" });
      });
      botTurnPacerRef.current = pacer;
      if (collectionKey && collectedTrickKeysRef.current.has(collectionKey)) pacer.autoCollected(collectionKey);
      return () => { pacer.cancel(); if (botTurnPacerRef.current === pacer) botTurnPacerRef.current = null; };
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, paused, isBusy, connectionError]);

  useEffect(() => {
    if (gameState && (!tableVisible || soloBotCollectionKey(gameState, preferences, effectiveReducedMotion) === null)) {
      botTurnPacerRef.current?.releaseCollection();
    }
  }, [effectiveReducedMotion, gameState, paused, preferences, tableVisible]);

  useEffect(() => {
    if (paused || isBusy || connectionError || !gameState || !isHumanSeat(SOLO_SEAT_ASSIGNMENTS, gameState.currentPlayerId)) return;
    return queueForcedHumanLastCard(gameState, humanPlayerId, preferencesRef.current.gameplay.botDelayMs,
      (currentState, card) => {
        if (sessionRef.current) { remoteMove({ type: "play-card", playerId: humanPlayerId, card }); return; }
        setGameState((latest) => !pausedRef.current && latest === currentState
          ? applyGameAction(latest, { type: "play-card", playerId: humanPlayerId, card }) : latest);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, paused, isBusy, connectionError]);

  return {
    gameState,
    sessionId,
    isBusy,
    connectionError,
    retrySynchronization: () => { if (!busyRef.current) pendingRef.current?.(); },
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

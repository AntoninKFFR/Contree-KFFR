"use client";

import React, { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CardView } from "@/components/CardView";
import { PlayerPanel } from "@/components/PlayerPanel";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { formatContractLabel, formatContractMode, resolveContractMode } from "@/engine/contractMode";
import { getContractProgress, getPublicRoundPoints } from "@/engine/contractProgress";
import { inactivePlayerId as inactivePlayerForState } from "@/engine/activePlayers";
import { playerName, teamName } from "@/engine/players";
import { playerTeam } from "@/engine/rules";
import type {
  Bid,
  CompletedTrick,
  Contract,
  GameState,
  PlayedCard,
  PlayerId,
} from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";
import { playPreferenceSound } from "@/lib/preferences/audio";
import { getTrickPresentationPolicy, isPreferenceAnimationEnabled } from "@/lib/preferences/presentation";
import type { RoomPlayerView } from "@/lib/roomTypes";
import {
  observeCompletedTricks,
  selectVisualTrick,
  type PresentedTrick,
  type TrickObservation,
} from "@/lib/trickPresentation";

type GameTableState = GameState | PlayerGameView;
type TableSeats = { bottom: PlayerId; right: PlayerId; top: PlayerId; left: PlayerId };

export function tableSeatsFor(state: GameTableState): TableSeats {
  const bottom = "viewerPlayerId" in state ? state.viewerPlayerId : 0;
  return {
    bottom,
    right: ((bottom + 1) % 4) as PlayerId,
    top: ((bottom + 2) % 4) as PlayerId,
    left: ((bottom + 3) % 4) as PlayerId,
  };
}

export function inactivePlayerMessage(state: GameTableState): string | null {
  const inactive = "inactivePlayerId" in state ? state.inactivePlayerId : inactivePlayerForState(state);
  return inactive === null ? null : `${playerName(inactive, state.playerNames)} ne joue pas cette donne.`;
}

type GameTableProps = {
  state: GameTableState;
  hand?: ReactNode;
  biddingControls?: ReactNode;
  immersiveMobileLandscape?: boolean;
  players?: RoomPlayerView[];
  presentationScope?: string;
  showLiveScore?: boolean;
  minimalHud?: boolean;
  turnSecondsRemaining?: number | null;
  trickPresentationPolicy?: { autoCollect: boolean; delayMs: number };
};

type AnnouncementBubbleContent = {
  label: string;
  detail?: string;
  tone: "neutral" | "accent";
};

function formatBidLabel(bid: Bid): AnnouncementBubbleContent {
  if (bid.action === "pass") {
    return { label: "Passe", tone: "neutral" };
  }

  if (bid.action === "coinche") {
    return { label: "Coinche", tone: "accent" };
  }

  if (bid.action === "surcoinche") {
    return { label: "Surcoinche", tone: "accent" };
  }

  if (bid.action === "capot") {
    return { label: `Capot ${formatContractMode(resolveContractMode(bid)!)}`, tone: "accent" };
  }

  if (bid.action === "generale") {
    return { label: `Générale ${formatContractMode(resolveContractMode(bid)!)}`, tone: "accent" };
  }

  return {
    label: `${bid.value} ${formatContractMode(resolveContractMode(bid)!)}`,
    tone: "accent",
  };
}

function formatFinalContract(contract: Contract): AnnouncementBubbleContent {
  const label = formatContractLabel(contract);
  if (contract.status === "surcoinched") {
    return {
      label,
      detail: "Surcoinchee",
      tone: "accent",
    };
  }

  if (contract.status === "coinched") {
    return {
      label,
      detail: "Coinchee",
      tone: "accent",
    };
  }

  return {
    label,
    tone: "accent",
  };
}

function latestBidKey(roundNumber: number, bids: Bid[]): string | null {
  const latestBid = bids.at(-1);

  if (!latestBid) return null;

  if (latestBid.action === "bid" || latestBid.action === "capot" || latestBid.action === "generale") {
    const amount = latestBid.action === "capot" ? "capot" : latestBid.action === "generale" ? "generale" : latestBid.value;
    return `${roundNumber}-${bids.length}-${latestBid.playerId}-${latestBid.action}-${amount}-${latestBid.trump}`;
  }

  return `${roundNumber}-${bids.length}-${latestBid.playerId}-${latestBid.action}`;
}

function bidKey(roundNumber: number, bidsLength: number, bid: Bid): string {
  if (bid.action === "bid" || bid.action === "capot" || bid.action === "generale") {
    const amount = bid.action === "capot" ? "capot" : bid.action === "generale" ? "generale" : bid.value;
    return `${roundNumber}-${bidsLength}-${bid.playerId}-${bid.action}-${amount}-${bid.trump}`;
  }

  return `${roundNumber}-${bidsLength}-${bid.playerId}-${bid.action}`;
}

function dominantBidPlayerId(bids: Bid[]): PlayerId | null {
  for (let index = bids.length - 1; index >= 0; index -= 1) {
    const bid = bids[index];
    if (bid.action === "bid" || bid.action === "capot" || bid.action === "generale") {
      return bid.playerId;
    }
  }

  return null;
}

function trickCollectionOffset(winnerId: PlayerId, seats: TableSeats): { x: string; y: string } {
  if (winnerId === seats.top) return { x: "0px", y: "calc(-40vh + 2rem)" };
  if (winnerId === seats.left) return { x: "calc(-50vw + 5rem)", y: "0px" };
  if (winnerId === seats.right) return { x: "calc(50vw - 5rem)", y: "0px" };
  return { x: "0px", y: "32vh" };
}

function TrickCard({ played, position, animate }: { played: PlayedCard; position: keyof TableSeats; animate: boolean }) {
  const { effectiveReducedMotion, preferences } = usePlayerPreferences();
  return (
    <div className={`coinche-trick-card coinche-trick-card--${position}`} data-player-id={played.playerId}>
      <CardView card={played.card} className={animate && isPreferenceAnimationEnabled(preferences, "card-play", effectiveReducedMotion) ? `coinche-card-play-from-${position}` : ""} disabled muted={false} size="compact" />
    </div>
  );
}

function TrickCenter({ cards, seats, animate = true }: { cards: PlayedCard[]; seats: TableSeats; animate?: boolean }) {
  return (
    <div aria-label="Cartes du pli" className="coinche-trick-area absolute left-1/2 top-[43%] -translate-x-1/2 -translate-y-1/2">
      {cards.map((played) => {
        const position = (Object.keys(seats) as (keyof TableSeats)[]).find((seat) => seats[seat] === played.playerId)!;
        return <TrickCard animate={animate} key={`${played.playerId}-${played.card.rank}-${played.card.suit}`} played={played} position={position} />;
      })}
    </div>
  );
}

function TrickCollectionAnimation({
  animate,
  durationMs,
  trick,
  seats,
}: {
  animate: boolean;
  durationMs: number;
  trick: CompletedTrick;
  seats: TableSeats;
}) {
  const offset = trickCollectionOffset(trick.winnerId, seats);

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute inset-0 z-20 ${animate ? "coinche-trick-collect" : ""}`}
      role="status"
      style={
        {
          "--coinche-trick-collect-x": offset.x,
          "--coinche-trick-collect-y": offset.y,
          animationDuration: `${durationMs}ms`,
        } as React.CSSProperties
      }
    >
      <TrickCenter animate={false} cards={trick.cards} seats={seats} />
    </div>
  );
}

function AnnouncementBubble({
  content,
  animate,
  className,
  isDominant,
}: {
  content: AnnouncementBubbleContent;
  animate: boolean;
  className: string;
  isDominant: boolean;
}) {
  const { effectiveReducedMotion, preferences } = usePlayerPreferences();
  const shouldAnimate = animate && isPreferenceAnimationEnabled(preferences, "bidding", effectiveReducedMotion);
  return (
    <div
      className={[
        "pointer-events-none absolute z-10 flex min-h-[28px] w-[68px] flex-col items-center justify-center rounded-full border px-1.5 py-1 shadow-lg backdrop-blur-md sm:min-h-[34px] sm:w-[104px] sm:px-2.5",
        content.tone === "accent"
          ? "border-[#ead8a6]/25 bg-[#f8f2df]/95 text-stone-900"
          : "border-white/10 bg-black/25 text-white/65 opacity-80",
        isDominant && content.tone === "accent"
          ? "ring-1 ring-emerald-600/50"
          : "",
        className,
        shouldAnimate ? "coinche-bid-bubble-enter" : "",
      ].join(" ")}
    >
      <p
        className={[
          "text-center leading-none tracking-[0.01em]",
          content.tone === "accent"
            ? "text-[9px] font-bold text-stone-900 sm:text-[10px]"
            : "text-[8px] font-semibold text-stone-500 sm:text-[9px]",
          isDominant && content.tone === "accent" ? "text-stone-900" : "",
        ].join(" ")}
      >
        {content.label}
      </p>
      {content.detail ? (
        <p className="mt-0.5 text-center text-[7px] font-semibold uppercase tracking-[0.08em] text-stone-600 sm:text-[8px] sm:tracking-[0.12em]">
          {content.detail}
        </p>
      ) : null}
    </div>
  );
}

function bubblePositionClasses(playerId: PlayerId): string {
  switch (playerId) {
    case 2:
      return "left-1/2 top-full mt-1 -translate-x-1/2 sm:left-full sm:top-1/2 sm:ml-2 sm:mt-0 sm:-translate-y-1/2 sm:translate-x-0";
    case 3:
      return "left-full top-1/2 ml-1 -translate-y-1/2 sm:left-full sm:ml-2";
    case 1:
      return "right-full top-1/2 mr-1 -translate-y-1/2 sm:right-full sm:mr-2";
    case 0:
      return "left-1/2 bottom-full mb-1 -translate-x-1/2 sm:left-full sm:bottom-auto sm:top-1/2 sm:mb-0 sm:ml-2 sm:-translate-y-1/2 sm:translate-x-0";
  }
}

function RoundHelpOverlay({ state, showLiveScore }: { state: GameTableState; showLiveScore: boolean }) {
  const { preferences } = usePlayerPreferences();
  const teamFor = (teamId: 0 | 1) => teamName(teamId, state.playerNames);
  const livePoints = getPublicRoundPoints(state);
  const progress = preferences.assistance.showContractProgress ? getContractProgress(state) : null;

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 max-w-36 rounded-lg border border-white/35 bg-black/40 px-2 py-1.5 text-right text-white shadow-sm backdrop-blur-sm sm:right-3 sm:top-3 sm:max-w-52 sm:px-3 sm:py-2">
      {showLiveScore ? <><p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/70 sm:text-[10px]">Points en direct</p><div className="mt-1 space-y-1">
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <div>
            <p className="max-w-16 truncate text-[9px] text-white/70 sm:max-w-none sm:text-[10px]">
              {teamFor(0)}
            </p>
            <p className="text-xs font-bold leading-none sm:text-sm">{livePoints[0]}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <div>
            <p className="max-w-16 truncate text-[9px] text-white/70 sm:max-w-none sm:text-[10px]">
              {teamFor(1)}
            </p>
            <p className="text-xs font-bold leading-none sm:text-sm">{livePoints[1]}</p>
          </div>
        </div>
      </div></> : null}
      {progress ? <div className={showLiveScore ? "mt-1 border-t border-white/20 pt-1" : ""}><p className="text-[8px] font-semibold uppercase tracking-wide text-white/70 sm:text-[9px]">Progression du contrat</p><p className="text-xs font-bold sm:text-sm">{progress.takerPoints} / {progress.target}</p></div> : null}
    </div>
  );
}

function GameHud({
  bottomPlayerId,
  state,
}: {
  state: GameTableState;
  bottomPlayerId: PlayerId;
}) {
  const contractText = state.contract
    ? `${formatContractLabel(state.contract)}${state.contract.status === "coinched" ? " · Coinché" : state.contract.status === "surcoinched" ? " · Surcoinché" : ""}`
    : "Annonces";
  const inactiveMessage = inactivePlayerMessage(state);
  const us = playerTeam(bottomPlayerId);
  const them = us === 0 ? 1 : 0;

  return (
    <div className="coinche-table-hud pointer-events-none absolute left-2 top-2 z-10 rounded-xl border border-white/10 bg-[#07150f]/70 px-2.5 py-2 text-white shadow-lg backdrop-blur-md sm:left-4 sm:top-4 sm:px-3">
      <div className="flex items-center gap-2 text-[10px] font-black sm:text-xs"><span>Nous {state.totalScore[us]}</span><span className="text-white/35">—</span><span>Eux {state.totalScore[them]}</span><span className="ml-1 max-w-28 truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-[#e8d8ad]/75 sm:max-w-40 sm:text-[9px]">{contractText}</span></div>
      {inactiveMessage ? <p className="text-[9px] text-white/70">{inactiveMessage}</p> : null}
    </div>
  );
}

export function GameTable({
  state,
  hand,
  biddingControls,
  immersiveMobileLandscape = false,
  players,
  minimalHud = false,
  presentationScope = "game",
  showLiveScore = false,
  trickPresentationPolicy,
}: GameTableProps) {
  const { effectiveReducedMotion, preferences } = usePlayerPreferences();
  const observationRef = useRef<TrickObservation | null>(null);
  const soundPreferencesRef = useRef(preferences);
  const soundObservationRef = useRef<{ bids: number; plays: number; round: number; scope: string } | null>(null);
  const pendingTricksRef = useRef<PresentedTrick[]>([]);
  const [animatedCompletedTrick, setAnimatedCompletedTrick] = useState<PresentedTrick | null>(
    null,
  );
  const [showLastTrick, setShowLastTrick] = useState(false);
  const seats = tableSeatsFor(state);
  const visualTrick = selectVisualTrick(state.currentTrick.cards, animatedCompletedTrick);
  const nameFor = (playerId: PlayerId) => playerName(playerId, state.playerNames);
  const inactiveMessage = inactivePlayerMessage(state);
  const connectionFor = (playerId: PlayerId) => {
    const player = players?.find((candidate) => candidate.seat_index === playerId);
    return player?.kind === "human" ? player.is_connected : undefined;
  };
  const takeoverFor = (playerId: PlayerId) =>
    players?.find((candidate) => candidate.seat_index === playerId)?.bot_takeover ?? false;
  const hostFor = (playerId: PlayerId) => players?.find((candidate) => candidate.seat_index === playerId)?.is_host ?? false;
  const cardsFor = (playerId: PlayerId) => "handCounts" in state ? state.handCounts[playerId] : state.hands[playerId].length;
  const latestBid = state.bids.at(-1) ?? null;
  const latestBidIdentity = latestBidKey(state.roundNumber, state.bids);
  const dominantPlayerId = useMemo(() => dominantBidPlayerId(state.bids), [state.bids]);
  const finalAnnouncement =
    state.phase === "bidding" || !state.contract ? null : formatFinalContract(state.contract);
  const biddingAnnouncements = useMemo(() => {
    const announcements: Partial<
      Record<PlayerId, { content: AnnouncementBubbleContent; bubbleKey: string }>
    > = {};

    state.bids.forEach((bid, index) => {
      announcements[bid.playerId] = {
        content: formatBidLabel(bid),
        bubbleKey: bidKey(state.roundNumber, index + 1, bid),
      };
    });

    return announcements;
  }, [state.bids, state.roundNumber]);

  function announcementFor(
    playerId: PlayerId,
  ): { content: AnnouncementBubbleContent; animate: boolean; bubbleKey: string; isDominant: boolean } | null {
    if (state.phase === "bidding") {
      const playerAnnouncement = biddingAnnouncements[playerId];

      if (!playerAnnouncement) {
        return null;
      }

      return {
        content: playerAnnouncement.content,
        animate: latestBid?.playerId === playerId && playerAnnouncement.bubbleKey === latestBidIdentity,
        bubbleKey: playerAnnouncement.bubbleKey,
        isDominant: dominantPlayerId === playerId,
      };
    }

    if (finalAnnouncement && state.contract?.playerId === playerId) {
      return {
        content: finalAnnouncement,
        animate: false,
        bubbleKey: `contract-${state.roundNumber}-${state.contract.playerId}-${state.contract.value}-${state.contract.trump}-${state.contract.status}`,
        isDominant: true,
      };
    }

    return null;
  }

  const topAnnouncement = announcementFor(seats.top);
  const leftAnnouncement = announcementFor(seats.left);
  const rightAnnouncement = announcementFor(seats.right);
  const bottomAnnouncement = announcementFor(seats.bottom);
  const effectiveTrickPresentationPolicy = trickPresentationPolicy ?? getTrickPresentationPolicy(preferences);
  useEffect(() => {
    soundPreferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    const next = {
      bids: state.bids.length,
      plays: state.completedTricks.reduce((total, trick) => total + trick.cards.length, 0) + state.currentTrick.cards.length,
      round: state.roundNumber,
      scope: presentationScope,
    };
    const previous = soundObservationRef.current;
    soundObservationRef.current = next;
    if (!previous || previous.round !== next.round || previous.scope !== next.scope) return;
    if (next.bids > previous.bids) playPreferenceSound("bid", soundPreferencesRef.current);
    if (next.plays > previous.plays) playPreferenceSound("card-play", soundPreferencesRef.current);
  }, [presentationScope, state.bids.length, state.completedTricks, state.currentTrick.cards.length, state.roundNumber]);

  useEffect(() => {
    const transition = observeCompletedTricks(observationRef.current, {
      completedTricks: state.completedTricks,
      roundNumber: state.roundNumber,
      scope: presentationScope,
    });
    observationRef.current = transition.observation;
    if (transition.reset) {
      pendingTricksRef.current = [];
      setAnimatedCompletedTrick(null);
      setShowLastTrick(false);
      return;
    }
    if (transition.additions.length === 0) return;

    setAnimatedCompletedTrick((current) => {
      if (current) {
        pendingTricksRef.current.push(...transition.additions);
        return current;
      }
      const [first, ...remaining] = transition.additions;
      pendingTricksRef.current.push(...remaining);
      return first;
    });
  }, [presentationScope, state.completedTricks, state.roundNumber]);

  useEffect(() => {
    if (!animatedCompletedTrick || !effectiveTrickPresentationPolicy.autoCollect) return;
    const timeoutId = window.setTimeout(() => {
      playPreferenceSound("trick-collect", preferences);
      setAnimatedCompletedTrick((current) => {
        if (current?.key !== animatedCompletedTrick.key) return current;
        return pendingTricksRef.current.shift() ?? null;
      });
    }, effectiveTrickPresentationPolicy.delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [animatedCompletedTrick, effectiveTrickPresentationPolicy.autoCollect, effectiveTrickPresentationPolicy.delayMs, preferences]);

  const dismissPresentedTrick = () => {
    playPreferenceSound("trick-collect", preferences);
    setAnimatedCompletedTrick((current) => current ? pendingTricksRef.current.shift() ?? null : current);
  };
  const lastTrick = state.completedTricks.at(-1) ?? null;
  const showRoundHelp = !minimalHud && !immersiveMobileLandscape && ((showLiveScore && preferences.assistance.showLivePoints)
    || (preferences.assistance.showContractProgress && state.contract !== null));

  return (
    <section
      className={[
        "coinche-game-table coinche-game-scene relative isolate min-h-0 w-full max-w-full flex-1 overflow-hidden rounded-[1.4rem] border border-white/10 bg-cover bg-center text-stone-900 shadow-2xl",
        immersiveMobileLandscape ? "rounded-none border-0 shadow-none" : "",
      ].join(" ")}
    >
      {animatedCompletedTrick ? (
        <TrickCollectionAnimation
          animate={effectiveTrickPresentationPolicy.autoCollect && isPreferenceAnimationEnabled(preferences, "trick", effectiveReducedMotion)}
          durationMs={effectiveTrickPresentationPolicy.delayMs}
          seats={seats}
          trick={animatedCompletedTrick.trick}
        />
      ) : (
        <TrickCenter cards={visualTrick.cards} seats={seats} />
      )}
      {showRoundHelp ? <RoundHelpOverlay showLiveScore={showLiveScore && preferences.assistance.showLivePoints} state={state} /> : null}
      {animatedCompletedTrick && !effectiveTrickPresentationPolicy.autoCollect ? <button className="absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-xl border-2 border-white bg-emerald-950 px-5 py-2.5 text-xs font-bold text-white shadow-xl" onClick={dismissPresentedTrick} type="button"><span className="block">Ramasser le pli</span><span className="block text-[10px] font-normal text-white/80">{nameFor(animatedCompletedTrick.trick.winnerId)} gagne · {animatedCompletedTrick.trick.points} pts</span></button> : null}
      {preferences.assistance.showLastTrick && lastTrick && !animatedCompletedTrick ? <button aria-expanded={showLastTrick} className="absolute bottom-2 left-2 z-20 rounded-md border border-white/40 bg-black/40 px-2 py-1 text-[10px] font-semibold text-white shadow" onClick={() => setShowLastTrick((visible) => !visible)} type="button">Dernier pli</button> : null}
      {showLastTrick && lastTrick && !animatedCompletedTrick ? <div aria-label="Cartes du dernier pli" className="absolute inset-2 z-30 flex flex-col items-center justify-center overflow-y-auto rounded-xl border border-white/60 bg-stone-950/95 p-3 text-white shadow-2xl"><p className="text-sm font-bold">Dernier pli</p><p className="mb-2 text-xs text-white/75">{nameFor(lastTrick.winnerId)} gagne · {lastTrick.points} points</p><ol className="flex max-w-full gap-1.5 overflow-x-auto px-1">{lastTrick.cards.map((played, index) => <li className="flex shrink-0 flex-col items-center gap-1" key={`${played.playerId}-${played.card.rank}-${played.card.suit}`}><span className="text-[9px] text-white/80">{index + 1}. {nameFor(played.playerId)}</span><CardView card={played.card} disabled muted={false} size="compact" /></li>)}</ol><button className="mt-2 rounded-lg border border-white px-3 py-1 text-xs font-semibold" onClick={() => setShowLastTrick(false)} type="button">Fermer</button></div> : null}
      <GameHud bottomPlayerId={seats.bottom} state={state} />
      {!immersiveMobileLandscape && inactiveMessage && !minimalHud ? (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-white/20 bg-black/25 px-2 py-1 text-[9px] font-medium text-white/80 shadow-sm backdrop-blur-sm sm:left-3 sm:top-3">
          {inactiveMessage}
        </div>
      ) : null}
      {state.phase === "bidding" && biddingControls ? <div className="coinche-scene-bidding absolute left-1/2 z-30 w-[min(700px,calc(100%-2rem))] -translate-x-1/2">{biddingControls}</div> : null}
      {hand ? <div className="coinche-scene-hand absolute inset-x-0 bottom-0 z-20 flex justify-center">{hand}</div> : null}

      <div className="absolute left-1/2 top-2 -translate-x-1/2 sm:top-3">
        {topAnnouncement ? (
          <AnnouncementBubble
            key={topAnnouncement.bubbleKey}
            animate={topAnnouncement.animate}
            className={`coinche-bubble-top ${bubblePositionClasses(2)}`}
            content={topAnnouncement.content}
            isDominant={topAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          cardsRemaining={cardsFor(seats.top)}
          hasStartingPlayer={state.startingPlayerId === seats.top}
          isBotTakeover={takeoverFor(seats.top)}
          isConnected={connectionFor(seats.top)}
          isCurrent={state.currentPlayerId === seats.top}
          isHost={hostFor(seats.top)}
          name={nameFor(seats.top)}
          playerId={seats.top}
        />
      </div>
      <div className="absolute left-1 top-1/2 -translate-y-1/2 sm:left-3">
        {leftAnnouncement ? (
          <AnnouncementBubble
            key={leftAnnouncement.bubbleKey}
            animate={leftAnnouncement.animate}
            className={`coinche-bubble-left ${bubblePositionClasses(3)}`}
            content={leftAnnouncement.content}
            isDominant={leftAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          cardsRemaining={cardsFor(seats.left)}
          hasStartingPlayer={state.startingPlayerId === seats.left}
          isBotTakeover={takeoverFor(seats.left)}
          isConnected={connectionFor(seats.left)}
          isCurrent={state.currentPlayerId === seats.left}
          isHost={hostFor(seats.left)}
          name={nameFor(seats.left)}
          playerId={seats.left}
        />
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 sm:right-3">
        {rightAnnouncement ? (
          <AnnouncementBubble
            key={rightAnnouncement.bubbleKey}
            animate={rightAnnouncement.animate}
            className={`coinche-bubble-right ${bubblePositionClasses(1)}`}
            content={rightAnnouncement.content}
            isDominant={rightAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          cardsRemaining={cardsFor(seats.right)}
          hasStartingPlayer={state.startingPlayerId === seats.right}
          isBotTakeover={takeoverFor(seats.right)}
          isConnected={connectionFor(seats.right)}
          isCurrent={state.currentPlayerId === seats.right}
          isHost={hostFor(seats.right)}
          name={nameFor(seats.right)}
          playerId={seats.right}
        />
      </div>
      <div className="coinche-bottom-seat absolute bottom-2 left-1/2 -translate-x-1/2 sm:bottom-3">
        {bottomAnnouncement ? (
          <AnnouncementBubble
            key={bottomAnnouncement.bubbleKey}
            animate={bottomAnnouncement.animate}
            className={`coinche-bubble-bottom ${bubblePositionClasses(0)}`}
            content={bottomAnnouncement.content}
            isDominant={bottomAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          cardsRemaining={cardsFor(seats.bottom)}
          hasStartingPlayer={state.startingPlayerId === seats.bottom}
          isBotTakeover={takeoverFor(seats.bottom)}
          isConnected={connectionFor(seats.bottom)}
          isCurrent={state.currentPlayerId === seats.bottom}
          isHost={hostFor(seats.bottom)}
          name={nameFor(seats.bottom)}
          playerId={seats.bottom}
        />
      </div>
    </section>
  );
}

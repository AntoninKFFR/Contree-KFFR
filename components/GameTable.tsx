"use client";

import React, { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CardView } from "@/components/CardView";
import { PlayerPanel } from "@/components/PlayerPanel";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { formatContractLabel, formatContractMode, resolveContractMode } from "@/engine/contractMode";
import { getContractProgress, getPublicRoundPoints } from "@/engine/contractProgress";
import { inactivePlayerId as inactivePlayerForState } from "@/engine/activePlayers";
import { playerName, teamName } from "@/engine/players";
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

export function inactivePlayerMessage(state: GameTableState): string | null {
  const inactive = "inactivePlayerId" in state ? state.inactivePlayerId : inactivePlayerForState(state);
  return inactive === null ? null : `${playerName(inactive, state.playerNames)} ne joue pas cette donne.`;
}

type GameTableProps = {
  state: GameTableState;
  bottomOverlay?: ReactNode;
  immersiveMobileLandscape?: boolean;
  players?: RoomPlayerView[];
  presentationScope?: string;
  showLiveScore?: boolean;
  turnSecondsRemaining?: number | null;
};

type AnnouncementBubbleContent = {
  label: string;
  detail?: string;
  tone: "neutral" | "accent";
};

const TABLE_BACKGROUND_IMAGE = "/TapisKFFR.png";

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

function playedCardsToShow(state: GameTableState): { title: string; cards: PlayedCard[] } {
  return { title: "Pli en cours", cards: state.currentTrick.cards };
}

function trickCollectionOffset(winnerId: PlayerId): { x: string; y: string } {
  switch (winnerId) {
    case 2:
      return { x: "0px", y: "-120px" };
    case 3:
      return { x: "-150px", y: "0px" };
    case 1:
      return { x: "150px", y: "0px" };
    case 0:
      return { x: "0px", y: "120px" };
  }
}

function playedCardForPlayer(cards: PlayedCard[], playerId: PlayerId): PlayedCard | undefined {
  return cards.find((played) => played.playerId === playerId);
}

function PlayedCardSlot({
  cards,
  playerId,
}: {
  cards: PlayedCard[];
  playerId: PlayerId;
}) {
  const played = playedCardForPlayer(cards, playerId);
  const { effectiveReducedMotion, preferences } = usePlayerPreferences();

  return (
    <div className="flex h-full w-full items-center justify-center">
      {played ? (
        <CardView
          card={played.card}
          className={isPreferenceAnimationEnabled(preferences, "card-play", effectiveReducedMotion) ? "coinche-card-enter" : ""}
          disabled
          muted={false}
          size="compact"
        />
      ) : (
        <div className="flex h-16 w-11 items-center justify-center rounded-md border border-dashed border-white/45 bg-white/20 text-[10px] font-semibold text-white/80 sm:h-20 sm:w-14 sm:text-xs">
          ...
        </div>
      )}
    </div>
  );
}

function TrickCell({
  cards,
  className,
  playerId,
}: {
  cards: PlayedCard[];
  className: string;
  playerId: PlayerId;
}) {
  return (
    <div className={`${className} flex h-full w-full items-center justify-center`}>
      <PlayedCardSlot cards={cards} playerId={playerId} />
    </div>
  );
}

function TrickCenter({ cards, title }: { cards: PlayedCard[]; title: string }) {
  return (
    <div className="absolute left-1/2 top-1/2 grid grid-cols-[44px_72px_44px] grid-rows-[62px_62px_62px] place-items-center gap-1.5 -translate-x-1/2 -translate-y-1/2 sm:grid-cols-[56px_88px_56px] sm:grid-rows-[80px_80px_80px] sm:gap-2">
      <TrickCell cards={cards} className="col-start-2 row-start-1" playerId={2} />
      <TrickCell cards={cards} className="col-start-1 row-start-2" playerId={3} />
      <h2 className="col-start-2 row-start-2 flex min-h-8 items-center justify-center rounded-md bg-white px-1.5 py-1 text-center text-[10px] font-semibold shadow-sm sm:px-2 sm:text-xs">
        {title}
      </h2>
      <TrickCell cards={cards} className="col-start-3 row-start-2" playerId={1} />
      <TrickCell cards={cards} className="col-start-2 row-start-3" playerId={0} />
    </div>
  );
}

function TrickCollectionAnimation({
  animate,
  durationMs,
  trick,
  winnerName,
}: {
  animate: boolean;
  durationMs: number;
  trick: CompletedTrick;
  winnerName: string;
}) {
  const offset = trickCollectionOffset(trick.winnerId);

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
      <TrickCenter cards={trick.cards} title={`${winnerName} remporte le pli`} />
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
        "pointer-events-none absolute z-10 flex w-[64px] min-h-[28px] flex-col items-center justify-center rounded-2xl border border-stone-300/70 px-1 py-1 shadow-md backdrop-blur-sm sm:w-[96px] sm:min-h-[36px] sm:px-2.5",
        content.tone === "accent"
          ? "bg-white/90 text-stone-900"
          : "bg-white/90 text-stone-500 opacity-60",
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
      {progress ? <div className={showLiveScore ? "mt-1 border-t border-white/20 pt-1" : ""}><p className="text-[8px] font-semibold uppercase tracking-wide text-white/70 sm:text-[9px]">Progression</p><p className="text-[9px] font-semibold sm:text-[10px]">{progress.label}</p></div> : null}
    </div>
  );
}

function TableStatusOverlay({
  state,
  turnSecondsRemaining,
}: {
  state: GameTableState;
  turnSecondsRemaining?: number | null;
}) {
  const currentPlayer = playerName(state.currentPlayerId, state.playerNames);
  const contractText = state.contract ? formatContractLabel(state.contract) : "Annonces";
  const inactiveMessage = inactivePlayerMessage(state);

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-white/20 bg-black/25 px-2.5 py-1.5 text-white shadow-sm backdrop-blur-sm">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/65">
        {contractText}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold text-white/90">
        {currentPlayer}{turnSecondsRemaining !== null && turnSecondsRemaining !== undefined
          ? ` · ${turnSecondsRemaining} s`
          : ""}
      </p>
      {inactiveMessage ? <p className="text-[9px] text-white/70">{inactiveMessage}</p> : null}
    </div>
  );
}

export function GameTable({
  state,
  bottomOverlay,
  immersiveMobileLandscape = false,
  players,
  presentationScope = "game",
  showLiveScore = false,
  turnSecondsRemaining,
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
  const center = playedCardsToShow(state);
  const visualTrick = selectVisualTrick(center.cards, animatedCompletedTrick);
  const nameFor = (playerId: PlayerId) => playerName(playerId, state.playerNames);
  const inactiveMessage = inactivePlayerMessage(state);
  const connectionFor = (playerId: PlayerId) => {
    const player = players?.find((candidate) => candidate.seat_index === playerId);
    return player?.kind === "human" ? player.is_connected : undefined;
  };
  const takeoverFor = (playerId: PlayerId) =>
    players?.find((candidate) => candidate.seat_index === playerId)?.bot_takeover ?? false;
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

  const topAnnouncement = announcementFor(2);
  const leftAnnouncement = announcementFor(3);
  const rightAnnouncement = announcementFor(1);
  const bottomAnnouncement = announcementFor(0);
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
    const policy = getTrickPresentationPolicy(preferences);
    if (!animatedCompletedTrick || !policy.autoCollect) return;
    const timeoutId = window.setTimeout(() => {
      playPreferenceSound("trick-collect", preferences);
      setAnimatedCompletedTrick((current) => {
        if (current?.key !== animatedCompletedTrick.key) return current;
        return pendingTricksRef.current.shift() ?? null;
      });
    }, policy.delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [animatedCompletedTrick, preferences]);

  const dismissPresentedTrick = () => {
    playPreferenceSound("trick-collect", preferences);
    setAnimatedCompletedTrick((current) => current ? pendingTricksRef.current.shift() ?? null : current);
  };
  const lastTrick = state.completedTricks.at(-1) ?? null;
  const showRoundHelp = (showLiveScore && preferences.assistance.showLivePoints)
    || (preferences.assistance.showContractProgress && state.contract !== null);

  return (
    <section
      className={[
        "relative w-full max-w-full overflow-hidden rounded-lg border border-emerald-900/20 bg-emerald-700 bg-cover bg-center text-stone-900 shadow-sm",
        immersiveMobileLandscape
          ? "min-h-0 flex-1 rounded-none border-x-0 border-y-0 shadow-none"
          : preferences.visual.compactLayout
            ? "min-h-[180px] flex-none sm:min-h-[230px] lg:flex-1 lg:min-h-[280px]"
            : "min-h-[190px] flex-none sm:min-h-[260px] lg:flex-1 lg:min-h-[320px]",
      ].join(" ")}
      style={{ backgroundImage: `url(${TABLE_BACKGROUND_IMAGE})` }}
    >
      {animatedCompletedTrick ? (
        <TrickCollectionAnimation
          animate={preferences.gameplay.autoCollectTricks && isPreferenceAnimationEnabled(preferences, "trick", effectiveReducedMotion)}
          durationMs={preferences.gameplay.trickDisplayMs}
          trick={animatedCompletedTrick.trick}
          winnerName={nameFor(animatedCompletedTrick.trick.winnerId)}
        />
      ) : (
        <TrickCenter cards={visualTrick.cards} title={center.title} />
      )}
      {showRoundHelp ? <RoundHelpOverlay showLiveScore={showLiveScore && preferences.assistance.showLivePoints} state={state} /> : null}
      {animatedCompletedTrick && !preferences.gameplay.autoCollectTricks ? <button className="absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-md border-2 border-white bg-stone-900 px-4 py-2 text-xs font-bold text-white shadow-lg" onClick={dismissPresentedTrick} type="button">Continuer</button> : null}
      {preferences.assistance.showLastTrick && lastTrick && !animatedCompletedTrick ? <button aria-expanded={showLastTrick} className="absolute bottom-2 left-2 z-20 rounded-md border border-white/40 bg-black/40 px-2 py-1 text-[10px] font-semibold text-white shadow" onClick={() => setShowLastTrick((visible) => !visible)} type="button">Dernier pli</button> : null}
      {showLastTrick && lastTrick && !animatedCompletedTrick ? <div aria-label="Cartes du dernier pli" className="absolute inset-2 z-30 flex flex-col items-center justify-center rounded-lg border border-white/50 bg-emerald-950/90 p-3 text-white"><p className="mb-2 text-xs font-bold">Dernier pli · {nameFor(lastTrick.winnerId)}</p><div className="flex gap-1">{lastTrick.cards.map((played) => <CardView card={played.card} disabled key={`${played.playerId}-${played.card.rank}-${played.card.suit}`} muted={false} size="compact" />)}</div><button className="mt-2 rounded border border-white px-3 py-1 text-xs font-semibold" onClick={() => setShowLastTrick(false)} type="button">Fermer</button></div> : null}
      {immersiveMobileLandscape ? (
        <TableStatusOverlay state={state} turnSecondsRemaining={turnSecondsRemaining} />
      ) : null}
      {!immersiveMobileLandscape && inactiveMessage ? (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-white/20 bg-black/25 px-2 py-1 text-[9px] font-medium text-white/80 shadow-sm backdrop-blur-sm sm:left-3 sm:top-3">
          {inactiveMessage}
        </div>
      ) : null}
      {immersiveMobileLandscape && bottomOverlay ? (
        <div className="absolute inset-x-2 bottom-2 z-30">{bottomOverlay}</div>
      ) : null}

      <div className="absolute left-1/2 top-2 -translate-x-1/2 sm:top-3">
        {topAnnouncement ? (
          <AnnouncementBubble
            key={topAnnouncement.bubbleKey}
            animate={topAnnouncement.animate}
            className={bubblePositionClasses(2)}
            content={topAnnouncement.content}
            isDominant={topAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 2}
          isBotTakeover={takeoverFor(2)}
          isConnected={connectionFor(2)}
          isCurrent={state.currentPlayerId === 2}
          name={nameFor(2)}
          playerId={2}
        />
      </div>
      <div className="absolute left-1 top-1/2 -translate-y-1/2 sm:left-3">
        {leftAnnouncement ? (
          <AnnouncementBubble
            key={leftAnnouncement.bubbleKey}
            animate={leftAnnouncement.animate}
            className={bubblePositionClasses(3)}
            content={leftAnnouncement.content}
            isDominant={leftAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 3}
          isBotTakeover={takeoverFor(3)}
          isConnected={connectionFor(3)}
          isCurrent={state.currentPlayerId === 3}
          name={nameFor(3)}
          playerId={3}
        />
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 sm:right-3">
        {rightAnnouncement ? (
          <AnnouncementBubble
            key={rightAnnouncement.bubbleKey}
            animate={rightAnnouncement.animate}
            className={bubblePositionClasses(1)}
            content={rightAnnouncement.content}
            isDominant={rightAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 1}
          isBotTakeover={takeoverFor(1)}
          isConnected={connectionFor(1)}
          isCurrent={state.currentPlayerId === 1}
          name={nameFor(1)}
          playerId={1}
        />
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 sm:bottom-3">
        {bottomAnnouncement ? (
          <AnnouncementBubble
            key={bottomAnnouncement.bubbleKey}
            animate={bottomAnnouncement.animate}
            className={bubblePositionClasses(0)}
            content={bottomAnnouncement.content}
            isDominant={bottomAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 0}
          isBotTakeover={takeoverFor(0)}
          isConnected={connectionFor(0)}
          isCurrent={state.currentPlayerId === 0}
          name={nameFor(0)}
          playerId={0}
        />
      </div>
    </section>
  );
}

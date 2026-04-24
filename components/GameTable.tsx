"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CardView } from "@/components/CardView";
import { PlayerPanel } from "@/components/PlayerPanel";
import { SUIT_SYMBOLS, cardId } from "@/engine/cards";
import { playerName } from "@/engine/players";
import type {
  Bid,
  CompletedTrick,
  Contract,
  GameState,
  PlayedCard,
  PlayerId,
} from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";

type GameTableState = GameState | PlayerGameView;

type GameTableProps = {
  state: GameTableState;
};

type AnnouncementBubbleContent = {
  label: string;
  detail?: string;
  tone: "neutral" | "accent";
};

type AnimatedCompletedTrick = {
  key: string;
  trick: CompletedTrick;
};

const TABLE_BACKGROUND_IMAGE = "/TapisKFFR.png";
const TRICK_COLLECTION_ANIMATION_MS = 420;

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

  return {
    label: `${bid.value} ${SUIT_SYMBOLS[bid.trump]}`,
    tone: "accent",
  };
}

function formatFinalContract(contract: Contract): AnnouncementBubbleContent {
  if (contract.status === "surcoinched") {
    return {
      label: `${contract.value} ${SUIT_SYMBOLS[contract.trump]}`,
      detail: "Surcoinchee",
      tone: "accent",
    };
  }

  if (contract.status === "coinched") {
    return {
      label: `${contract.value} ${SUIT_SYMBOLS[contract.trump]}`,
      detail: "Coinchee",
      tone: "accent",
    };
  }

  return {
    label: `${contract.value} ${SUIT_SYMBOLS[contract.trump]}`,
    tone: "accent",
  };
}

function latestBidKey(roundNumber: number, bids: Bid[]): string | null {
  const latestBid = bids.at(-1);

  if (!latestBid) return null;

  if (latestBid.action === "bid") {
    return `${roundNumber}-${bids.length}-${latestBid.playerId}-${latestBid.action}-${latestBid.value}-${latestBid.trump}`;
  }

  return `${roundNumber}-${bids.length}-${latestBid.playerId}-${latestBid.action}`;
}

function bidKey(roundNumber: number, bidsLength: number, bid: Bid): string {
  if (bid.action === "bid") {
    return `${roundNumber}-${bidsLength}-${bid.playerId}-${bid.action}-${bid.value}-${bid.trump}`;
  }

  return `${roundNumber}-${bidsLength}-${bid.playerId}-${bid.action}`;
}

function dominantBidPlayerId(bids: Bid[]): PlayerId | null {
  for (let index = bids.length - 1; index >= 0; index -= 1) {
    const bid = bids[index];
    if (bid.action === "bid") {
      return bid.playerId;
    }
  }

  return null;
}

function playedCardsToShow(state: GameTableState): { title: string; cards: PlayedCard[] } {
  if (state.currentTrick.cards.length > 0) {
    return { title: "Pli en cours", cards: state.currentTrick.cards };
  }

  const lastTrick = state.completedTricks.at(-1);
  if (lastTrick) {
    return { title: "Dernier pli", cards: lastTrick.cards };
  }

  return { title: "Pli en cours", cards: [] };
}

function completedTrickKey(
  roundNumber: number,
  trickIndex: number,
  trick: CompletedTrick,
): string {
  return `${roundNumber}-${trickIndex}-${trick.winnerId}-${trick.cards
    .map((played) => `${played.playerId}-${cardId(played.card)}`)
    .join("_")}`;
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

  return (
    <div className="flex h-full w-full items-center justify-center">
      {played ? (
        <CardView
          card={played.card}
          className="coinche-card-enter"
          disabled
          muted={false}
          size="compact"
        />
      ) : (
        <div className="flex h-20 w-14 items-center justify-center rounded-md border border-dashed border-white/45 bg-white/20 text-xs font-semibold text-white/80">
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
    <div className="absolute left-1/2 top-1/2 grid grid-cols-[56px_88px_56px] grid-rows-[80px_80px_80px] place-items-center gap-2 -translate-x-1/2 -translate-y-1/2">
      <TrickCell cards={cards} className="col-start-2 row-start-1" playerId={2} />
      <TrickCell cards={cards} className="col-start-1 row-start-2" playerId={3} />
      <h2 className="col-start-2 row-start-2 flex items-center justify-center rounded-md bg-white px-2 py-1 text-center text-xs font-semibold shadow-sm">
        {title}
      </h2>
      <TrickCell cards={cards} className="col-start-3 row-start-2" playerId={1} />
      <TrickCell cards={cards} className="col-start-2 row-start-3" playerId={0} />
    </div>
  );
}

function TrickCollectionAnimation({ trick }: { trick: CompletedTrick }) {
  const offset = trickCollectionOffset(trick.winnerId);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 coinche-trick-collect"
      style={
        {
          "--coinche-trick-collect-x": offset.x,
          "--coinche-trick-collect-y": offset.y,
        } as React.CSSProperties
      }
    >
      <TrickCenter cards={trick.cards} title="Pli gagne" />
    </div>
  );
}

function AnnouncementBubble({
  content,
  animate,
  align,
  isDominant,
}: {
  content: AnnouncementBubbleContent;
  animate: boolean;
  align: "left" | "right";
  isDominant: boolean;
}) {
  return (
    <div
      className={[
        "pointer-events-none absolute z-10 flex w-[96px] min-h-[36px] flex-col items-center justify-center rounded-[18px] border border-stone-300/70 px-2.5 py-1 shadow-md backdrop-blur-sm",
        content.tone === "accent"
          ? "bg-white/90 text-stone-900"
          : "bg-white/90 text-stone-500 opacity-60",
        isDominant && content.tone === "accent"
          ? "ring-1 ring-emerald-600/50"
          : "",
        align === "right" ? "left-full ml-2" : "right-full mr-2",
        "top-1/2 -translate-y-1/2",
        animate ? "coinche-bid-bubble-enter" : "",
      ].join(" ")}
    >
      <p
        className={[
          "text-center leading-none tracking-[0.01em]",
          content.tone === "accent" ? "text-[10px] font-bold text-stone-900" : "text-[9px] font-semibold text-stone-500",
          isDominant && content.tone === "accent" ? "text-stone-900" : "",
        ].join(" ")}
      >
        {content.label}
      </p>
      {content.detail ? (
        <p className="mt-0.5 text-center text-[8px] font-semibold uppercase tracking-[0.12em] text-stone-600">
          {content.detail}
        </p>
      ) : null}
    </div>
  );
}

export function GameTable({ state }: GameTableProps) {
  const previousCompletedTrickKeyRef = useRef<string | null>(null);
  const [animatedCompletedTrick, setAnimatedCompletedTrick] = useState<AnimatedCompletedTrick | null>(
    null,
  );
  const [hiddenCompletedTrickKey, setHiddenCompletedTrickKey] = useState<string | null>(null);
  const latestCompletedTrick = state.completedTricks.at(-1) ?? null;
  const latestCompletedTrickKey = latestCompletedTrick
    ? completedTrickKey(state.roundNumber, state.completedTricks.length, latestCompletedTrick)
    : null;
  const center = playedCardsToShow(state);
  const nameFor = (playerId: PlayerId) => playerName(playerId, state.playerNames);
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
  const displayedCenter =
    hiddenCompletedTrickKey &&
    latestCompletedTrick &&
    latestCompletedTrickKey === hiddenCompletedTrickKey &&
    center.cards === latestCompletedTrick.cards
      ? { title: "Pli en cours", cards: [] as PlayedCard[] }
      : center;

  useEffect(() => {
    if (!latestCompletedTrick || !latestCompletedTrickKey) {
      previousCompletedTrickKeyRef.current = latestCompletedTrickKey;
      return;
    }

    if (previousCompletedTrickKeyRef.current === null) {
      previousCompletedTrickKeyRef.current = latestCompletedTrickKey;
      return;
    }

    if (previousCompletedTrickKeyRef.current === latestCompletedTrickKey) {
      return;
    }

    previousCompletedTrickKeyRef.current = latestCompletedTrickKey;
    setHiddenCompletedTrickKey(latestCompletedTrickKey);
    setAnimatedCompletedTrick({
      key: latestCompletedTrickKey,
      trick: latestCompletedTrick,
    });

    const timeoutId = window.setTimeout(() => {
      setAnimatedCompletedTrick((current) =>
        current?.key === latestCompletedTrickKey ? null : current,
      );
    }, TRICK_COLLECTION_ANIMATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [latestCompletedTrick, latestCompletedTrickKey]);

  return (
    <section
      className="relative min-h-[320px] flex-1 overflow-hidden rounded-lg border border-emerald-900/20 bg-emerald-700 bg-cover bg-center text-stone-900 shadow-sm"
      style={{ backgroundImage: `url(${TABLE_BACKGROUND_IMAGE})` }}
    >
      <TrickCenter cards={displayedCenter.cards} title={displayedCenter.title} />
      {animatedCompletedTrick ? <TrickCollectionAnimation trick={animatedCompletedTrick.trick} /> : null}

      <div className="absolute left-1/2 top-3 -translate-x-1/2">
        {topAnnouncement ? (
          <AnnouncementBubble
            key={topAnnouncement.bubbleKey}
            align="right"
            animate={topAnnouncement.animate}
            content={topAnnouncement.content}
            isDominant={topAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 2}
          isCurrent={state.currentPlayerId === 2}
          name={nameFor(2)}
          playerId={2}
        />
      </div>
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        {leftAnnouncement ? (
          <AnnouncementBubble
            key={leftAnnouncement.bubbleKey}
            align="right"
            animate={leftAnnouncement.animate}
            content={leftAnnouncement.content}
            isDominant={leftAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 3}
          isCurrent={state.currentPlayerId === 3}
          name={nameFor(3)}
          playerId={3}
        />
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        {rightAnnouncement ? (
          <AnnouncementBubble
            key={rightAnnouncement.bubbleKey}
            align="left"
            animate={rightAnnouncement.animate}
            content={rightAnnouncement.content}
            isDominant={rightAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 1}
          isCurrent={state.currentPlayerId === 1}
          name={nameFor(1)}
          playerId={1}
        />
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        {bottomAnnouncement ? (
          <AnnouncementBubble
            key={bottomAnnouncement.bubbleKey}
            align="right"
            animate={bottomAnnouncement.animate}
            content={bottomAnnouncement.content}
            isDominant={bottomAnnouncement.isDominant}
          />
        ) : null}
        <PlayerPanel
          hasStartingPlayer={state.startingPlayerId === 0}
          isCurrent={state.currentPlayerId === 0}
          name={nameFor(0)}
          playerId={0}
        />
      </div>
    </section>
  );
}

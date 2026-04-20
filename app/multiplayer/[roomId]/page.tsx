"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthStatus } from "@/components/AuthStatus";
import { BiddingPanel } from "@/components/BiddingPanel";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { ScoreBoard } from "@/components/ScoreBoard";
import { applyGameAction } from "@/engine/actions";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { getCurrentContract, playableCardsForCurrentPlayer } from "@/engine/game";
import { teamName } from "@/engine/players";
import type { BidValue, Card, GameState, PlayerId, Suit } from "@/engine/types";
import { toPlayerGameView, type PlayerGameView } from "@/engine/views";
import {
  getRoomWithPlayers,
  playRoomAction,
  resetRoom,
  setSeatReady,
  startRoomGame,
  type RoomPlayerAction,
  type RoomPlayerRow,
  type RoomWithPlayers,
} from "@/lib/rooms";
import { getSupabaseClient } from "@/lib/supabaseClient";

type PageState = "loading" | "ready" | "signed-out" | "unavailable" | "missing";

type LoadRoomOptions = {
  silent?: boolean;
};

type DisplayActionEvent = {
  action: RoomPlayerAction;
  playerId: PlayerId;
};

const BOT_ACTION_VISUAL_DELAY_MIN_MS = 400;
const BOT_ACTION_VISUAL_DELAY_RANGE_MS = 200;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action impossible pour le moment.";
}

function roomIdFromParams(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function stateForViewerLegalCards(view: PlayerGameView): GameState {
  return {
    ...view,
    hands: {
      0: [],
      1: [],
      2: [],
      3: [],
      [view.viewerPlayerId]: view.hand,
    },
  } as GameState;
}

function actionEventsFor(state: GameState): DisplayActionEvent[] {
  return [
    ...state.bids.map((bid) => ({
      action:
        bid.action === "bid"
          ? {
              type: "bid" as const,
              value: bid.value,
              trump: bid.trump,
            }
          : {
              type: bid.action,
            },
      playerId: bid.playerId,
    })),
    ...state.completedTricks.flatMap((trick) =>
      trick.cards.map((played) => ({
        action: {
          type: "play-card" as const,
          card: played.card,
        },
        playerId: played.playerId,
      })),
    ),
    ...state.currentTrick.cards.map((played) => ({
      action: {
        type: "play-card" as const,
        card: played.card,
      },
      playerId: played.playerId,
    })),
  ];
}

function newActionEventsFor(
  previousState: GameState,
  nextState: GameState,
): DisplayActionEvent[] {
  if (previousState.roundNumber !== nextState.roundNumber) {
    return [];
  }

  const previousEvents = actionEventsFor(previousState);
  const nextEvents = actionEventsFor(nextState);

  if (nextEvents.length <= previousEvents.length) {
    return [];
  }

  return nextEvents.slice(previousEvents.length);
}

function waitForBotVisualDelay(): Promise<void> {
  const delay = BOT_ACTION_VISUAL_DELAY_MIN_MS + Math.random() * BOT_ACTION_VISUAL_DELAY_RANGE_MS;

  return new Promise((resolve) => {
    window.setTimeout(resolve, delay);
  });
}

function applyDisplayActionEvent(state: GameState, event: DisplayActionEvent): GameState {
  switch (event.action.type) {
    case "bid":
      return applyGameAction(state, {
        type: "bid",
        playerId: event.playerId,
        value: event.action.value,
        trump: event.action.trump,
      });
    case "pass":
      return applyGameAction(state, {
        type: "pass",
        playerId: event.playerId,
      });
    case "coinche":
      return applyGameAction(state, {
        type: "coinche",
        playerId: event.playerId,
      });
    case "surcoinche":
      return applyGameAction(state, {
        type: "surcoinche",
        playerId: event.playerId,
      });
    case "play-card":
      return applyGameAction(state, {
        type: "play-card",
        playerId: event.playerId,
        card: event.action.card,
      });
  }
}

export default function MultiplayerRoomPage() {
  const params = useParams();
  const roomId = roomIdFromParams(params.roomId);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingCard, setIsPlayingCard] = useState(false);
  const [isResettingRoom, setIsResettingRoom] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isUpdatingReady, setIsUpdatingReady] = useState(false);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [displayGameState, setDisplayGameState] = useState<GameState | null>(null);
  const [roomWithPlayers, setRoomWithPlayers] = useState<RoomWithPlayers | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const animationRunIdRef = useRef(0);
  const displayGameStateRef = useRef<GameState | null>(null);
  const isAnimatingRef = useRef(false);

  function updateDisplayGameState(nextState: GameState | null) {
    displayGameStateRef.current = nextState;
    setDisplayGameState(nextState);
  }

  const currentSeat = useMemo(() => {
    if (!session || !roomWithPlayers) return null;
    return roomWithPlayers.players.find((player) => player.user_id === session.user.id) ?? null;
  }, [roomWithPlayers, session]);

  const isHost = Boolean(
    session &&
      roomWithPlayers?.room.host_user_id &&
      roomWithPlayers.room.host_user_id === session.user.id,
  );
  const canStartGame = Boolean(
    roomWithPlayers &&
      roomWithPlayers.room.status === "lobby" &&
      roomWithPlayers.players.every((player) => player.kind !== "human" || player.is_ready),
  );
  const serverGameState =
    roomWithPlayers?.room.server_state &&
    (roomWithPlayers.room.status === "playing" || roomWithPlayers.room.status === "finished")
      ? (roomWithPlayers.room.server_state as GameState)
      : null;
  const gameState = displayGameState ?? serverGameState;
  const displayedRoomStatus =
    roomWithPlayers?.room.status === "finished" && gameState?.phase !== "game-over"
      ? "playing"
      : roomWithPlayers?.room.status;
  const playerView =
    gameState && currentSeat && displayedRoomStatus === "playing"
      ? toPlayerGameView(gameState, currentSeat.seat_index)
      : null;
  const finalWinner =
    displayedRoomStatus === "finished" &&
    gameState?.winnerTeam !== null &&
    gameState?.winnerTeam !== undefined
      ? teamName(gameState.winnerTeam, gameState.playerNames)
      : null;
  const canPlayCard = Boolean(
    gameState &&
      currentSeat &&
      roomWithPlayers?.room.status === "playing" &&
      displayedRoomStatus === "playing" &&
      gameState.phase === "playing" &&
      gameState.currentPlayerId === currentSeat.seat_index,
  );
  const canBid = Boolean(
    playerView &&
      currentSeat &&
      roomWithPlayers?.room.status === "playing" &&
      displayedRoomStatus === "playing" &&
      playerView.phase === "bidding" &&
      playerView.currentPlayerId === currentSeat.seat_index,
  );
  const currentContract = playerView
    ? getCurrentContract(stateForViewerLegalCards(playerView))
    : null;
  const canBidCoinche = Boolean(
    currentSeat && canBid && canCoinche(currentSeat.seat_index, currentContract),
  );
  const canBidSurcoinche = Boolean(
    currentSeat && canBid && canSurcoinche(currentSeat.seat_index, currentContract),
  );
  const legalCards =
    canPlayCard && playerView
      ? playableCardsForCurrentPlayer(stateForViewerLegalCards(playerView))
      : [];

  const loadRoom = useCallback(async (options: LoadRoomOptions = {}) => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setPageState("unavailable");
      return;
    }

    if (!roomId) {
      setPageState("missing");
      return;
    }

    if (!options.silent) {
      setPageState("loading");
      setError(null);
    }

    const { data } = await supabase.auth.getSession();
    const nextSession = data.session;
    setSession(nextSession);

    if (!nextSession) {
      setPageState("signed-out");
      return;
    }

    try {
      const nextRoom = await getRoomWithPlayers(supabase, roomId);
      setRoomWithPlayers(nextRoom);
      setError(null);
      setPageState("ready");
    } catch (loadError) {
      setRoomWithPlayers(null);
      setError(errorMessage(loadError));
      setPageState("missing");
    }
  }, [roomId]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    loadRoom();

    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadRoom();
    });

    return () => subscription.unsubscribe();
  }, [loadRoom]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase || !roomId) return;

    const channel = supabase
      .channel(`room-lobby:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `room_id=eq.${roomId}`,
          schema: "public",
          table: "room_players",
        },
        () => {
          void loadRoom({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `id=eq.${roomId}`,
          schema: "public",
          table: "rooms",
        },
        () => {
          void loadRoom({ silent: true });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRoom, roomId]);

  useEffect(() => {
    if (!serverGameState || !roomWithPlayers) {
      animationRunIdRef.current += 1;
      isAnimatingRef.current = false;
      updateDisplayGameState(serverGameState);
      return;
    }

    const animationRunId = animationRunIdRef.current + 1;
    animationRunIdRef.current = animationRunId;
    const currentDisplayState = displayGameStateRef.current;

    if (!currentDisplayState) {
      isAnimatingRef.current = false;
      updateDisplayGameState(serverGameState);
      return;
    }

    const initialDisplayState: GameState = currentDisplayState;
    const newEvents = newActionEventsFor(currentDisplayState, serverGameState);
    const botSeatIndexes = new Set(
      roomWithPlayers.players
        .filter((player) => player.kind === "bot")
        .map((player) => player.seat_index),
    );
    const hasBotAction = newEvents.some((event) => botSeatIndexes.has(event.playerId));

    if (newEvents.length === 0 || !hasBotAction) {
      isAnimatingRef.current = false;
      updateDisplayGameState(serverGameState);
      return;
    }

    isAnimatingRef.current = true;
    let isCancelled = false;

    async function animateActions() {
      let nextDisplayState = initialDisplayState;

      for (const event of newEvents) {
        if (isCancelled || animationRunIdRef.current !== animationRunId) {
          return;
        }

        if (botSeatIndexes.has(event.playerId)) {
          await waitForBotVisualDelay();
        }

        if (isCancelled || animationRunIdRef.current !== animationRunId) {
          return;
        }

        nextDisplayState = applyDisplayActionEvent(nextDisplayState, event);
        updateDisplayGameState(nextDisplayState);
      }

      if (!isCancelled && animationRunIdRef.current === animationRunId) {
        isAnimatingRef.current = false;
        updateDisplayGameState(serverGameState);
      }
    }

    void animateActions();

    return () => {
      isCancelled = true;
      isAnimatingRef.current = false;
    };
  }, [roomWithPlayers, serverGameState]);

  async function handleToggleReady() {
    const supabase = getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || !currentSeat) return;

    setIsUpdatingReady(true);
    setError(null);

    try {
      const nextRoom = await setSeatReady(supabase, {
        ready: !currentSeat.is_ready,
        roomId: roomWithPlayers.room.id,
        userId: session.user.id,
      });
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (readyError) {
      setError(errorMessage(readyError));
    } finally {
      setIsUpdatingReady(false);
    }
  }

  async function handleStartGame() {
    const supabase = getSupabaseClient();

    if (!supabase || !roomWithPlayers || !isHost || !canStartGame) return;

    setIsStartingGame(true);
    setError(null);

    try {
      const nextRoom = await startRoomGame(supabase, {
        roomId: roomWithPlayers.room.id,
      });
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setIsStartingGame(false);
    }
  }

  async function handleRoomPlayerAction(action: RoomPlayerAction) {
    const supabase = getSupabaseClient();
    const isCardAction = action.type === "play-card";

    if (
      !supabase ||
      !roomWithPlayers ||
      !session ||
      (isCardAction ? !canPlayCard : !canBid)
    ) {
      return;
    }

    setIsPlayingCard(true);
    setError(null);

    try {
      const nextRoom = await playRoomAction(supabase, {
        action,
        roomId: roomWithPlayers.room.id,
        userId: session.user.id,
      });
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (playError) {
      setError(errorMessage(playError));
    } finally {
      setIsPlayingCard(false);
    }
  }

  function handlePlayCard(card: Card) {
    void handleRoomPlayerAction({ type: "play-card", card });
  }

  function handleBid(value: BidValue, trump: Suit) {
    void handleRoomPlayerAction({ type: "bid", value, trump });
  }

  function handlePass() {
    void handleRoomPlayerAction({ type: "pass" });
  }

  function handleCoinche() {
    void handleRoomPlayerAction({ type: "coinche" });
  }

  function handleSurcoinche() {
    void handleRoomPlayerAction({ type: "surcoinche" });
  }

  async function handleResetRoom() {
    const supabase = getSupabaseClient();

    if (!supabase || !roomWithPlayers || isResettingRoom) return;

    setIsResettingRoom(true);
    setError(null);

    try {
      const nextRoom = await resetRoom(supabase, {
        roomId: roomWithPlayers.room.id,
      });
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setIsResettingRoom(false);
    }
  }

  const isPlayingLayout = displayedRoomStatus === "playing";

  return (
    <main
      className={
        isPlayingLayout
          ? "h-dvh overflow-hidden bg-[#f4f1e8] px-3 py-2 text-stone-950 sm:px-4"
          : "min-h-dvh bg-[#f4f1e8] px-4 py-6 text-stone-950"
      }
    >
      <div
        className={
          isPlayingLayout
            ? "flex h-full w-full flex-col gap-2"
            : "mx-auto flex max-w-5xl flex-col gap-4"
        }
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <Link
              className="text-sm font-semibold text-emerald-900 hover:underline"
              href="/multiplayer"
            >
              Retour au lobby
            </Link>
            <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/">
              Retour au jeu
            </Link>
          </div>
          <AuthStatus />
        </header>

        {pageState === "unavailable" ? (
          <StatusMessage>Supabase est indisponible. Vérifie .env.local.</StatusMessage>
        ) : null}

        {pageState === "signed-out" ? (
          <StatusMessage>
            Connecte-toi pour voir cette room.
            <Link
              className="mt-4 inline-flex rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
              href="/login"
            >
              Se connecter
            </Link>
          </StatusMessage>
        ) : null}

        {pageState === "loading" ? <StatusMessage>Chargement de la room...</StatusMessage> : null}

        {pageState === "missing" ? (
          <StatusMessage>{error ?? "Room introuvable."}</StatusMessage>
        ) : null}

        {error && pageState === "ready" ? (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        ) : null}

        {pageState === "ready" && roomWithPlayers ? (
          <>
            {displayedRoomStatus === "finished" && gameState ? (
              <section className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                  Partie terminée
                </p>
                <h2 className="mt-1 text-2xl font-bold">
                  {finalWinner ? `${finalWinner} gagnent` : "Fin de partie"}
                </h2>
                <div className="mt-3 grid gap-2 text-sm text-stone-800 sm:grid-cols-2">
                  <p className="rounded-md bg-white px-3 py-2 font-semibold">
                    Score équipe 0: {gameState.totalScore[0]}
                  </p>
                  <p className="rounded-md bg-white px-3 py-2 font-semibold">
                    Score équipe 1: {gameState.totalScore[1]}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isResettingRoom}
                    onClick={handleResetRoom}
                    type="button"
                  >
                    Rejouer
                  </button>
                  <button
                    className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                    onClick={() => loadRoom()}
                    type="button"
                  >
                    Retour au lobby
                  </button>
                </div>
              </section>
            ) : null}

            {displayedRoomStatus === "lobby" ? (
              <>
                <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                        Room multijoueur
                      </p>
                      <h1 className="mt-1 font-mono text-3xl font-bold">
                        {roomWithPlayers.room.code}
                      </h1>
                      <p className="mt-2 text-sm text-stone-600">
                        Statut: {roomWithPlayers.room.status} | Mode:{" "}
                        {roomWithPlayers.room.scoring_mode} | Cible:{" "}
                        {roomWithPlayers.room.target_score}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                        onClick={() => loadRoom()}
                        type="button"
                      >
                        Rafraîchir
                      </button>
                      <button
                        className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!currentSeat || isUpdatingReady}
                        onClick={handleToggleReady}
                        type="button"
                      >
                        {currentSeat?.is_ready ? "Not ready" : "Ready"}
                      </button>
                      {isHost ? (
                        <button
                          className="rounded-md bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canStartGame || isStartingGame}
                          onClick={handleStartGame}
                          type="button"
                        >
                          Start Game
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {!currentSeat ? (
                    <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Tu regardes cette room, mais ton utilisateur n&apos;occupe pas de siège.
                    </p>
                  ) : null}
                </section>

                <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold">Sièges</h2>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {roomWithPlayers.players.map((player) => (
                      <SeatCard
                        isCurrentUser={player.user_id === session?.user.id}
                        key={player.id}
                        player={player}
                      />
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {displayedRoomStatus === "playing" && playerView ? (
              <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_310px]">
                <div className="flex min-h-0 flex-col gap-2">
                  <GameTable state={playerView} />

                  {playerView.phase === "bidding" ? (
                    <BiddingPanel
                      canBid={canBid && !isPlayingCard}
                      canCoinche={canBidCoinche && !isPlayingCard}
                      canSurcoinche={canBidSurcoinche && !isPlayingCard}
                      currentContract={currentContract}
                      onBid={handleBid}
                      onCoinche={handleCoinche}
                      onPass={handlePass}
                      onSurcoinche={handleSurcoinche}
                    />
                  ) : null}

                  <HumanHand
                    canPlay={canPlayCard && !isPlayingCard}
                    cards={playerView.hand}
                    legalCards={legalCards}
                    onPlayCard={handlePlayCard}
                  />
                </div>

                <ScoreBoard state={playerView} showActions={false} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function SeatCard({
  isCurrentUser,
  player,
}: {
  isCurrentUser: boolean;
  player: RoomPlayerRow;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold">Seat {player.seat_index}</p>
        {isCurrentUser ? (
          <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-900">
            Toi
          </span>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-stone-700">
        <dt className="font-semibold">Kind</dt>
        <dd>{player.kind}</dd>
        <dt className="font-semibold">Nom</dt>
        <dd>{player.display_name ?? "-"}</dd>
        <dt className="font-semibold">Ready</dt>
        <dd>{player.is_ready ? "oui" : "non"}</dd>
        <dt className="font-semibold">Connected</dt>
        <dd>{player.is_connected ? "oui" : "non"}</dd>
      </dl>
    </div>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-5 text-sm text-stone-700 shadow-sm">
      {children}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BiddingPanel } from "@/components/BiddingPanel";
import { GameTable } from "@/components/GameTable";
import { HumanHand } from "@/components/HumanHand";
import { MobileLandscapeNotice } from "@/components/MobileLandscapeNotice";
import { ScoreBoard } from "@/components/ScoreBoard";
import { canCoinche, canSurcoinche } from "@/engine/bidding";
import { teamName } from "@/engine/players";
import { getLegalCards } from "@/engine/rules";
import type { BidValue, Card, Suit } from "@/engine/types";
import type { PlayerGameView } from "@/engine/views";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/multiplayerPresence";
import { getProfileUsername } from "@/lib/profiles";
import { fetchRoomView, sendPresenceHeartbeat, sendRoomIntent } from "@/lib/multiplayerApi";
import type { RoomPlayerAction, RoomPlayerRow, RoomPlayerView, MultiplayerRoomView } from "@/lib/roomTypes";
import { getSupabaseClient } from "@/lib/supabaseClient";

type PageState = "loading" | "ready" | "signed-out" | "unavailable" | "missing";

type LoadRoomOptions = {
  silent?: boolean;
};

const TABLE_BACKGROUND_IMAGE = "/TapisKFFR.png";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action impossible pour le moment.";
}

function roomIdFromParams(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function statusLabel(status: MultiplayerRoomView["room"]["status"]): string {
  if (status === "lobby") return "en attente";
  if (status === "playing") return "en cours";
  if (status === "finished") return "terminée";
  return "annulée";
}

function scoringModeLabel(scoringMode: MultiplayerRoomView["room"]["scoring_mode"]): string {
  return scoringMode === "made-points" ? "points faits" : "points annoncés";
}

export default function MultiplayerRoomPage() {
  const params = useParams();
  const roomId = roomIdFromParams(params.roomId);
  const [error, setError] = useState<string | null>(null);
  const [isJoiningSeat, setIsJoiningSeat] = useState(false);
  const [isLeavingSeat, setIsLeavingSeat] = useState(false);
  const [isPlayingCard, setIsPlayingCard] = useState(false);
  const [takeoverSeatInFlight, setTakeoverSeatInFlight] = useState<RoomPlayerRow["seat_index"] | null>(null);
  const [isStartingNextRound, setIsStartingNextRound] = useState(false);
  const [isResettingRoom, setIsResettingRoom] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isUpdatingReady, setIsUpdatingReady] = useState(false);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [localDisplayName, setLocalDisplayName] = useState("Joueur");
  const [roomWithPlayers, setRoomWithPlayers] = useState<MultiplayerRoomView | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const previousPhaseRef = useRef<PlayerGameView["phase"] | null>(null);
  const accessToken = session?.access_token ?? null;
  const viewerSeatIndex = roomWithPlayers?.viewerSeatIndex ?? null;

  const currentSeat = useMemo(() => {
    if (!roomWithPlayers || roomWithPlayers.viewerSeatIndex === null) return null;
    return roomWithPlayers.players.find(
      (player) => player.seat_index === roomWithPlayers.viewerSeatIndex,
    ) ?? null;
  }, [roomWithPlayers]);

  const isHost = roomWithPlayers?.isHost ?? false;
  const takeoverCandidates = roomWithPlayers?.room.status === "playing" && isHost
    ? roomWithPlayers.players.filter(
        (player) => player.kind === "human" && !player.is_connected && !player.bot_takeover,
      )
    : [];
  const canStartGame = Boolean(
    roomWithPlayers &&
      roomWithPlayers.room.status === "lobby" &&
      roomWithPlayers.players.every((player) => player.kind !== "human" || player.is_ready),
  );
  const playerView = roomWithPlayers?.game ?? null;
  const gameState = playerView;
  const displayedRoomStatus =
    roomWithPlayers?.room.status === "finished" && gameState?.phase !== "game-over"
      ? "playing"
      : roomWithPlayers?.room.status;
  const finalWinner =
    displayedRoomStatus === "finished" &&
    gameState?.winnerTeam !== null &&
    gameState?.winnerTeam !== undefined
      ? teamName(gameState.winnerTeam, gameState.playerNames)
      : null;
  const canPlayCard = Boolean(
    gameState &&
      currentSeat &&
      !currentSeat.bot_takeover &&
      roomWithPlayers?.room.status === "playing" &&
      displayedRoomStatus === "playing" &&
      gameState.phase === "playing" &&
      gameState.currentPlayerId === currentSeat.seat_index,
  );
  const canBid = Boolean(
    playerView &&
      currentSeat &&
      !currentSeat.bot_takeover &&
      roomWithPlayers?.room.status === "playing" &&
      displayedRoomStatus === "playing" &&
      playerView.phase === "bidding" &&
      playerView.currentPlayerId === currentSeat.seat_index,
  );
  const currentContract = playerView?.contract ?? null;
  const canBidCoinche = Boolean(
    currentSeat && canBid && canCoinche(currentSeat.seat_index, currentContract),
  );
  const canBidSurcoinche = Boolean(
    currentSeat && canBid && canSurcoinche(currentSeat.seat_index, currentContract),
  );
  const legalCards = canPlayCard && playerView?.trump
    ? getLegalCards(
        playerView.hand,
        playerView.currentTrick,
        playerView.viewerPlayerId,
        playerView.trump,
      )
    : [];

  useEffect(() => {
    const phase = playerView?.phase ?? null;

    if (!phase) {
      previousPhaseRef.current = phase;
      return;
    }

    if (previousPhaseRef.current === phase) {
      return;
    }

    previousPhaseRef.current = phase;

    if (phase === "playing") {
      setIsRightPanelOpen(false);
      return;
    }

    if (phase === "finished" || phase === "game-over") {
      setIsRightPanelOpen(true);
    }
  }, [playerView?.phase]);
  const canShowNextRoundButton = Boolean(
    roomWithPlayers?.room.status === "playing" &&
      gameState?.phase === "finished" &&
      displayedRoomStatus !== "finished",
  );

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

    const profileName = await getProfileUsername(supabase, nextSession.user.id);
    setLocalDisplayName(profileName ?? nextSession.user.email?.split("@")[0] ?? "Joueur");

    try {
      const nextRoom = await fetchRoomView(roomId, nextSession);
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
    if (!roomId || !accessToken || viewerSeatIndex === null) return;

    let active = true;
    let inFlight = false;
    const heartbeat = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const nextRoom = await sendPresenceHeartbeat(roomId, { access_token: accessToken });
        if (active) {
          setRoomWithPlayers((current) =>
            current && current.room.state_version > nextRoom.room.state_version
              ? current
              : nextRoom);
          setPageState("ready");
        }
      } catch {
        // A later heartbeat or visibility event will retry after transient connectivity failures.
      } finally {
        inFlight = false;
      }
    };

    void heartbeat();
    const intervalId = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    const handleReturn = () => void heartbeat();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleReturn);
    window.addEventListener("online", handleReturn);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleReturn);
      window.removeEventListener("online", handleReturn);
    };
  }, [accessToken, roomId, viewerSeatIndex]);

  async function handleToggleReady() {
    const supabase = getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || !currentSeat) return;

    setIsUpdatingReady(true);
    setError(null);

    try {
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "set-ready", ready: !currentSeat.is_ready },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (readyError) {
      setError(errorMessage(readyError));
    } finally {
      setIsUpdatingReady(false);
    }
  }

  async function handleJoinSeat(seatIndex: RoomPlayerRow["seat_index"]) {
    const supabase = getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || isJoiningSeat) return;

    setIsJoiningSeat(true);
    setError(null);

    try {
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "join-seat", displayName: localDisplayName, seatIndex },
        session,
      );

      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (joinError) {
      setError(errorMessage(joinError));
    } finally {
      setIsJoiningSeat(false);
    }
  }

  async function handleLeaveSeat() {
    const supabase = getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || !currentSeat || isLeavingSeat) return;

    setIsLeavingSeat(true);
    setError(null);

    try {
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "leave-seat" },
        session,
      );

      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (leaveError) {
      setError(errorMessage(leaveError));
    } finally {
      setIsLeavingSeat(false);
    }
  }

  async function handleStartGame() {
    const supabase = getSupabaseClient();

    if (!supabase || !roomWithPlayers || !isHost || !canStartGame) return;

    setIsStartingGame(true);
    setError(null);

    try {
      if (!session) return;
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "start-game" },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setIsStartingGame(false);
    }
  }

  async function handleEnableBotTakeover(seatIndex: RoomPlayerRow["seat_index"]) {
    if (!roomWithPlayers || !session || !isHost || takeoverSeatInFlight !== null) return;

    setTakeoverSeatInFlight(seatIndex);
    setError(null);
    try {
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "enable-bot-takeover", seatIndex },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (takeoverError) {
      setError(errorMessage(takeoverError));
    } finally {
      setTakeoverSeatInFlight(null);
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
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "game-action", action },
        session,
      );
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

    if (!supabase || !roomWithPlayers || !session || isResettingRoom) return;

    setIsResettingRoom(true);
    setError(null);

    try {
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "reset-room" },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setIsResettingRoom(false);
    }
  }

  async function handleStartNextRound() {
    const supabase = getSupabaseClient();

    if (
      !supabase ||
      !roomWithPlayers ||
      !session ||
      !currentSeat ||
      !canShowNextRoundButton ||
      isStartingNextRound
    ) {
      return;
    }

    setIsStartingNextRound(true);
    setError(null);

    try {
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "next-round" },
        session,
      );
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (nextRoundError) {
      setError(errorMessage(nextRoundError));
    } finally {
      setIsStartingNextRound(false);
    }
  }

  const isPlayingLayout = displayedRoomStatus === "playing";
  const shouldLockPortrait = isMobilePortrait && displayedRoomStatus === "playing";

  if (shouldLockPortrait) {
    return <MobileLandscapeNotice />;
  }

  return (
    <main
      className={
        isPlayingLayout
          ? `min-h-[calc(100dvh-56px)] overflow-x-hidden overflow-y-auto bg-[#f4f1e8] px-3 py-2 text-stone-950 sm:px-4 lg:h-[calc(100dvh-56px)] lg:overflow-hidden${isMobileLandscape ? " overflow-hidden px-0 py-0 sm:px-4" : ""}`
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
        {pageState === "unavailable" ? (
          <StatusMessage>Supabase est indisponible. Vérifie .env.local.</StatusMessage>
        ) : null}

        {pageState === "signed-out" ? (
          <StatusMessage>
            Connecte-toi pour voir cette table.
            <Link
              className="mt-4 inline-flex rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
              href="/login"
            >
              Se connecter
            </Link>
          </StatusMessage>
        ) : null}

        {pageState === "loading" ? <StatusMessage>Chargement de la table...</StatusMessage> : null}

        {pageState === "missing" ? (
          <StatusMessage>{error ?? "Table introuvable."}</StatusMessage>
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
                    Retour à la table
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
                        Table multijoueur
                      </p>
                      <h1 className="mt-1 font-mono text-3xl font-bold">
                        {roomWithPlayers.room.code}
                      </h1>
                      <p className="mt-2 text-sm text-stone-600">
                        Statut: {statusLabel(roomWithPlayers.room.status)} | Mode:{" "}
                        {scoringModeLabel(roomWithPlayers.room.scoring_mode)} | Cible:{" "}
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
                        {currentSeat?.is_ready ? "Pas prêt" : "Prêt"}
                      </button>
                      {isHost ? (
                        <button
                          className="rounded-md bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canStartGame || isStartingGame}
                          onClick={handleStartGame}
                          type="button"
                        >
                          Lancer la partie
                        </button>
                      ) : null}
                    </div>
                  </div>

                </section>

                <LobbyTable
                  canJoinSeat={!isJoiningSeat}
                  currentSeatIndex={roomWithPlayers.viewerSeatIndex}
                  onJoinSeat={handleJoinSeat}
                  players={roomWithPlayers.players}
                />

                <WaitingArea
                  currentSeat={currentSeat}
                  displayName={currentSeat?.display_name ?? localDisplayName}
                  firstFreeSeat={
                    roomWithPlayers.players.find((player) => player.kind === "empty")
                      ?.seat_index ?? null
                  }
                  hasFreeSeat={roomWithPlayers.players.some((player) => player.kind === "empty")}
                  isJoiningSeat={isJoiningSeat}
                  isLeavingSeat={isLeavingSeat}
                  onJoinSeat={handleJoinSeat}
                  onLeaveSeat={handleLeaveSeat}
                />
              </>
            ) : null}

            {displayedRoomStatus === "playing" && playerView ? (
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
                  <div className={`flex items-center justify-end ${isMobileLandscape ? "hidden" : ""}`}>
                    <button
                      className="hidden rounded-md border border-stone-300 bg-white/90 px-2 py-1 text-xs font-semibold text-stone-700 shadow-sm hover:bg-white lg:inline-flex"
                      onClick={() => setIsRightPanelOpen((current) => !current)}
                      type="button"
                    >
                      {isRightPanelOpen ? "Masquer infos" : "Afficher infos"}
                    </button>
                  </div>

                  {takeoverCandidates.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-stone-700">
                      {takeoverCandidates.map((player) => (
                        <button
                          className="rounded-md border border-amber-300 bg-white px-2 py-1 font-semibold hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={takeoverSeatInFlight !== null}
                          key={player.seat_index}
                          onClick={() => void handleEnableBotTakeover(player.seat_index)}
                          type="button"
                        >
                          Faire jouer un bot pour {player.display_name}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <GameTable
                    bottomOverlay={
                      isMobileLandscape
                        ? playerView.phase === "bidding"
                          ? (
                              <BiddingPanel
                                canBid={canBid && !isPlayingCard}
                                canCoinche={canBidCoinche && !isPlayingCard}
                                canSurcoinche={canBidSurcoinche && !isPlayingCard}
                                compact
                                currentContract={currentContract}
                                onBid={handleBid}
                                onCoinche={handleCoinche}
                                onPass={handlePass}
                                onSurcoinche={handleSurcoinche}
                              />
                            )
                          : playerView.phase === "playing"
                            ? (
                                <HumanHand
                                  canPlay={canPlayCard && !isPlayingCard}
                                  cards={playerView.hand}
                                  embedded
                                  legalCards={legalCards}
                                  onPlayCard={handlePlayCard}
                                />
                              )
                            : null
                        : undefined
                    }
                    immersiveMobileLandscape={isMobileLandscape}
                    players={roomWithPlayers.players}
                    state={playerView}
                    showLiveScore={isMobileLandscape || (!isRightPanelOpen && playerView.phase === "playing")}
                  />

                  {!isMobileLandscape && playerView.phase === "bidding" ? (
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

                  {playerView.phase === "finished" && canShowNextRoundButton ? (
                    <div className="lg:hidden">
                      <button
                        className="w-full rounded-md bg-stone-900 px-3 py-3 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isStartingNextRound}
                        onClick={handleStartNextRound}
                        type="button"
                      >
                        Manche suivante
                      </button>
                    </div>
                  ) : null}

                  {!isMobileLandscape ? (
                    <div className={playerView.phase === "bidding" ? "hidden sm:block" : ""}>
                      <HumanHand
                        canPlay={canPlayCard && !isPlayingCard}
                        cards={playerView.hand}
                        legalCards={legalCards}
                        onPlayCard={handlePlayCard}
                      />
                    </div>
                  ) : null}
                </div>

                {isRightPanelOpen && !isMobileLandscape ? (
                  <div className="flex min-h-0 flex-col gap-2">
                    {canShowNextRoundButton ? (
                      <button
                        className="rounded-md bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isStartingNextRound}
                        onClick={handleStartNextRound}
                        type="button"
                      >
                        Manche suivante
                      </button>
                    ) : null}

                    <ScoreBoard state={playerView} showActions={false} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

const LOBBY_SEAT_POSITIONS: Record<
  RoomPlayerRow["seat_index"],
  {
    label: string;
    className: string;
  }
> = {
  0: {
    label: "Bas",
    className: "bottom-4 left-1/2 -translate-x-1/2",
  },
  1: {
    label: "Droite",
    className: "right-4 top-1/2 -translate-y-1/2",
  },
  2: {
    label: "Haut",
    className: "left-1/2 top-4 -translate-x-1/2",
  },
  3: {
    label: "Gauche",
    className: "left-4 top-1/2 -translate-y-1/2",
  },
};

function LobbyTable({
  canJoinSeat,
  currentSeatIndex,
  onJoinSeat,
  players,
}: {
  canJoinSeat: boolean;
  currentSeatIndex: RoomPlayerRow["seat_index"] | null;
  onJoinSeat: (seatIndex: RoomPlayerRow["seat_index"]) => void;
  players: RoomPlayerView[];
}) {
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Places</h2>
      <div
        className="relative mt-4 min-h-[360px] overflow-hidden rounded-lg border border-emerald-900/20 bg-emerald-700 bg-cover bg-center p-4 shadow-sm"
        style={{ backgroundImage: `url(${TABLE_BACKGROUND_IMAGE})` }}
      >
        {players.map((player) => {
          const position = LOBBY_SEAT_POSITIONS[player.seat_index];

          return (
            <div className={`absolute ${position.className}`} key={player.seat_index}>
              <SeatCard
                canJoin={canJoinSeat && player.kind === "empty"}
                isCurrentUser={player.seat_index === currentSeatIndex}
                onJoin={() => onJoinSeat(player.seat_index)}
                player={player}
                positionLabel={position.label}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WaitingArea({
  currentSeat,
  displayName,
  firstFreeSeat,
  hasFreeSeat,
  isJoiningSeat,
  isLeavingSeat,
  onJoinSeat,
  onLeaveSeat,
}: {
  currentSeat: RoomPlayerView | null;
  displayName: string;
  firstFreeSeat: RoomPlayerRow["seat_index"] | null;
  hasFreeSeat: boolean;
  isJoiningSeat: boolean;
  isLeavingSeat: boolean;
  onJoinSeat: (seatIndex: RoomPlayerRow["seat_index"]) => void;
  onLeaveSeat: () => void;
}) {
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            En attente
          </p>
          <p className="mt-1 text-sm font-semibold text-stone-900">
            {displayName} <span className="text-stone-500">(Toi)</span>
          </p>
          <p className="mt-1 text-xs text-stone-600">
            {currentSeat
              ? "Tu es assis. Tu peux quitter ta place ou cliquer une autre place libre."
              : hasFreeSeat
                ? "Clique une place libre pour t'asseoir."
                : "La table est pleine pour le moment."}
          </p>
        </div>

        {currentSeat ? (
          <button
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLeavingSeat}
            onClick={onLeaveSeat}
            type="button"
          >
            Quitter la place
          </button>
        ) : (
          <button
            className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasFreeSeat || firstFreeSeat === null || isJoiningSeat}
            onClick={() => {
              if (firstFreeSeat !== null) {
                onJoinSeat(firstFreeSeat);
              }
            }}
            type="button"
          >
            S&apos;asseoir
          </button>
        )}
      </div>
    </section>
  );
}

function SeatCard({
  canJoin,
  isCurrentUser,
  onJoin,
  player,
  positionLabel,
}: {
  canJoin: boolean;
  isCurrentUser: boolean;
  onJoin: () => void;
  player: RoomPlayerView;
  positionLabel: string;
}) {
  const isEmpty = player.kind === "empty";
  const kindLabel = player.kind === "bot" ? "Bot" : "Joueur";

  return (
    <button
      className={[
        "flex h-20 w-32 flex-col items-center justify-center rounded-md border bg-white px-3 text-center text-sm shadow-sm transition",
        player.is_ready
          ? "border-emerald-600 shadow-emerald-300/70 ring-2 ring-emerald-300"
          : "border-stone-200",
        canJoin ? "cursor-pointer hover:border-emerald-600 hover:bg-emerald-50" : "cursor-default",
      ].join(" ")}
      disabled={!canJoin}
      onClick={onJoin}
      type="button"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
        Place {positionLabel}
      </span>
      <span className="mt-2 block font-bold text-stone-950">
        {isEmpty ? "Place libre" : player.display_name}
        {isCurrentUser ? " (Toi)" : ""}
      </span>
      {!isEmpty ? (
        player.kind === "human" ? (
          <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-stone-600">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${player.is_connected ? "bg-emerald-600" : "bg-stone-400"}`}
            />
            {player.bot_takeover ? "Bot temporaire" : player.is_connected ? "En ligne" : "Hors ligne"}
          </span>
        ) : (
          <span className="mt-1 block text-xs font-semibold text-stone-600">{kindLabel}</span>
        )
      ) : null}
    </button>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-5 text-sm text-stone-700 shadow-sm">
      {children}
    </section>
  );
}

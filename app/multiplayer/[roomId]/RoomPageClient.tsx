"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BiddingPanel } from "@/components/BiddingPanel";
import { GameTable } from "@/components/GameTable";
import { GameTopBar, type GameMenuAction } from "@/components/GameTopBar";
import { HumanHand } from "@/components/HumanHand";
import { MobileLandscapeNotice } from "@/components/MobileLandscapeNotice";
import { RoundCompletionCard } from "@/components/RoundCompletionCard";
import { FinishedRoomCard } from "@/components/multiplayer/FinishedRoomCard";
import { LobbyHeader, LobbyRulesDialog, LobbyTable, WaitingArea } from "@/components/multiplayer/RoomLobby";
import { useMultiplayerRoomActions } from "@/components/multiplayer/useMultiplayerRoomActions";
import { errorMessage, useMultiplayerRoomSync } from "@/components/multiplayer/useMultiplayerRoomSync";
import { useMultiplayerRoomTimers } from "@/components/multiplayer/useMultiplayerRoomTimers";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import {
  appDangerActionClass,
  appPrimaryActionClass,
  appSecondaryActionClass,
} from "@/components/ui/AppShell";
import { PlayerSettingsDialog } from "@/components/settings/PlayerSettingsPanel";
import { usePlayerPreferences } from "@/components/settings/PlayerPreferencesProvider";
import { canCoinche, canSurcoinche, getCurrentContractFromBids } from "@/engine/bidding";
import { resolveContractMode } from "@/engine/contractMode";
import { explainIllegalCard } from "@/engine/illegalCardExplanation";
import { teamName } from "@/engine/players";
import { getLegalCards } from "@/engine/rules";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { rulesetToCustomInput, type CustomRulesetInput } from "@/engine/rulesets/custom";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import { resolveRoomRules } from "@/engine/rulesets/room";
import type { BidValue, Card, ContractMode } from "@/engine/types";
import { handWithoutPendingCard, visiblePendingCard, type PendingLocalPlay } from "@/lib/multiplayerOptimisticPlay";
import { loginPath } from "@/lib/authRedirect";
import { MultiplayerApiError, sendRoomIntent } from "@/lib/multiplayerApi";
import type { RoomPlayerAction, RoomPlayerRow } from "@/lib/roomTypes";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { normalizeMultiplayerTablePreferences } from "@/lib/multiplayerTablePreferences";

function roomIdFromParams(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function MultiplayerRoomPage() {
  const { preferences } = usePlayerPreferences();
  const params = useParams();
  const roomId = roomIdFromParams(params.roomId);
  const {
    accessToken,
    error,
    loadRoom,
    localDisplayName,
    pageState,
    profileUsername,
    roomWithPlayers,
    session,
    setError,
    setPageState,
    setRoomWithPlayers,
    viewerSeatIndex,
  } = useMultiplayerRoomSync(roomId);
  const [isPlayingCard, setIsPlayingCard] = useState(false);
  const [pendingLocalPlay, setPendingLocalPlay] = useState<PendingLocalPlay | null>(null);
  const actionInFlightRef = useRef(false);
  const [isForfeitConfirmationOpen, setIsForfeitConfirmationOpen] = useState(false);
  const [isHostTransferOpen, setIsHostTransferOpen] = useState(false);
  const [hostTransferSeat, setHostTransferSeat] = useState<RoomPlayerRow["seat_index"] | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rulesDraft, setRulesDraft] = useState<CustomRulesetInput>({ presetId: "contree-kffr" });
  const [rulesChangedNotice, setRulesChangedNotice] = useState(false);
  const previousRulesKeyRef = useRef<string | null>(null);
  const currentSeat = useMemo(() => {
    if (!roomWithPlayers || roomWithPlayers.viewerSeatIndex === null) return null;
    return roomWithPlayers.players.find(
      (player) => player.seat_index === roomWithPlayers.viewerSeatIndex,
    ) ?? null;
  }, [roomWithPlayers]);

  const isHost = roomWithPlayers?.isHost ?? false;
  const storedTablePreferences = roomWithPlayers?.room.presentation_settings;
  const storedTableSpeed = storedTablePreferences?.gameSpeed;
  const storedAutoCollectTricks = storedTablePreferences?.autoCollectTricks;
  const storedTrickDisplayMs = storedTablePreferences?.trickDisplayMs;
  const tablePreferences = useMemo(
    () => normalizeMultiplayerTablePreferences({
      gameSpeed: storedTableSpeed,
      autoCollectTricks: storedAutoCollectTricks,
      trickDisplayMs: storedTrickDisplayMs,
    }),
    [storedAutoCollectTricks, storedTableSpeed, storedTrickDisplayMs],
  );
  const { turnSecondsRemaining } = useMultiplayerRoomTimers({
    accessToken,
    roomId,
    roomWithPlayers,
    setRoomWithPlayers,
    tablePreferences,
    viewerSeatIndex,
  });
  const lobbyRules = useMemo(() => roomWithPlayers ? resolveRoomRules(roomWithPlayers.room) : CONTREE_KFFR_RULESET, [roomWithPlayers]);
  useEffect(() => {
    if (!roomWithPlayers || roomWithPlayers.room.status !== "lobby") return;
    const key = JSON.stringify(roomWithPlayers.room.ruleset_snapshot ?? [roomWithPlayers.room.scoring_mode, roomWithPlayers.room.target_score]);
    if (previousRulesKeyRef.current !== null && previousRulesKeyRef.current !== key) setRulesChangedNotice(true);
    previousRulesKeyRef.current = key;
  }, [roomWithPlayers]);
  const takeoverCandidates = roomWithPlayers?.room.status === "playing" && isHost
    ? roomWithPlayers.players.filter(
        (player) => player.kind === "human" && !player.is_connected && !player.bot_takeover,
      )
    : [];
  const hostTransferCandidates = roomWithPlayers && roomWithPlayers.room.status !== "cancelled" && isHost
    ? roomWithPlayers.players.filter(
        (player) => player.kind === "human" && !player.is_host && player.is_connected,
      )
    : [];
  const selectedHostTransferPlayer = hostTransferCandidates.find(
    (player) => player.seat_index === hostTransferSeat,
  ) ?? null;
  const canStartGame = Boolean(
    roomWithPlayers &&
      roomWithPlayers.room.status === "lobby" &&
      roomWithPlayers.players.every((player) => player.kind !== "human" || player.is_ready),
  );
  const playerView = roomWithPlayers?.game ?? null;
  const visiblePendingCardValue = visiblePendingCard(pendingLocalPlay, roomWithPlayers?.room.state_version ?? null, playerView?.hand ?? null);
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
  const finalOutcome = finalWinner
    ? gameState?.endReason === "forfeit"
      ? `${finalWinner} gagnent par abandon.`
      : `${finalWinner} gagnent`
    : "Fin de partie";
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
  const currentContract = playerView?.phase === "bidding"
    ? getCurrentContractFromBids(playerView.bids)
    : playerView?.contract ?? null;
  const currentMode = playerView ? resolveContractMode(playerView) : null;
  const gameRules = playerView ? resolveGameRules(playerView.settings) : null;
  const canBidCoinche = Boolean(
    currentSeat && canBid && canCoinche(currentSeat.seat_index, currentContract, gameRules?.bidding),
  );
  const canBidSurcoinche = Boolean(
    currentSeat && canBid && canSurcoinche(currentSeat.seat_index, currentContract, gameRules?.bidding),
  );
  const legalCards = canPlayCard && playerView && currentMode
    ? getLegalCards(
        playerView.hand,
        playerView.currentTrick,
        playerView.viewerPlayerId,
        currentMode,
        gameRules?.cardPlay,
      )
    : [];

  const canShowNextRoundButton = Boolean(
    roomWithPlayers?.room.status === "playing" &&
      gameState?.phase === "finished" &&
      displayedRoomStatus !== "finished",
  );
  const {
    handleEnableBotTakeover,
    handleForfeitGame,
    handleJoinSeat,
    handleLeaveSeat,
    handleRematch,
    handleStartGame,
    handleStartNextRound,
    handleToggleReady,
    handleTransferHost,
    handleUpdateRules,
    handleUpdateTablePreferences,
    isForfeiting,
    isJoiningSeat,
    isLeavingSeat,
    isResettingRoom,
    isStartingGame,
    isStartingNextRound,
    isTransferringHost,
    isUpdatingReady,
    isUpdatingRules,
    isUpdatingTablePreferences,
    takeoverSeatInFlight,
  } = useMultiplayerRoomActions({
    canShowNextRoundButton,
    canStartGame,
    currentSeat,
    hostTransferSeat,
    isHost,
    profileUsername,
    roomWithPlayers,
    rulesDraft,
    session,
    setError,
    setHostTransferSeat,
    setIsForfeitConfirmationOpen,
    setIsHostTransferOpen,
    setIsRulesOpen,
    setPageState,
    setRoomWithPlayers,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const portraitQuery = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    const landscapeQuery = window.matchMedia("(max-width: 900px) and (orientation: landscape)");
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

  async function handleRoomPlayerAction(action: RoomPlayerAction) {
    const supabase = getSupabaseClient();
    const isCardAction = action.type === "play-card";

    if (
      !supabase ||
      !roomWithPlayers ||
      !session ||
      (isCardAction ? !canPlayCard : !canBid) || actionInFlightRef.current
    ) {
      return;
    }

    actionInFlightRef.current = true;
    setIsPlayingCard(true);
    if (isCardAction) setPendingLocalPlay({ card: action.card, version: roomWithPlayers.room.state_version });
    setError(null);

    try {
      const nextRoom = await sendRoomIntent(
        roomWithPlayers.room.id,
        roomWithPlayers.room.state_version,
        { type: "game-action", action },
        session,
      );
      setRoomWithPlayers((current) => current && current.room.state_version > nextRoom.room.state_version ? current : nextRoom);
      setPageState("ready");
    } catch (playError) {
      setError(errorMessage(playError));
      if (playError instanceof MultiplayerApiError && playError.status === 409) void loadRoom({ silent: true });
    } finally {
      actionInFlightRef.current = false;
      setPendingLocalPlay(null);
      setIsPlayingCard(false);
    }
  }

  function handlePlayCard(card: Card) {
    void handleRoomPlayerAction({ type: "play-card", card });
  }

  function illegalCardMessage(card: Card): string {
    if (!playerView || !currentMode || !gameRules) return "Cette carte n'est pas jouable.";
    return explainIllegalCard({ hand: playerView.hand, trick: playerView.currentTrick, card, playerId: playerView.viewerPlayerId, mode: currentMode, rules: gameRules.cardPlay }) ?? "Cette carte n'est pas jouable.";
  }

  function handleBid(value: BidValue, contractMode: ContractMode) {
    void handleRoomPlayerAction({ type: "bid", value, contractMode });
  }

  function handleCapot(contractMode: ContractMode) {
    void handleRoomPlayerAction({ type: "capot", contractMode });
  }

  function handleGenerale(contractMode: ContractMode) {
    void handleRoomPlayerAction({ type: "generale", contractMode });
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

  const isPlayingLayout = displayedRoomStatus === "playing";
  const isLobbyLayout = displayedRoomStatus === "lobby" && pageState === "ready";
  const isFinishedLayout = displayedRoomStatus === "finished" && pageState === "ready";
  const shouldLockPortrait = isMobilePortrait && displayedRoomStatus === "playing";
  const gameMenuActions: GameMenuAction[] = [
    ...(isHost && hostTransferCandidates.length > 0 ? [{ label: "Transférer l’hôte", onSelect: () => { setHostTransferSeat(null); setIsHostTransferOpen(true); } }] : []),
    ...(displayedRoomStatus === "playing" ? [{ label: "Abandonner la partie", onSelect: () => setIsForfeitConfirmationOpen(true), tone: "danger" as const }] : []),
  ];

  if (shouldLockPortrait) {
    return <><GameTopBar contextLabel={roomWithPlayers?.room.code ?? "Multijoueur"} focusMode={isFocusMode} onOpenPreferences={() => setIsSettingsOpen(true)} onToggleFocusMode={() => setIsFocusMode((current) => !current)} /><MobileLandscapeNotice />{isSettingsOpen ? <PlayerSettingsDialog context={{ mode: "multiplayer", isHost, tablePreferences, isSavingTablePreferences: isUpdatingTablePreferences, onTablePreferencesChange: handleUpdateTablePreferences }} onClose={() => setIsSettingsOpen(false)} /> : null}</>;
  }

  return (
    <><GameTopBar contextLabel={roomWithPlayers?.room.code ?? "Multijoueur"} focusMode={isFocusMode} menuActions={gameMenuActions} onOpenPreferences={() => setIsSettingsOpen(true)} onToggleFocusMode={() => setIsFocusMode((current) => !current)} showFocusMode={isPlayingLayout} /><main
      className={
        isPlayingLayout
          ? `coinche-game-shell h-[calc(100dvh-48px)] min-h-0 overflow-x-hidden overflow-y-auto px-2 py-2 sm:px-3 lg:overflow-hidden${isMobileLandscape ? " overflow-hidden px-0 py-0 sm:px-3" : ""}`
          : isLobbyLayout
          ? "coinche-app-page coinche-lobby-shell h-[calc(100dvh-48px)] min-h-0 overflow-hidden px-2 py-2 sm:px-3"
          : isFinishedLayout
          ? "coinche-app-page flex h-[calc(100dvh-48px)] min-h-0 items-center justify-center px-3 py-4"
          : "coinche-app-page min-h-[calc(100dvh-48px)] px-3 py-5 text-stone-50 sm:px-5 sm:py-7"
      }
    >
      <div
        className={
          isPlayingLayout
            ? "flex h-full w-full flex-col gap-2"
            : isLobbyLayout
            ? "mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-2"
            : isFinishedLayout
            ? "mx-auto flex w-full max-w-xl flex-col"
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
              className={`${appPrimaryActionClass} mt-4`}
              href={loginPath(`/multiplayer/${roomId}`)}
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
          <p className="fixed left-1/2 top-14 z-40 -translate-x-1/2 rounded-xl border border-red-300/30 bg-red-950/90 px-4 py-2 text-sm font-semibold text-red-100 shadow-xl">
            {error}
          </p>
        ) : null}

        {pageState === "ready" && roomWithPlayers ? (
          <>
            {displayedRoomStatus === "finished" && gameState ? (
              <FinishedRoomCard
                isHost={roomWithPlayers.isHost}
                isResettingRoom={isResettingRoom}
                onRematch={handleRematch}
                onReturn={() => void loadRoom()}
                outcome={finalOutcome}
                scores={gameState.totalScore}
              />
            ) : null}

            {displayedRoomStatus === "lobby" ? (
              <>
                <LobbyHeader
                  canStartGame={canStartGame}
                  canTransferHost={hostTransferCandidates.length > 0}
                  code={roomWithPlayers.room.code}
                  currentSeat={currentSeat}
                  isHost={isHost}
                  isStartingGame={isStartingGame}
                  isUpdatingReady={isUpdatingReady}
                  onOpenPreferences={() => setIsSettingsOpen(true)}
                  onOpenRules={() => { if (isHost) setRulesDraft(rulesetToCustomInput(lobbyRules)); setIsRulesOpen(true); }}
                  onReady={handleToggleReady}
                  onRefresh={() => void loadRoom()}
                  onStartGame={handleStartGame}
                  onTransferHost={() => { setHostTransferSeat(null); setIsHostTransferOpen(true); }}
                  scoringMode={roomWithPlayers.room.scoring_mode}
                  status={roomWithPlayers.room.status}
                  targetScore={roomWithPlayers.room.target_score}
                />

                {rulesChangedNotice ? <p className="shrink-0 rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-primary)]">Règles modifiées · confirme à nouveau que tu es prêt.</p> : null}

                <LobbyTable
                  canJoinSeat={!isJoiningSeat && Boolean(profileUsername)}
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
                  profileUsername={profileUsername}
                  onJoinSeat={handleJoinSeat}
                  onLeaveSeat={handleLeaveSeat}
                />
              </>
            ) : null}
            {isRulesOpen && displayedRoomStatus === "lobby" ? <LobbyRulesDialog isHost={isHost} isUpdatingRules={isUpdatingRules} onClose={() => setIsRulesOpen(false)} onSave={() => void handleUpdateRules()} onRulesDraftChange={setRulesDraft} rulesDraft={rulesDraft} ruleset={lobbyRules} /> : null}
            {isHostTransferOpen && isHost ? <AccessibleDialog description="Choisis un joueur connecté. Le transfert est immédiat." footer={<button className={`${appPrimaryActionClass} w-full sm:w-auto`} disabled={!selectedHostTransferPlayer || isTransferringHost} type="button" onClick={() => void handleTransferHost()}>{isTransferringHost ? "Transfert…" : selectedHostTransferPlayer ? `Confirmer pour ${selectedHostTransferPlayer.display_name}` : "Choisir un joueur"}</button>} onClose={() => { if (!isTransferringHost) setIsHostTransferOpen(false); }} title="Transférer l'hôte" width="medium"><div className="grid gap-2 overflow-y-auto p-4 sm:p-6">{hostTransferCandidates.map((player) => <button aria-pressed={hostTransferSeat === player.seat_index} className={`rounded-xl border px-4 py-3 text-left font-semibold transition ${hostTransferSeat === player.seat_index ? "border-amber-300/50 bg-amber-200/15 text-amber-950" : "border-stone-300 bg-white/70 text-stone-800 hover:bg-white"}`} key={player.seat_index} onClick={() => setHostTransferSeat(player.seat_index)} type="button">{player.display_name}</button>)}</div></AccessibleDialog> : null}

            {displayedRoomStatus === "playing" && playerView ? (
              <div
                className={[
                  "relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-2",
                  isMobileLandscape ? "grid-cols-[minmax(0,1fr)]" : "",
                ].join(" ")}
              >
                <div className={`flex min-h-0 flex-col gap-2 ${isMobileLandscape ? "gap-0" : ""}`}>
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
                    optimisticCard={visiblePendingCardValue ? { playerId: playerView.viewerPlayerId, card: visiblePendingCardValue } : null}
                    biddingControls={playerView.phase === "bidding" && canBid && !isPlayingCard ? <BiddingPanel
                      bids={playerView.bids}
                      biddingRules={gameRules?.bidding}
                      canBid={canBid && !isPlayingCard}
                      canCoinche={canBidCoinche && !isPlayingCard}
                      canSurcoinche={canBidSurcoinche && !isPlayingCard}
                      compact
                      currentContract={currentContract}
                      onBid={handleBid}
                      onCapot={handleCapot}
                      onGenerale={handleGenerale}
                      onCoinche={handleCoinche}
                      onPass={handlePass}
                      onSurcoinche={handleSurcoinche}
                      playerId={playerView.viewerPlayerId}
                    /> : null}
                    hand={(playerView.phase === "bidding" || playerView.phase === "playing") ? <HumanHand
                      canPlay={canPlayCard && !isPlayingCard}
                      cards={handWithoutPendingCard(playerView.hand, visiblePendingCardValue)}
                      contractMode={currentMode}
                      illegalCardMessage={illegalCardMessage}
                      inScene
                      legalCards={legalCards}
                      onPlayCard={handlePlayCard}
                    /> : null}
                    immersiveMobileLandscape={isMobileLandscape}
                    minimalHud={isFocusMode}
                    players={roomWithPlayers.players}
                    presentationScope={roomId ?? "multiplayer"}
                    state={playerView}
                    showLiveScore={preferences.assistance.showLivePoints}
                    trickPresentationPolicy={{ autoCollect: tablePreferences.autoCollectTricks, delayMs: tablePreferences.trickDisplayMs }}
                    turnSecondsRemaining={turnSecondsRemaining}
                  />

                </div>

              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {displayedRoomStatus === "playing" && playerView?.phase === "finished" && canShowNextRoundButton ? (
        <RoundCompletionCard actionLabel="Manche suivante" disabled={isStartingNextRound} onAction={handleStartNextRound} state={playerView} />
      ) : null}

      {isForfeitConfirmationOpen ? <AccessibleDialog description="Ton équipe perdra immédiatement la partie." footer={<div className="flex justify-end gap-2"><button className={appSecondaryActionClass} disabled={isForfeiting} onClick={() => setIsForfeitConfirmationOpen(false)} type="button">Continuer la partie</button><button className={appDangerActionClass} disabled={isForfeiting} onClick={() => void handleForfeitGame()} type="button">{isForfeiting ? "Abandon…" : "Abandonner"}</button></div>} onClose={() => { if (!isForfeiting) setIsForfeitConfirmationOpen(false); }} title="Abandonner la partie ?"><div /></AccessibleDialog> : null}
      {isSettingsOpen ? <PlayerSettingsDialog context={{ mode: "multiplayer", isHost, tablePreferences, isSavingTablePreferences: isUpdatingTablePreferences, onTablePreferencesChange: handleUpdateTablePreferences }} onClose={() => setIsSettingsOpen(false)} /> : null}
    </main></>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="coinche-app-surface rounded-2xl border border-white/10 bg-[#0b1c15]/90 p-5 text-sm text-stone-300 shadow-xl">
      {children}
    </section>
  );
}

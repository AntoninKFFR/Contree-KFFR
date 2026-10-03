"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { RulesetSummary } from "@/components/rules/RulesetSummary";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import type { CustomRulesetInput } from "@/engine/rulesets/custom";
import type { GameRulesetSnapshot } from "@/engine/rulesets/types";
import { scoringModeLabel } from "@/lib/productGame";
import type { MultiplayerRoomView, RoomPlayerRow, RoomPlayerView } from "@/lib/roomTypes";
import { RankEmblem } from "@/components/rating/RankEmblem";

// Clipboard fallback is local UI only; restore the caller's focus even on failure.
export async function copyRoomCode(code: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      return true;
    }
  } catch { /* A denied Clipboard API can still allow an explicit copy command. */ }
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = code;
  field.readOnly = true;
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;";
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, code.length);
    return document.execCommand?.("copy") === true;
  } catch {
    return false;
  } finally {
    field.remove();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
  }
}

function statusLabel(status: MultiplayerRoomView["room"]["status"]): string {
  if (status === "lobby") return "en attente";
  if (status === "playing") return "en cours";
  if (status === "finished") return "terminée";
  return "annulée";
}

export function canInviteFriendsFromRoom(room: MultiplayerRoomView | null): boolean {
  if (!room || room.room.status !== "lobby" || room.viewerSeatIndex === null) return false;
  const viewer = room.players.find((player) => player.seat_index === room.viewerSeatIndex);
  return viewer?.kind === "human" && room.players.some((player) => player.kind === "empty");
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

export function LobbyRulesDialog({
  isHost, isUpdatingRules, onClose, onRulesDraftChange, onSave, rulesDraft, ruleset,
}: {
  isHost: boolean;
  isUpdatingRules: boolean;
  onClose: () => void;
  onRulesDraftChange: (value: CustomRulesetInput) => void;
  onSave: () => void;
  rulesDraft: CustomRulesetInput;
  ruleset: GameRulesetSnapshot;
}) {
  return <AccessibleDialog
    description={isHost ? "Partagées par toute la table. Une modification redemande la confirmation des joueurs." : "Règles actuelles de cette table."}
    footer={isHost ? <button className={`${appPrimaryActionClass} w-full sm:w-auto`} disabled={isUpdatingRules} type="button" onClick={onSave}>{isUpdatingRules ? "Enregistrement…" : "Enregistrer les règles"}</button> : undefined}
    onClose={onClose}
    stableHeight={isHost}
    title="Règles de la table"
    width={isHost ? "wide" : "medium"}
  >
    {isHost ? <RulesetConfigurator value={rulesDraft} onChange={onRulesDraftChange} /> : <div className="overflow-y-auto p-4"><RulesetSummary ruleset={ruleset} compact showDifferences /></div>}
  </AccessibleDialog>;
}

export function LobbyHeader({
  canInviteFriends, canStartGame, canTransferHost, code, currentSeat, isHost, isStartingGame, isUpdatingReady,
  onInviteFriends, onOpenPreferences, onOpenRules, onReady, onRefresh, onStartGame, onTransferHost,
  scoringMode, status, targetScore,
}: {
  canInviteFriends: boolean;
  canStartGame: boolean;
  canTransferHost: boolean;
  code: string;
  currentSeat: RoomPlayerView | null;
  isHost: boolean;
  isStartingGame: boolean;
  isUpdatingReady: boolean;
  onInviteFriends: () => void;
  onOpenPreferences: () => void;
  onOpenRules: () => void;
  onReady: () => void;
  onRefresh: () => void;
  onStartGame: () => void;
  onTransferHost: () => void;
  scoringMode: MultiplayerRoomView["room"]["scoring_mode"];
  status: MultiplayerRoomView["room"]["status"];
  targetScore: number;
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const copying = useRef(false);
  const startIsPrimary = isHost && canStartGame;
  async function handleCopy() {
    if (copying.current) return;
    copying.current = true;
    try { setCopyFeedback(await copyRoomCode(code) ? "Code copié" : "Copie indisponible"); }
    finally { copying.current = false; }
  }
  function secondaryActions(inDialog: boolean) {
    const invoke = (action: () => void) => () => { if (inDialog) setIsMoreOpen(false); action(); };
    return <>
      <button className={appSecondaryActionClass} onClick={invoke(onOpenPreferences)} type="button">Préférences</button>
      <button className={appSecondaryActionClass} onClick={invoke(onOpenRules)} type="button">Règles</button>
      <button className={appSecondaryActionClass} onClick={invoke(onRefresh)} type="button">Rafraîchir</button>
      {isHost ? <button className={appSecondaryActionClass} disabled={!canTransferHost} onClick={invoke(onTransferHost)} type="button">Transférer l&apos;hôte</button> : null}
    </>;
  }
  return <section className="coinche-app-surface coinche-lobby-header shrink-0 border px-3 py-2.5 sm:px-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="coinche-lobby-identity">
        <div>
        <h1 className="font-mono text-2xl font-bold leading-none tracking-wide">{code}</h1>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{statusLabel(status)} · {scoringModeLabel(scoringMode)} · {targetScore} pts</p>
        </div>
        <div className="coinche-lobby-code-actions">
          <button className={appSecondaryActionClass} onClick={() => void handleCopy()} type="button">Copier le code</button>
          <span className="coinche-lobby-copy-status" role="status">{copyFeedback}</span>
        </div>
      </div>
      <div className="coinche-lobby-actions flex flex-wrap gap-1.5">
        <div className="coinche-lobby-secondary-inline">{secondaryActions(false)}</div>
        {canInviteFriends ? <button className={appSecondaryActionClass} onClick={onInviteFriends} type="button">Inviter des amis</button> : null}
        <button className={!currentSeat?.is_ready && !startIsPrimary ? appPrimaryActionClass : appSecondaryActionClass} disabled={!currentSeat || isUpdatingReady} onClick={onReady} type="button">{currentSeat?.is_ready ? "Pas prêt" : "Prêt"}</button>
        {isHost ? <>
          <button className={startIsPrimary ? appPrimaryActionClass : appSecondaryActionClass} disabled={!canStartGame || isStartingGame} onClick={onStartGame} type="button">Lancer la partie</button>
        </> : null}
        <button aria-expanded={isMoreOpen} aria-haspopup="dialog" aria-label="Plus d’actions pour la table" className={`${appSecondaryActionClass} coinche-lobby-more`} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setIsMoreOpen(true); }} type="button">Plus</button>
      </div>
    </div>
    {isMoreOpen ? createPortal(<AccessibleDialog backdropClassName="coinche-lobby-menu-backdrop" minimalHeader onClose={() => setIsMoreOpen(false)} title="Actions de la table" width="medium"><div className="coinche-lobby-secondary-menu">{secondaryActions(true)}</div></AccessibleDialog>, document.body) : null}
  </section>;
}

export function LobbyTable({
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
    <section className="coinche-app-surface coinche-lobby-table flex min-h-0 flex-1 flex-col border p-2 sm:p-3">
      <h2 className="coinche-ui-kicker mb-1 text-xs font-bold uppercase tracking-[0.16em]">Places</h2>
      <div
        className="coinche-game-table coinche-lobby-felt relative min-h-0 flex-1 overflow-hidden rounded-xl border border-emerald-900/20 bg-cover bg-center shadow-sm"
      >
        {players.map((player) => {
          const position = LOBBY_SEAT_POSITIONS[player.seat_index];

          return (
            <div className={`coinche-lobby-seat-slot absolute ${position.className}`} data-seat-index={player.seat_index} key={player.seat_index}>
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

export function WaitingArea({
  currentSeat,
  displayName,
  firstFreeSeat,
  hasFreeSeat,
  isJoiningSeat,
  isLeavingSeat,
  profileUsername,
  onJoinSeat,
  onLeaveSeat,
}: {
  currentSeat: RoomPlayerView | null;
  displayName: string;
  firstFreeSeat: RoomPlayerRow["seat_index"] | null;
  hasFreeSeat: boolean;
  isJoiningSeat: boolean;
  isLeavingSeat: boolean;
  profileUsername: string | null;
  onJoinSeat: (seatIndex: RoomPlayerRow["seat_index"]) => void;
  onLeaveSeat: () => void;
}) {
  return (
    <section className="coinche-app-surface coinche-lobby-waiting shrink-0 border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="coinche-ui-kicker text-xs font-bold uppercase tracking-wide">En attente</span>
          <span className="coinche-lobby-waiting-name font-semibold text-[color:var(--text-primary)]" title={currentSeat ? `${displayName} (toi)` : undefined}>{currentSeat ? `${displayName} (toi)` : "Choisis une place pour rejoindre"}</span>
          {!profileUsername ? <Link className="text-xs font-semibold underline" href="/profile">Choisir un pseudo</Link> : !currentSeat && !hasFreeSeat ? <span className="text-xs text-[color:var(--text-secondary)]">Table pleine</span> : null}
        </div>

        {currentSeat ? (
          <button
            className={appSecondaryActionClass}
            disabled={isLeavingSeat}
            onClick={onLeaveSeat}
            type="button"
          >
            Quitter la place
          </button>
        ) : (
          <button
            className={appPrimaryActionClass}
            disabled={!profileUsername || !hasFreeSeat || firstFreeSeat === null || isJoiningSeat}
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
        "coinche-lobby-seat relative flex min-h-20 w-36 flex-col items-center justify-center rounded-xl border px-3 py-1 text-center text-sm transition",
        player.is_ready
          ? "border-emerald-300/60 ring-2 ring-emerald-300/30"
          : "border-white/15",
        canJoin ? "cursor-pointer hover:border-amber-200/60 hover:bg-[var(--surface-hover)]" : "cursor-default",
      ].join(" ")}
      disabled={!canJoin}
      onClick={onJoin}
      title={isEmpty ? `Place ${positionLabel} libre` : `${player.display_name}${isCurrentUser ? " (Toi)" : ""}`}
      type="button"
    >
      <span className="coinche-lobby-seat-position text-xs font-semibold uppercase tracking-wide text-stone-400">
        Place {positionLabel}
      </span>
      <span className="coinche-lobby-seat-identity mt-1 flex min-w-0 w-full items-center justify-center gap-2">
        {player.kind === "human" && player.is_ranked && player.rating !== null ? <RankEmblem decorative rating={player.rating} size="sm" /> : null}
        <span className="min-w-0">
          <span className="flex min-w-0 justify-center font-bold text-stone-50">
            <span className="truncate">{isEmpty ? "Place libre" : player.display_name}</span>
            {isCurrentUser ? <span className="shrink-0">&nbsp;(Toi)</span> : null}
          </span>
          {player.kind === "human" ? <span className="block text-xs font-semibold text-stone-300">{player.is_ranked ? player.rank : "Placement"}</span> : null}
        </span>
      </span>
      {player.is_host ? <span className="coinche-lobby-seat-host mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-900">Hôte</span> : null}
      {!isEmpty ? (
        player.kind === "human" ? (
          <span className="coinche-lobby-seat-presence mt-1 flex items-center gap-1 text-xs font-semibold text-stone-300">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${player.is_connected ? "bg-emerald-600" : "bg-stone-400"}`}
            />
            <span>{player.bot_takeover ? "Bot temporaire" : player.is_connected ? "En ligne" : "Hors ligne"} · {player.is_ready ? "Prêt" : "Pas prêt"}</span>
          </span>
        ) : (
          <span className="mt-1 block text-xs font-semibold text-stone-300">{kindLabel}</span>
        )
      ) : null}
    </button>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { GameInvitationsSnapshot, SocialSearchResult, SocialSnapshot } from "@/lib/socialApi";
import { FriendPresenceList } from "@/components/social/FriendPresenceList";
import {
  AppPage,
  AppPageHeader,
  AppSurface,
  appDangerActionClass,
  appInputClass,
  appPrimaryActionClass,
  appSecondaryActionClass,
} from "@/components/ui/AppShell";

export type FriendsPageState = "loading" | "unavailable" | "signed-out" | "username-required" | "error" | "ready";

type FriendsViewProps = {
  state: FriendsPageState;
  snapshot: SocialSnapshot | null;
  pageError?: string | null;
  actionMessage?: string | null;
  gameInvitations?: GameInvitationsSnapshot | null;
  currentUserId?: string | null;
  query: string;
  searchResults: SocialSearchResult[];
  searchState: "idle" | "loading" | "ready" | "error";
  searchError?: string | null;
  pendingAction?: string | null;
  onlineIds?: ReadonlySet<string>;
  onRetry?: () => void;
  onQueryChange?: (value: string) => void;
  onSend?: (userId: string) => void;
  onAccept?: (requestId: string) => void;
  onDecline?: (requestId: string) => void;
  onCancelGameInvitation?: (invitationId: string) => void;
  onDeclineGameInvitation?: (invitationId: string) => void;
  onJoinGameInvitation?: (invitationId: string) => void;
  onCancel?: (requestId: string) => void;
  onRemove?: (userId: string, username: string) => void;
  onPlayWithFriend?: (userId: string, username: string) => void;
  onTrainWithFriend?: (userId: string, username: string) => void;
  onAnswerRequest?: (requestId: string) => void;
};

export function FriendsView(props: FriendsViewProps) {
  const { state } = props;
  if (state !== "ready") {
    const content = state === "loading"
      ? { title: "Chargement…", body: "Nous préparons ton espace amis." }
      : state === "signed-out"
        ? { title: "Non connecté", body: "Connecte-toi pour retrouver tes amis et tes demandes." }
        : state === "username-required"
          ? { title: "Choisis d’abord ton pseudo", body: "Ton pseudo est nécessaire pour être trouvé et ajouter des amis." }
          : state === "unavailable"
            ? { title: "Service indisponible", body: "Vérifie la configuration Supabase puis recharge la page." }
            : { title: "Impossible de charger tes amis", body: props.pageError ?? "Réessaie dans un instant." };
    return (
      <AppPage width="wide">
        <AppPageHeader eyebrow="Espace social" title={content.title} description={content.body}>
          {state === "signed-out" ? <Link className={`${appPrimaryActionClass} mt-5`} href="/login?next=%2Ffriends">Se connecter</Link> : null}
          {state === "username-required" ? <Link className={`${appPrimaryActionClass} mt-5`} href="/profile">Choisir mon pseudo</Link> : null}
          {state === "error" && props.onRetry ? <button className={`${appPrimaryActionClass} mt-5`} onClick={props.onRetry} type="button">Réessayer</button> : null}
        </AppPageHeader>
      </AppPage>
    );
  }

  const snapshot = props.snapshot;
  if (!snapshot) return null;
  return <FriendsReadyView {...props} snapshot={snapshot} />;
}

function FriendsReadyView(props: FriendsViewProps & { snapshot: SocialSnapshot }) {
  const { snapshot } = props;
  const [moreId, setMoreId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const hasFriends = snapshot.friends.length > 0;
  const menuOpen = moreId !== null && !props.pendingAction && snapshot.friends.some((friend) => friend.userId === moreId);

  function closeMenu(restoreFocus = false) {
    setMoreId(null);
    if (restoreFocus && triggerRef.current?.isConnected && !triggerRef.current.disabled) triggerRef.current.focus({ preventScroll: true });
  }

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const containWheel = (event: WheelEvent) => {
      // WebKit can chain wheel scrolling despite CSS overscroll containment.
      // Leave scrolling within the list and user zoom entirely native.
      if (event.ctrlKey || event.metaKey || event.shiftKey || !event.deltaY) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 0) return;
      const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(scroller).lineHeight) || 24
        : event.deltaMode === 2 ? scroller.clientHeight : 1;
      const next = scroller.scrollTop + event.deltaY * unit;
      if (next < 0 || next > max) { event.preventDefault(); scroller.scrollTop = Math.max(0, Math.min(max, next)); }
    };
    scroller.addEventListener("wheel", containWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", containWheel);
  }, [hasFriends]);

  useEffect(() => {
    if (!menuOpen) { setMoreId(null); return; }
    const menu = menuRef.current!;
    menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    // Inline expansion stays in the list's flow. Reveal it using only that scroller.
    const scroller = menu.closest<HTMLElement>(".friend-presence-scroll");
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      const item = menu.getBoundingClientRect();
      if (item.bottom > bounds.bottom) scroller.scrollTop += item.bottom - bounds.bottom;
    }
    // Read the current trigger: another row can open its menu in the same click.
    const owns = (target: EventTarget | null) => triggerRef.current?.closest(".friends-more")?.contains(target as Node);
    let pointerActive = false;
    const pointerStart = () => { pointerActive = true; };
    const pointerEnd = () => { pointerActive = false; };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeMenu(true); }
    };
    const outside = (event: MouseEvent) => {
      if (!owns(event.target)) {
        const interactive = (event.target as Element).closest?.("a, button, input, select, textarea, [tabindex]");
        closeMenu(!interactive);
      }
    };
    // A pointer's focus precedes its click. Keep the inline row in place until
    // that click so another row's control does not move away under the pointer.
    const focusOutside = (event: FocusEvent) => { if (!pointerActive && !owns(event.target)) closeMenu(); };
    document.addEventListener("pointerdown", pointerStart, true);
    document.addEventListener("pointerup", pointerEnd, true);
    document.addEventListener("pointercancel", pointerEnd, true);
    document.addEventListener("keydown", keydown);
    document.addEventListener("click", outside);
    document.addEventListener("focusin", focusOutside);
    return () => {
      document.removeEventListener("pointerdown", pointerStart, true);
      document.removeEventListener("pointerup", pointerEnd, true);
      document.removeEventListener("pointercancel", pointerEnd, true);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("click", outside);
      document.removeEventListener("focusin", focusOutside);
    };
  }, [menuOpen, moreId]);
  const friendIds = new Set(snapshot.friends.map((friend) => friend.userId));
  const sentByUser = new Map(snapshot.sent.map((request) => [request.userId, request]));
  const receivedByUser = new Map(snapshot.received.map((request) => [request.userId, request]));

  return (
    <AppPage width="wide" className="friends-page">
      <AppPageHeader description="Retrouve tes partenaires, réponds à tes demandes et cherche un joueur par son pseudo." eyebrow="Espace social" title="Amis" />
      {props.actionMessage ? <p className="coinche-notice" data-tone="success" role="status">{props.actionMessage}</p> : null}

      <GameInvitationsSection
        currentUserId={props.currentUserId}
        invitations={props.gameInvitations}
        onCancel={props.onCancelGameInvitation}
        onDecline={props.onDeclineGameInvitation}
        onJoin={props.onJoinGameInvitation}
        pendingAction={props.pendingAction}
      />

      <div className="friends-sections grid gap-8">
        <SocialSection count={snapshot.counts.friends} title="Mes amis">
          {snapshot.friends.length === 0 ? <EmptyText>Tu n&apos;as pas encore d&apos;amis ajoutés.</EmptyText> : (
            <div className="friend-presence-scroll" data-testid="friends-presence-scroll" ref={scrollerRef}>
              <FriendPresenceList friends={snapshot.friends} onlineIds={props.onlineIds ?? new Set()}
                identity={(friend, content) => props.pendingAction
                  ? <button className="friends-identity" type="button" disabled aria-disabled="true" aria-label={`Voir le profil de ${friend.username}`} title={friend.username}>{content}</button>
                  : <Link className="friends-identity" href={`/friends/${friend.userId}`} tabIndex={0} aria-label={`Voir le profil de ${friend.username}`} title={friend.username}>{content}</Link>}
                action={(friend) => <div className="friend-play-actions friends-actions">
                <button
                  className={`${appPrimaryActionClass} friend-presence-button`}
                  disabled={Boolean(props.pendingAction)}
                  onClick={() => props.onPlayWithFriend?.(friend.userId, friend.username)}
                  type="button"
                >
                  {props.pendingAction === `play:${friend.userId}` ? "Création…" : "Jouer"}
                </button>
                <button className={`${appSecondaryActionClass} friend-presence-button`} disabled={Boolean(props.pendingAction)} type="button"
                  onClick={() => props.onTrainWithFriend?.(friend.userId, friend.username)}>
                  {props.pendingAction === `train:${friend.userId}` ? "Création…" : "S’entraîner"}
                </button>
                <div className="friends-more">
                  <button className={`${appSecondaryActionClass} friends-more-trigger`} type="button" disabled={Boolean(props.pendingAction)}
                    aria-label={`Plus d’actions pour ${friend.username}`} aria-haspopup="menu" aria-expanded={menuOpen && moreId === friend.userId}
                    aria-controls={menuOpen && moreId === friend.userId ? menuId : undefined}
                    onClick={(event) => { if (menuOpen && moreId === friend.userId) closeMenu(true); else { triggerRef.current = event.currentTarget; setMoreId(friend.userId); } }}
                    onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); triggerRef.current = event.currentTarget; setMoreId(friend.userId); } }}>
                    <span aria-hidden="true">…</span>
                  </button>
                  {menuOpen && moreId === friend.userId ? <div className="friends-more-menu" id={menuId} ref={menuRef} role="menu" aria-label={`Actions pour ${friend.username}`}>
                    <button className={`${appDangerActionClass} friend-presence-button`} type="button" role="menuitem"
                      onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); event.currentTarget.focus(); } }}
                      onClick={() => { closeMenu(true); props.onRemove?.(friend.userId, friend.username); }}>Supprimer de mes amis</button>
                  </div> : null}
                </div>
                {props.pendingAction === `friend:${friend.userId}` ? <p className="friends-remove-status" role="status">Suppression…</p> : null}
              </div>} />
            </div>
          )}
        </SocialSection>

        {snapshot.received.length || snapshot.sent.length ? <SocialSection count={snapshot.counts.received + snapshot.counts.sent} title="Demandes">
          {snapshot.received.length > 0 ? <ul className="coinche-social-list">
              {snapshot.received.map((request) => {
                const pending = props.pendingAction === `request:${request.id}` || (props.pendingAction?.startsWith("play:") || props.pendingAction?.startsWith("train:"));
                return (
                  <li className="coinche-social-row friends-request-row" id={`friend-request-${request.id}`} key={request.id} tabIndex={-1}>
                    <div className="friends-request-content w-full">
                      <PlayerName username={request.username} />
                      <div className="friends-social-actions flex gap-2">
                        <button className={appPrimaryActionClass} disabled={pending} onClick={() => props.onAccept?.(request.id)} type="button">{pending ? "En cours…" : "Accepter"}</button>
                        <button className={appSecondaryActionClass} disabled={pending} onClick={() => props.onDecline?.(request.id)} type="button">Refuser</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul> : null}
          {snapshot.sent.length > 0 ? <ul className="coinche-social-list">
              {snapshot.sent.map((request) => (
                <li className="coinche-social-row friends-request-row" key={request.id}>
                  <PlayerName username={request.username} />
                  <button className={appSecondaryActionClass} disabled={props.pendingAction === `request:${request.id}` || (props.pendingAction?.startsWith("play:") || props.pendingAction?.startsWith("train:"))} onClick={() => props.onCancel?.(request.id)} type="button">
                    {props.pendingAction === `request:${request.id}` ? "Annulation…" : "Annuler"}
                  </button>
                </li>
              ))}
            </ul> : null}
        </SocialSection> : <p className="text-sm text-[var(--text-secondary)]">Demandes · aucune en attente</p>}

        <SocialSection title="Ajouter un ami">
          <label className="block text-sm font-bold text-[var(--text-primary)]" htmlFor="friend-search">Pseudo</label>
          <input
            autoComplete="off"
            className={`${appInputClass} mt-2 max-w-xl`}
            id="friend-search"
            maxLength={40}
            onChange={(event) => props.onQueryChange?.(event.target.value)}
            placeholder="Au moins 3 caractères"
            value={props.query}
          />
          <SearchResults
            friendIds={friendIds}
            onAnswerRequest={props.onAnswerRequest}
            onSend={props.onSend}
            pendingAction={props.pendingAction}
            query={props.query}
            receivedByUser={receivedByUser}
            results={props.searchResults}
            searchError={props.searchError}
            searchState={props.searchState}
            sentByUser={sentByUser}
          />
        </SocialSection>
      </div>
    </AppPage>
  );
}

function GameInvitationsSection({
  currentUserId,
  invitations,
  onCancel,
  onDecline,
  onJoin,
  pendingAction,
}: {
  currentUserId?: string | null;
  invitations?: GameInvitationsSnapshot | null;
  onCancel?: (invitationId: string) => void;
  onDecline?: (invitationId: string) => void;
  onJoin?: (invitationId: string) => void;
  pendingAction?: string | null;
}) {
  if (!invitations || !currentUserId) return null;
  const received = invitations.invitations.filter(
    (invitation) => invitation.status === "pending" && invitation.inviteeId === currentUserId,
  );
  const sent = invitations.invitations.filter(
    (invitation) => invitation.status === "pending" && invitation.inviterId === currentUserId,
  );
  if (received.length === 0 && sent.length === 0) return null;
  return (
    <AppSurface variant="plain">
      <h2 className="mb-3 text-lg font-black text-[var(--text-primary)]">Invitations de partie · {received.length + sent.length}</h2>
      {received.length > 0 ? (
        <ul className="coinche-social-list">
          {received.map((invitation) => {
            const pending = pendingAction === `game-invitation:${invitation.id}` || (pendingAction?.startsWith("play:") || pendingAction?.startsWith("train:"));
            return (
              <li className="coinche-social-row friends-invitation-row" key={invitation.id}>
                <div className="min-w-0">
                  <PlayerName username={invitation.otherUsername} />
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Table {invitation.roomCode} · expire {formatInvitationExpiry(invitation.expiresAt)}</p>
                </div>
                <div className="friends-social-actions flex gap-2">
                  <button className={appPrimaryActionClass} disabled={pending} onClick={() => onJoin?.(invitation.id)} type="button">{pending ? "Vérification…" : "Rejoindre"}</button>
                  <button className={appSecondaryActionClass} disabled={pending} onClick={() => onDecline?.(invitation.id)} type="button">Refuser</button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {sent.length > 0 ? (
        <div className={received.length > 0 ? "mt-4" : ""}>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">Envoyées</p>
          <ul className="coinche-social-list">
            {sent.map((invitation) => {
              const pending = pendingAction === `game-invitation:${invitation.id}` || (pendingAction?.startsWith("play:") || pendingAction?.startsWith("train:"));
              return (
                <li className="coinche-social-row friends-invitation-row" key={invitation.id}>
                  <div className="min-w-0"><PlayerName username={invitation.otherUsername} /><p className="mt-0.5 text-xs text-[var(--text-secondary)]">Table {invitation.roomCode}</p></div>
                  <button className={appSecondaryActionClass} disabled={pending} onClick={() => onCancel?.(invitation.id)} type="button">{pending ? "Annulation…" : "Annuler"}</button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </AppSurface>
  );
}

function formatInvitationExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "bientôt";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function SocialSection({ children, count, title }: { children: React.ReactNode; count?: number; title: string }) {
  return (
    <AppSurface variant="plain">
      <h2 className="mb-3 text-lg font-black text-[var(--text-primary)]">{title}{count !== undefined ? ` · ${count}` : ""}</h2>
      {children}
    </AppSurface>
  );
}

function PlayerName({ username }: { username: string }) {
  return <p className="min-w-0 truncate font-bold text-[var(--text-primary)]" title={username}>{username}</p>;
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--text-secondary)]">{children}</p>;
}

function SearchResults({
  friendIds,
  onAnswerRequest,
  onSend,
  pendingAction,
  query,
  receivedByUser,
  results,
  searchError,
  searchState,
  sentByUser,
}: {
  friendIds: Set<string>;
  onAnswerRequest?: (requestId: string) => void;
  onSend?: (userId: string) => void;
  pendingAction?: string | null;
  query: string;
  receivedByUser: Map<string, { id: string }>;
  results: SocialSearchResult[];
  searchError?: string | null;
  searchState: "idle" | "loading" | "ready" | "error";
  sentByUser: Map<string, { id: string }>;
}) {
  const normalized = query.trim();
  if (normalized.length < 3) return <p className="mt-3 text-xs font-semibold text-[var(--text-secondary)]">La recherche démarre à partir de 3 caractères.</p>;
  if (searchState === "loading") return <p className="mt-3 text-sm text-[var(--text-secondary)]">Recherche…</p>;
  if (searchState === "error") return <p className="coinche-notice mt-3" data-tone="error" role="alert">{searchError ?? "Recherche impossible."}</p>;
  if (searchState === "ready" && results.length === 0) return <p className="mt-3 text-sm text-[var(--text-secondary)]">Aucun joueur trouvé.</p>;
  return (
    <ul className="coinche-social-list mt-3">
      {results.map((result) => {
        const received = receivedByUser.get(result.userId);
        const pending = pendingAction === `search:${result.userId}` || (pendingAction?.startsWith("play:") || pendingAction?.startsWith("train:"));
        let action: React.ReactNode;
        if (friendIds.has(result.userId)) action = <span className="text-xs font-bold text-[var(--success)]">Déjà ami</span>;
        else if (sentByUser.has(result.userId)) action = <span className="text-xs font-bold text-[var(--text-secondary)]">Demande envoyée</span>;
        else if (received) action = <button className={appSecondaryActionClass} disabled={Boolean(pendingAction)} onClick={() => onAnswerRequest?.(received.id)} type="button">Répondre à la demande</button>;
        else action = <button className={appPrimaryActionClass} disabled={pending} onClick={() => onSend?.(result.userId)} type="button">{pending ? "Envoi…" : "Ajouter"}</button>;
        return <li className="coinche-social-row friends-search-row" key={result.userId}><PlayerName username={result.username} />{action}</li>;
      })}
    </ul>
  );
}

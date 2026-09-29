"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  acceptFriendRequest, declineFriendRequest, declineGameInvitation, fetchGameInvitations,
  fetchSocialSnapshot, gameInvitationRoomPath, resolveGameInvitation, socialErrorMessage,
  SocialApiError,
} from "@/lib/socialApi";
import { SOCIAL_CHANGED_EVENT, notifySocialChanged } from "@/lib/socialEvents";
import { newNotificationKeys, notificationBadge, notificationKey, pendingNotifications, type PendingNotification } from "@/lib/socialNotifications";
import { getSupabaseClient } from "@/lib/supabaseClient";

type NotificationsContextValue = {
  userId: string | null;
  items: PendingNotification[];
  toasts: string[];
  open: boolean;
  busy: string | null;
  message: string | null;
  toggle: () => void;
  close: () => void;
  dismissToast: (key: string) => void;
  act: (item: PendingNotification, action: "accept" | "decline" | "join") => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("SocialNotificationsProvider is missing");
  return value;
}

export function SocialNotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<PendingNotification[]>([]);
  const [toasts, setToasts] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const epochRef = useRef(0);
  const keysRef = useRef<Set<string> | null>(null);
  const hiddenRef = useRef(new Set<string>());
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const busyRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((key: string) => {
    const timer = toastTimersRef.current.get(key);
    if (timer) clearTimeout(timer);
    toastTimersRef.current.delete(key);
    setToasts((current) => current.filter((value) => value !== key));
  }, []);

  const refresh = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    if (inFlightRef.current) { rerunRef.current = true; return; }
    inFlightRef.current = true;
    const epoch = epochRef.current;
    try {
      const [social, games] = await Promise.all([fetchSocialSnapshot(session), fetchGameInvitations(session)]);
      if (epoch !== epochRef.current) return;
      const pending = pendingNotifications(social, games, session.user.id);
      const newKeys = newNotificationKeys(keysRef.current, pending);
      keysRef.current = new Set(pending.map(notificationKey));
      for (const key of [...hiddenRef.current]) {
        if (!keysRef.current.has(key)) hiddenRef.current.delete(key);
      }
      setItems(pending.filter((item) => !hiddenRef.current.has(notificationKey(item))));
      setToasts((current) => [...new Set([...current.filter((key) => keysRef.current?.has(key) && !hiddenRef.current.has(key)), ...newKeys])].slice(-2));
    } catch {
      // Keep the last authorized snapshot; focus, visibility and polling retry.
    } finally {
      if (epoch === epochRef.current) {
        inFlightRef.current = false;
        if (rerunRef.current) { rerunRef.current = false; void refresh(); }
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { debounceRef.current = null; void refresh(); }, 180);
  }, [refresh]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let cancelled = false;
    let authSeen = false;
    const toastTimers = toastTimersRef.current;
    const changeSession = (next: Session | null) => {
      if (cancelled) return;
      if (sessionRef.current?.user.id === next?.user.id) { sessionRef.current = next; return; }
      epochRef.current += 1;
      sessionRef.current = next;
      keysRef.current = null;
      hiddenRef.current.clear();
      rerunRef.current = false;
      inFlightRef.current = false;
      busyRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      for (const timer of toastTimers.values()) clearTimeout(timer);
      toastTimersRef.current.clear();
      if (channelRef.current) void client.removeChannel(channelRef.current);
      channelRef.current = null;
      setUserId(next?.user.id ?? null);
      setItems([]); setToasts([]); setOpen(false); setBusy(null); setMessage(null);
      if (!next) return;
      const filterId = next.user.id;
      channelRef.current = client.channel(`social-notifications:${filterId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "friend_requests", filter: `recipient_id=eq.${filterId}` }, scheduleRefresh)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "friend_requests", filter: `recipient_id=eq.${filterId}` }, scheduleRefresh)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_invitations", filter: `invitee_id=eq.${filterId}` }, scheduleRefresh)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_invitations", filter: `invitee_id=eq.${filterId}` }, scheduleRefresh)
        .subscribe();
      void refresh();
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => { authSeen = true; changeSession(next); });
    void client.auth.getSession().then(({ data }) => { if (!authSeen) changeSession(data.session); });
    return () => {
      cancelled = true;
      epochRef.current += 1;
      subscription.unsubscribe();
      if (channelRef.current) void client.removeChannel(channelRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      for (const timer of toastTimers.values()) clearTimeout(timer);
    };
  }, [refresh, scheduleRefresh]);

  useEffect(() => {
    if (!userId) return;
    const whenVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(whenVisible, 60_000);
    window.addEventListener("focus", whenVisible);
    window.addEventListener("online", whenVisible);
    document.addEventListener("visibilitychange", whenVisible);
    window.addEventListener(SOCIAL_CHANGED_EVENT, scheduleRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", whenVisible);
      window.removeEventListener("online", whenVisible);
      document.removeEventListener("visibilitychange", whenVisible);
      window.removeEventListener(SOCIAL_CHANGED_EVENT, scheduleRefresh);
    };
  }, [userId, refresh, scheduleRefresh]);

  useEffect(() => {
    for (const key of toasts) {
      if (!toastTimersRef.current.has(key)) toastTimersRef.current.set(key, setTimeout(() => dismissToast(key), 10_000));
    }
    for (const [key, timer] of toastTimersRef.current) {
      if (!toasts.includes(key)) { clearTimeout(timer); toastTimersRef.current.delete(key); }
    }
  }, [toasts, dismissToast]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5_000);
    return () => clearTimeout(timer);
  }, [message]);

  const act = useCallback((item: PendingNotification, action: "accept" | "decline" | "join") => {
    const session = sessionRef.current;
    const key = notificationKey(item);
    if (!session || busyRef.current) return;
    const epoch = epochRef.current;
    busyRef.current = key;
    setBusy(key);
    setMessage(null);
    void (async () => {
      try {
        if (item.kind === "friend") {
          if (action === "accept") await acceptFriendRequest(item.id, session);
          else await declineFriendRequest(item.id, session);
        } else if (action === "join") {
          const resolution = await resolveGameInvitation(item.id, session);
          if (epoch !== epochRef.current) return;
          if (resolution.state !== "joinable" || !resolution.roomId) {
            hiddenRef.current.add(key);
            setItems((current) => current.filter((entry) => notificationKey(entry) !== key));
            dismissToast(key);
            setMessage("Cette invitation n’est plus disponible.");
            await refresh();
            return;
          }
          dismissToast(key);
          setOpen(false);
          router.push(gameInvitationRoomPath(resolution.roomId, item.id));
          return;
        } else await declineGameInvitation(item.id, session);
        if (epoch !== epochRef.current) return;
        hiddenRef.current.add(key);
        setItems((current) => current.filter((entry) => notificationKey(entry) !== key));
        dismissToast(key);
        setMessage(item.kind === "friend" && action === "accept" ? `${item.request.username} est maintenant dans tes amis.` : null);
        notifySocialChanged();
        await refresh();
      } catch (error) {
        if (epoch !== epochRef.current) return;
        if (error instanceof SocialApiError && [404, 409].includes(error.status)) {
          hiddenRef.current.add(key);
          setItems((current) => current.filter((entry) => notificationKey(entry) !== key));
          dismissToast(key);
          setMessage(item.kind === "game" ? "Cette invitation n’est plus disponible." : "Cette demande n’est plus disponible.");
          await refresh();
        } else setMessage(socialErrorMessage(error));
      } finally {
        if (epoch === epochRef.current) { busyRef.current = null; setBusy(null); }
      }
    })();
  }, [dismissToast, refresh, router]);

  return <NotificationsContext.Provider value={{
    userId, items, toasts, open, busy, message,
    toggle: () => { setOpen((value) => !value); void refresh(); },
    close: () => setOpen(false), dismissToast, act,
  }}>{children}<SocialNotificationOverlays /></NotificationsContext.Provider>;
}

export function SocialNotificationTrigger() {
  const context = useContext(NotificationsContext);
  if (!context) return null;
  const { userId, items, open, toggle } = context;
  if (!userId) return null;
  const count = items.length;
  return <button aria-controls="social-notification-center" aria-describedby={count ? "social-notification-count" : undefined} aria-expanded={open} aria-label="Notifications" className="coinche-chrome-icon social-notification-trigger relative" onClick={toggle} title={count ? `${count} notifications en attente` : "Notifications"} type="button">
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    {count > 0 ? <><span aria-hidden="true" className="social-notification-badge">{notificationBadge(count)}</span><span className="sr-only" id="social-notification-count">{count} notifications en attente</span></> : null}
  </button>;
}

function NotificationCard({ item, busy, act }: { item: PendingNotification; busy: string | null; act: NotificationsContextValue["act"] }) {
  const key = notificationKey(item);
  const working = busy === key;
  return <div className="social-notification-card">
    <p className="social-notification-title">{item.kind === "friend" ? "Nouvelle demande" : "Invitation de partie"}</p>
    <p>{item.kind === "friend" ? `${item.request.username} veut t’ajouter` : `${item.invitation.otherUsername} t’invite à jouer`}</p>
    {item.kind === "game" ? <p className="social-notification-detail">Table {item.invitation.roomCode}</p> : null}
    <div className="social-notification-actions">
      <button aria-label={item.kind === "friend" ? `Accepter la demande de ${item.request.username}` : `Rejoindre la partie de ${item.invitation.otherUsername}`} disabled={Boolean(busy)} onClick={() => act(item, item.kind === "friend" ? "accept" : "join")} type="button">{working ? "Patiente…" : item.kind === "friend" ? "Accepter" : "Rejoindre"}</button>
      <button aria-label={item.kind === "friend" ? `Refuser la demande de ${item.request.username}` : `Refuser l’invitation de ${item.invitation.otherUsername}`} disabled={Boolean(busy)} onClick={() => act(item, "decline")} type="button">Refuser</button>
    </div>
  </div>;
}

function SocialNotificationOverlays() {
  const { userId, items, toasts, open, busy, message, close, dismissToast, act } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !(target instanceof Element && target.closest(".social-notification-trigger"))) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [open, close]);
  if (!userId) return null;
  const toastItems = toasts.map((key) => items.find((item) => notificationKey(item) === key)).filter((item): item is PendingNotification => Boolean(item));
  return <>
    {open ? <div className="social-notification-center" id="social-notification-center" ref={panelRef}>
      <h2>Notifications</h2>
      {items.length ? <div className="social-notification-list">{items.map((item) => <NotificationCard act={act} busy={busy} item={item} key={notificationKey(item)} />)}</div> : <p>Aucune notification en attente.</p>}
      {message ? <p role="status">{message}</p> : null}
    </div> : null}
    {toastItems.length ? <div aria-label="Nouvelles notifications" className="social-notification-toasts">{toastItems.map((item) => <div className="social-notification-toast" key={notificationKey(item)} role="status" aria-live="polite"><button aria-label="Fermer la notification" className="social-notification-dismiss" onClick={() => dismissToast(notificationKey(item))} type="button">×</button><NotificationCard act={act} busy={busy} item={item} /></div>)}</div> : null}
    {!open && message ? <div className="social-notification-feedback" role="status">{message}</div> : null}
  </>;
}

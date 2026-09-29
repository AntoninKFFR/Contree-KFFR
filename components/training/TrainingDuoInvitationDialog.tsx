"use client";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { appInputClass, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { FriendPresenceList } from "@/components/social/FriendPresenceList";
import { useFriendPresence } from "@/components/social/useFriendPresence";
import { filterFriendsBySearch } from "@/lib/friendPresence";
import { fetchSocialSnapshot, socialErrorMessage, type SocialFriend } from "@/lib/socialApi";
import { sendTrainingDuoInvitation } from "@/lib/trainingDuoInvitationsApi";
import { duoErrorMessage } from "@/components/training/useTrainingDuoSync";

export function TrainingDuoInvitationDialog({ session, sessionId, notice, onClose }: {
  session: Session; sessionId: string; notice?: string; onClose: () => void;
}) {
  const [friends, setFriends] = useState<SocialFriend[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, "sending" | "sent" | "already-invited">>({});
  const pending = useRef(new Set<string>());
  const onlineIds = useFriendPresence(session);
  useEffect(() => {
    let alive = true;
    void fetchSocialSnapshot(session).then((snapshot) => { if (alive) setFriends(snapshot.friends); })
      .catch((cause) => { if (alive) setError(socialErrorMessage(cause)); });
    return () => { alive = false; };
  }, [session]);
  async function invite(userId: string) {
    if (pending.current.has(userId) || statuses[userId]) return;
    pending.current.add(userId);
    setStatuses((current) => ({ ...current, [userId]: "sending" }));
    setError(null);
    try {
      const result = await sendTrainingDuoInvitation(sessionId, userId, session);
      setStatuses((current) => ({ ...current, [userId]: result.status === "already_invited" ? "already-invited" : "sent" }));
    } catch (cause) {
      setStatuses((current) => { const next = { ...current }; delete next[userId]; return next; });
      setError(duoErrorMessage(cause));
    } finally { pending.current.delete(userId); }
  }
  const visible = friends ? filterFriendsBySearch(friends, query) : [];
  return <AccessibleDialog title="Inviter un ami" width="medium" onClose={onClose}
    footer={<button className={appSecondaryActionClass} onClick={onClose} type="button">Fermer</button>}>
    <div className="flex min-h-0 flex-col p-4 sm:p-6">
      {notice ? <p className="coinche-notice mb-3 shrink-0" data-tone="warning" role="alert">{notice}</p> : null}
      {error ? <p className="mb-3 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}
      {!friends && !error ? <p role="status">Chargement des amis…</p> : null}
      {friends ? <>
        <label className="mb-2 text-sm font-bold" htmlFor="duo-invite-search">Rechercher un ami</label>
        <input id="duo-invite-search" className={`${appInputClass} mb-3`} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
        {visible.length ? <div className="friend-presence-scroll friend-presence-scroll--dialog">
          <FriendPresenceList friends={visible} onlineIds={onlineIds} action={(friend) => {
            const status = statuses[friend.userId];
            return status === "sent" || status === "already-invited"
              ? <span className="text-xs font-bold text-[var(--success)]">{status === "sent" ? "Invitation envoyée" : "Déjà invité"}</span>
              : <button className={`${appPrimaryActionClass} friend-presence-button`} type="button" disabled={status === "sending"}
                onClick={() => void invite(friend.userId)}>{status === "sending" ? "Envoi…" : "Inviter"}</button>;
          }} />
        </div> : <p className="text-sm">{friends.length ? "Aucun ami correspondant." : "Tu n’as pas encore d’amis ajoutés."}</p>}
      </> : null}
    </div>
  </AccessibleDialog>;
}

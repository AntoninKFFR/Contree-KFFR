"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { FriendPresenceList } from "@/components/social/FriendPresenceList";
import { useFriendPresence } from "@/components/social/useFriendPresence";
import { filterFriendsBySearch } from "@/lib/friendPresence";
import {
  listInvitableFriends,
  sendGameInvitation,
  socialErrorMessage,
  type InvitableFriend,
} from "@/lib/socialApi";

type InvitationUiStatus = "sending" | "sent" | "already-invited";

export function GameInvitationDialog({
  notice,
  onClose,
  roomId,
  session,
}: {
  notice?: string;
  onClose: () => void;
  roomId: string;
  session: Session;
}) {
  const [friends, setFriends] = useState<InvitableFriend[]>([]);
  const [query, setQuery] = useState("");
  const onlineIds = useFriendPresence(session);
  const visibleFriends = filterFriendsBySearch(friends, query);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, InvitationUiStatus>>({});
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    listInvitableFriends(roomId, session)
      .then((items) => {
        if (!active) return;
        setFriends(items);
        setState("ready");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(socialErrorMessage(loadError));
        setState("error");
      });
    return () => { active = false; };
  }, [roomId, session]);

  async function invite(friend: InvitableFriend) {
    if (inFlight.current.has(friend.userId) || statuses[friend.userId]) return;
    inFlight.current.add(friend.userId);
    setError(null);
    setStatuses((current) => ({ ...current, [friend.userId]: "sending" }));
    try {
      const result = await sendGameInvitation(roomId, friend.userId, session);
      setStatuses((current) => ({
        ...current,
        [friend.userId]: result.status === "already_invited" ? "already-invited" : "sent",
      }));
    } catch (sendError) {
      setStatuses((current) => {
        const next = { ...current };
        delete next[friend.userId];
        return next;
      });
      setError(socialErrorMessage(sendError));
    } finally {
      inFlight.current.delete(friend.userId);
    }
  }

  return (
    <AccessibleDialog
      description="Une invitation donne accès à la table. La place reste libre jusqu’à ce que ton ami s’assoie."
      footer={<button className={appSecondaryActionClass} onClick={onClose} type="button">Fermer</button>}
      onClose={onClose}
      title="Inviter des amis"
      width="medium"
    >
      <div className="flex min-h-0 flex-col p-4 sm:p-6">
        {notice ? <p className="coinche-notice mb-3 shrink-0" data-tone="warning" role="alert">{notice}</p> : null}
        {state === "loading" ? <p className="text-sm text-[var(--text-secondary)]">Chargement des amis…</p> : null}
        {state === "error" ? <p className="text-sm text-red-200" role="alert">{error}</p> : null}
        {state === "ready" && friends.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Aucun ami ne peut être invité à cette table.</p>
        ) : null}
        {error && state === "ready" ? <p className="mb-3 text-sm text-red-200" role="alert">{error}</p> : null}
        {state === "ready" && friends.length > 0 ? (
          <>
            <label className="mb-2 block text-sm font-bold text-[var(--text-primary)]" htmlFor="invite-friend-search">Rechercher un ami</label>
            <input autoComplete="off" className="coinche-input mb-3 min-h-11 w-full border px-3 text-sm" id="invite-friend-search" onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un ami" value={query} />
            {visibleFriends.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">Aucun ami correspondant.</p> : <div className="friend-presence-scroll friend-presence-scroll--dialog" data-testid="invite-presence-scroll">
              <FriendPresenceList friends={visibleFriends} onlineIds={onlineIds} action={(friend) => {
              const status = statuses[friend.userId];
              return <>
                  {status === "sent" ? <span className="text-xs font-bold text-[var(--success)]">Invitation envoyée</span> : null}
                  {status === "already-invited" ? <span className="text-xs font-bold text-[var(--text-secondary)]">Déjà invité</span> : null}
                  {!status || status === "sending" ? (
                    <button
                      className={`${appPrimaryActionClass} friend-presence-button`}
                      disabled={status === "sending"}
                      onClick={() => void invite(friend)}
                      type="button"
                    >
                      {status === "sending" ? "Envoi…" : "Inviter"}
                    </button>
                  ) : null}
                </>;
              }} />
            </div>}
          </>
        ) : null}
      </div>
    </AccessibleDialog>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import {
  listInvitableFriends,
  sendGameInvitation,
  socialErrorMessage,
  type InvitableFriend,
} from "@/lib/socialApi";

type InvitationUiStatus = "sending" | "sent" | "already-invited";

export function GameInvitationDialog({
  onClose,
  roomId,
  session,
}: {
  onClose: () => void;
  roomId: string;
  session: Session;
}) {
  const [friends, setFriends] = useState<InvitableFriend[]>([]);
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
      <div className="min-h-48 overflow-y-auto p-4 sm:p-6">
        {state === "loading" ? <p className="text-sm text-[var(--text-secondary)]">Chargement des amis…</p> : null}
        {state === "error" ? <p className="text-sm text-red-200" role="alert">{error}</p> : null}
        {state === "ready" && friends.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Aucun ami ne peut être invité à cette table.</p>
        ) : null}
        {error && state === "ready" ? <p className="mb-3 text-sm text-red-200" role="alert">{error}</p> : null}
        {state === "ready" && friends.length > 0 ? (
          <ul className="space-y-2">
            {friends.map((friend) => {
              const status = statuses[friend.userId];
              return (
                <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3" key={friend.userId}>
                  <span className="min-w-0 truncate font-bold text-[var(--text-primary)]">{friend.username}</span>
                  {status === "sent" ? <span className="text-sm font-bold text-emerald-200">Invitation envoyée</span> : null}
                  {status === "already-invited" ? <span className="text-sm font-bold text-[var(--text-secondary)]">Déjà invité</span> : null}
                  {!status || status === "sending" ? (
                    <button
                      className={appPrimaryActionClass}
                      disabled={status === "sending"}
                      onClick={() => void invite(friend)}
                      type="button"
                    >
                      {status === "sending" ? "Envoi…" : "Inviter"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </AccessibleDialog>
  );
}

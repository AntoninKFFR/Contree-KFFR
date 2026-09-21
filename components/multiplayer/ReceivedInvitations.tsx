import { AppSurface, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import type { GameInvitationsSnapshot } from "@/lib/socialApi";

type Props = {
  currentUserId: string;
  invitations: GameInvitationsSnapshot | null;
  error: string | null;
  message: string | null;
  pendingInvitation: string | null;
  onJoin: (id: string) => void;
  onDecline: (id: string) => void;
  onRetry: () => void;
};

export function ReceivedInvitations({
  currentUserId, invitations, error, message, pendingInvitation, onJoin, onDecline, onRetry,
}: Props) {
  const received = invitations?.invitations.filter(
    (invitation) => invitation.status === "pending" && invitation.inviteeId === currentUserId,
  ) ?? [];

  return (
    <AppSurface>
      <h2 className="text-xl font-black text-[var(--text-primary)]">Invitations</h2>
      {message ? <p aria-live="polite" className="mt-3 text-sm text-[var(--text-secondary)]">{message}</p> : null}
      {error ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]" role="alert">
          <span>{error}</span>
          <button className={appSecondaryActionClass} onClick={onRetry} type="button">Réessayer</button>
        </div>
      ) : !invitations ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]" role="status">Chargement des invitations…</p>
      ) : received.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Aucune invitation en attente.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {received.map((invitation) => (
            <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-strong)] p-3" key={invitation.id}>
              <div className="min-w-0">
                <p className="truncate font-bold text-[var(--text-primary)]">{invitation.otherUsername}</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Table {invitation.roomCode}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={appPrimaryActionClass} disabled={pendingInvitation !== null} onClick={() => onJoin(invitation.id)} type="button">
                  {pendingInvitation === invitation.id ? "Vérification…" : "Rejoindre"}
                </button>
                <button className={appSecondaryActionClass} disabled={pendingInvitation !== null} onClick={() => onDecline(invitation.id)} type="button">Refuser</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppSurface>
  );
}

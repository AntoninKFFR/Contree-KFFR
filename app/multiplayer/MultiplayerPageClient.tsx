"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensureProfile } from "@/lib/profiles";
import { createMultiplayerRoom, findMultiplayerRoom } from "@/lib/multiplayerApi";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ReceivedInvitations } from "@/components/multiplayer/ReceivedInvitations";
import { declineGameInvitation, fetchGameInvitations, gameInvitationRoomPath, resolveGameInvitation, socialErrorMessage, SocialApiError, type GameInvitationsSnapshot } from "@/lib/socialApi";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { PlayerSettingsDialog } from "@/components/settings/PlayerSettingsPanel";
import type { CustomRulesetInput } from "@/engine/rulesets/custom";
import { AppEyebrow, AppPage, AppSurface, appInputClass, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";

type PageState = "loading" | "ready" | "signed-out" | "unavailable";

type Notice = {
  tone: "error" | "success";
  text: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action impossible pour le moment.";
}

export default function MultiplayerPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [roomCode, setRoomCode] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [rules, setRules] = useState<CustomRulesetInput>({ presetId: "contree-kffr" });
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [invitations, setInvitations] = useState<GameInvitationsSnapshot | null>(null);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [invitationMessage, setInvitationMessage] = useState<string | null>(null);
  const [pendingInvitation, setPendingInvitation] = useState<string | null>(null);
  const invitationSequence = useRef(0);
  const pendingInvitationRef = useRef<string | null>(null);

  const refreshInvitations = useCallback(async (activeSession: Session) => {
    const sequence = ++invitationSequence.current;
    try {
      const nextInvitations = await fetchGameInvitations(activeSession);
      if (sequence !== invitationSequence.current) return;
      setInvitations(nextInvitations);
      setInvitationsError(null);
    } catch (error) {
      if (sequence !== invitationSequence.current) return;
      setInvitationsError(socialErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setPageState("unavailable");
      return;
    }

    const client = supabase;
    let isCancelled = false;

    async function loadSession() {
      setPageState("loading");
      const { data } = await client.auth.getSession();

      if (isCancelled) return;

      const nextSession = data.session;
      invitationSequence.current += 1;
      setSession(nextSession);
      setInvitations(null);
      setInvitationsError(null);
      setInvitationMessage(null);

      if (!nextSession) {
        setPageState("signed-out");
        return;
      }

      const profileUsername = await ensureProfile(client, nextSession.user);

      if (isCancelled) return;

      setUsername(profileUsername);
      setPageState("ready");
    }

    loadSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      loadSession();
    });

    return () => {
      isCancelled = true;
      invitationSequence.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || pageState !== "ready") return;
    void refreshInvitations(session);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshInvitations(session);
    };
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [pageState, refreshInvitations, session]);

  async function handleInvitationAction(id: string, action: "join" | "decline") {
    if (!session || pendingInvitationRef.current) return;
    pendingInvitationRef.current = id;
    setPendingInvitation(id);
    setInvitationMessage(null);
    try {
      if (action === "join") {
        const resolution = await resolveGameInvitation(id, session);
        if (resolution.state === "joinable" && resolution.roomId) {
          router.push(gameInvitationRoomPath(resolution.roomId, id));
          return;
        }
        await refreshInvitations(session);
        setInvitationMessage("Cette invitation n’est plus disponible.");
      } else {
        await declineGameInvitation(id, session);
        await refreshInvitations(session);
        setInvitationMessage("Invitation refusée.");
      }
    } catch (error) {
      if (error instanceof SocialApiError && [404, 409].includes(error.status)) await refreshInvitations(session);
      setInvitationMessage(action === "join" && error instanceof SocialApiError && [404, 409].includes(error.status)
        ? "Cette invitation n’est plus disponible."
        : socialErrorMessage(error));
    } finally {
      pendingInvitationRef.current = null;
      setPendingInvitation(null);
    }
  }

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseClient();

    if (!supabase || !session) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      const result = await createMultiplayerRoom({ rules }, session);

      router.push(`/multiplayer/${result.room.id}`);
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseClient();

    if (!supabase || !session) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      const result = await findMultiplayerRoom(roomCode, session);

      router.push(`/multiplayer/${result.room.id}`);
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = pageState === "ready" && Boolean(username) && !isSubmitting;

  return (
    <AppPage>
        <AppSurface className="flex items-start justify-between gap-4">
          <div><AppEyebrow>Multijoueur</AppEyebrow><h1 className="mt-1 text-3xl font-black tracking-tight text-[#f4ead0]">Une table, quatre places</h1><p className="mt-1 text-sm text-white/50">Crée la partie ou saisis un code.</p></div>
          <button className={appSecondaryActionClass} type="button" onClick={() => setIsSettingsOpen(true)}>Préférences</button>
        </AppSurface>

        {pageState === "unavailable" ? (
          <StatusMessage>Supabase est indisponible. Vérifie .env.local.</StatusMessage>
        ) : null}

        {pageState === "signed-out" ? (
          <StatusMessage>
            Connecte-toi pour créer ou rejoindre une table.
            <Link
              className={`${appPrimaryActionClass} mt-4`}
              href="/login?next=%2Fmultiplayer"
            >
              Se connecter
            </Link>
          </StatusMessage>
        ) : null}

        {pageState === "loading" ? <StatusMessage>Chargement de la session...</StatusMessage> : null}

        {pageState === "ready" && !username ? <StatusMessage>Choisis d’abord ton pseudo dans ton profil.<Link className={`${appPrimaryActionClass} mt-4`} href="/profile">Ouvrir le profil</Link></StatusMessage> : null}

        {notice ? (
          <p
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
              notice.tone === "error"
                ? "border-red-300/25 bg-red-950/45 text-red-100"
                : "border-[color:var(--border-strong)] bg-[color:var(--accent-soft)] text-[color:var(--text-primary)]"
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        {pageState === "ready" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <AppSurface className="h-full lg:p-6">
              <div className="flex items-center justify-between gap-3"><div><AppEyebrow>Nouvelle partie</AppEyebrow><h2 className="mt-1 text-2xl font-black text-[#f4ead0]">Créer une table</h2></div><span aria-hidden="true" className="coinche-ui-kicker text-3xl opacity-60">♣</span></div>
              <form className="mt-5 flex flex-col gap-3" onSubmit={handleCreateRoom}>
                <p className="text-sm text-stone-300">Tu joues en tant que <strong>{username}</strong>.</p>

                <button className={appSecondaryActionClass} disabled={!canSubmit} type="button" onClick={() => setIsRulesOpen(true)}>Modifier les règles</button>

                <button
                  className={appPrimaryActionClass}
                  disabled={!canSubmit}
                  type="submit"
                >
                  Créer la table
                </button>
              </form>
            </AppSurface>

            <AppSurface className="h-full lg:p-6">
              <div><AppEyebrow>Invitation</AppEyebrow><h2 className="mt-1 text-xl font-black text-[#f4ead0]">Rejoindre une table</h2></div>
              <form className="mt-5 flex flex-col gap-3" onSubmit={handleJoinRoom}>

                <label className="coinche-app-field flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-white/55">
                  Code de table
                  <input
                    className={`${appInputClass} text-center font-mono text-lg uppercase tracking-[0.22em]`}
                    disabled={!canSubmit}
                    maxLength={12}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    required
                    value={roomCode}
                  />
                </label>

                <button
                  className={appSecondaryActionClass}
                  disabled={!canSubmit}
                  type="submit"
                >
                  Rejoindre la table
                </button>
              </form>
            </AppSurface>
          </div>
        ) : null}
        {pageState === "ready" && session ? (
          <ReceivedInvitations
            currentUserId={session.user.id}
            error={invitationsError}
            invitations={invitations}
            message={invitationMessage}
            onDecline={(id) => void handleInvitationAction(id, "decline")}
            onJoin={(id) => void handleInvitationAction(id, "join")}
            onRetry={() => void refreshInvitations(session)}
            pendingInvitation={pendingInvitation}
          />
        ) : null}
        {isRulesOpen ? <AccessibleDialog footer={<button className={`${appPrimaryActionClass} w-full sm:w-auto`} type="button" onClick={() => setIsRulesOpen(false)}>Valider les règles</button>} onClose={() => setIsRulesOpen(false)} stableHeight title="Règles de la table"><RulesetConfigurator value={rules} onChange={setRules} /></AccessibleDialog> : null}
        {isSettingsOpen ? <PlayerSettingsDialog context={{ mode: "multiplayer", isHost: false }} onClose={() => setIsSettingsOpen(false)} /> : null}
    </AppPage>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <AppSurface className="text-sm text-white/65">{children}</AppSurface>
  );
}

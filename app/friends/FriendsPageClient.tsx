"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { FriendsView, type FriendsPageState } from "@/components/friends/FriendsView";
import {
  acceptFriendRequest,
  cancelGameInvitation,
  cancelFriendRequest,
  declineGameInvitation,
  declineFriendRequest,
  fetchGameInvitations,
  fetchSocialSnapshot,
  gameInvitationRoomPath,
  removeFriend,
  resolveGameInvitation,
  searchSocialPlayers,
  sendFriendRequest,
  socialErrorMessage,
  SocialApiError,
  type GameInvitationsSnapshot,
  type SocialSearchResult,
  type SocialSnapshot,
} from "@/lib/socialApi";
import { getSupabaseClient } from "@/lib/supabaseClient";

export function FriendsPageClient() {
  const router = useRouter();
  const [pageState, setPageState] = useState<FriendsPageState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<SocialSnapshot | null>(null);
  const [gameInvitations, setGameInvitations] = useState<GameInvitationsSnapshot | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SocialSearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const snapshotSequence = useRef(0);
  const searchSequence = useRef(0);
  const pendingActionRef = useRef<string | null>(null);

  const refreshSnapshot = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) return;
    const sequence = ++snapshotSequence.current;
    try {
      const [nextSnapshot, nextGameInvitations] = await Promise.all([
        fetchSocialSnapshot(activeSession),
        fetchGameInvitations(activeSession),
      ]);
      if (sequence !== snapshotSequence.current) return;
      setSnapshot(nextSnapshot);
      setGameInvitations(nextGameInvitations);
      setPageError(null);
      setPageState("ready");
    } catch (error) {
      if (sequence !== snapshotSequence.current) return;
      if (error instanceof SocialApiError && error.code === "username_required") {
        setPageState("username-required");
      } else {
        setPageError(socialErrorMessage(error));
        setPageState("error");
      }
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setPageState("unavailable");
      return;
    }
    const client = supabase;
    let cancelled = false;

    async function load(nextSession: Session | null) {
      if (cancelled) return;
      snapshotSequence.current += 1;
      searchSequence.current += 1;
      setSession(nextSession);
      setSnapshot(null);
      setGameInvitations(null);
      setActionMessage(null);
      if (!nextSession) {
        setPageState("signed-out");
        return;
      }
      setPageState("loading");
      await refreshSnapshot(nextSession);
    }

    client.auth.getSession().then(({ data }) => load(data.session));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => load(nextSession));
    return () => {
      cancelled = true;
      snapshotSequence.current += 1;
      searchSequence.current += 1;
      subscription.unsubscribe();
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!session || pageState !== "ready") return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshSnapshot(session);
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
  }, [pageState, refreshSnapshot, session]);

  useEffect(() => {
    const prefix = query.trim();
    const sequence = ++searchSequence.current;
    setSearchError(null);
    if (!session || pageState !== "ready" || prefix.length < 3) {
      setSearchResults([]);
      setSearchState("idle");
      return;
    }
    setSearchState("loading");
    const timeout = window.setTimeout(async () => {
      try {
        const results = await searchSocialPlayers(prefix, session);
        if (sequence !== searchSequence.current) return;
        setSearchResults(results);
        setSearchState("ready");
      } catch (error) {
        if (sequence !== searchSequence.current) return;
        setSearchResults([]);
        setSearchError(socialErrorMessage(error));
        setSearchState("error");
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [pageState, query, session]);

  async function runMutation<T>(
    key: string,
    operation: (activeSession: Session) => Promise<T>,
    successMessage: string | ((result: T) => string),
  ) {
    if (!session || pendingActionRef.current) return;
    pendingActionRef.current = key;
    setPendingAction(key);
    setActionMessage(null);
    try {
      const result = await operation(session);
      await refreshSnapshot(session);
      setActionMessage(typeof successMessage === "function" ? successMessage(result) : successMessage);
    } catch (error) {
      if (error instanceof SocialApiError && error.status === 409) await refreshSnapshot(session);
      setActionMessage(socialErrorMessage(error));
    } finally {
      pendingActionRef.current = null;
      setPendingAction(null);
    }
  }

  async function handleJoinGameInvitation(invitationId: string) {
    if (!session || pendingActionRef.current) return;
    const key = `game-invitation:${invitationId}`;
    pendingActionRef.current = key;
    setPendingAction(key);
    setActionMessage(null);
    try {
      const resolution = await resolveGameInvitation(invitationId, session);
      if (resolution.state === "joinable" && resolution.roomId) {
        router.push(gameInvitationRoomPath(resolution.roomId, invitationId));
        return;
      }
      await refreshSnapshot(session);
      setActionMessage("Cette invitation n’est plus disponible.");
    } catch (joinError) {
      if (joinError instanceof SocialApiError && joinError.status === 409) await refreshSnapshot(session);
      setActionMessage(joinError instanceof SocialApiError && [404, 409].includes(joinError.status)
        ? "Cette invitation n’est plus disponible."
        : socialErrorMessage(joinError));
    } finally {
      pendingActionRef.current = null;
      setPendingAction(null);
    }
  }

  function handleRemove(userId: string, username: string) {
    if (!window.confirm(`Supprimer ${username} de tes amis ?`)) return;
    void runMutation(`friend:${userId}`, (token) => removeFriend(userId, token), `${username} a été retiré de tes amis.`);
  }

  function handleAnswerRequest(requestId: string) {
    const target = document.getElementById(`friend-request-${requestId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }

  return (
    <FriendsView
      actionMessage={actionMessage}
      currentUserId={session?.user.id}
      gameInvitations={gameInvitations}
      onAccept={(id) => void runMutation(`request:${id}`, (token) => acceptFriendRequest(id, token), "Demande acceptée.")}
      onAnswerRequest={handleAnswerRequest}
      onCancel={(id) => void runMutation(`request:${id}`, (token) => cancelFriendRequest(id, token), "Demande annulée.")}
      onDecline={(id) => void runMutation(`request:${id}`, (token) => declineFriendRequest(id, token), "Demande refusée.")}
      onCancelGameInvitation={(id) => void runMutation(`game-invitation:${id}`, (token) => cancelGameInvitation(id, token), "Invitation annulée.")}
      onDeclineGameInvitation={(id) => void runMutation(`game-invitation:${id}`, (token) => declineGameInvitation(id, token), "Invitation refusée.")}
      onJoinGameInvitation={(id) => void handleJoinGameInvitation(id)}
      onQueryChange={setQuery}
      onRemove={handleRemove}
      onRetry={() => {
        setPageState("loading");
        void refreshSnapshot(session);
      }}
      onSend={(userId) => void runMutation(
        `search:${userId}`,
        (token) => sendFriendRequest(userId, token),
        (result) => result.status === "request_received"
          ? "Ce joueur t’a déjà envoyé une demande."
          : result.status === "already_friends"
            ? "Ce joueur est déjà dans tes amis."
            : "Demande envoyée.",
      )}
      pageError={pageError}
      pendingAction={pendingAction}
      query={query}
      searchError={searchError}
      searchResults={searchResults}
      searchState={searchState}
      snapshot={snapshot}
      state={pageState}
    />
  );
}

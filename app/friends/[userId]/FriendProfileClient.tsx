"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { FriendProfileView, type FriendProfileState } from "@/components/friends/FriendProfileView";
import { TrainWithFriendDialog } from "@/components/friends/TrainWithFriendDialog";
import { useFriendPresence } from "@/components/social/useFriendPresence";
import { fetchFriendProfile, SocialApiError, socialErrorMessage } from "@/lib/socialApi";
import type { FriendProfile } from "@/lib/friendProfile";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { SOCIAL_CHANGED_EVENT } from "@/lib/socialEvents";
import { friendGamePath } from "@/lib/friendGameActions";
import type { BidReadingLevel } from "@/engine/training/bidReading";
export function FriendProfileClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [state, setState] = useState<FriendProfileState>("loading");
  const [training, setTraining] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sequence = useRef(0), authEpoch = useRef(0), actionLock = useRef(false);
  const onlineIds = useFriendPresence(session);
  const refresh = useCallback(async (active: Session | null) => {
    const request = ++sequence.current;
    setProfile(null); setTraining(false); setMessage(null);
    if (!active) { setState("signed-out"); return; }
    setState("loading");
    try {
      const next = await fetchFriendProfile(userId, active);
      if (request !== sequence.current) return;
      setProfile(next); setState("ready");
    } catch (error) {
      if (request !== sequence.current) return;
      setState(error instanceof SocialApiError && [400, 403, 404].includes(error.status) ? "unavailable" : "error");
    }
  }, [userId]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setState("unavailable"); return; }
    const epochRef = authEpoch, sequenceRef = sequence;
    let cancelled = false, observedAuth = false;
    const load = (next: Session | null) => {
      if (cancelled) return;
      authEpoch.current++; sequence.current++; actionLock.current = false; setPending(false);
      setSession(next); void refresh(next);
    };
    client.auth.getSession().then(({ data }) => { if (!observedAuth) load(data.session); }).catch(() => { if (!observedAuth) load(null); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => { observedAuth = true; load(next); });
    return () => { cancelled = true; epochRef.current++; sequenceRef.current++; subscription.unsubscribe(); };
  }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const reload = () => { if (document.visibilityState === "visible") void refresh(session); };
    window.addEventListener("focus", reload); window.addEventListener(SOCIAL_CHANGED_EVENT, reload);
    document.addEventListener("visibilitychange", reload);
    return () => { window.removeEventListener("focus", reload); window.removeEventListener(SOCIAL_CHANGED_EVENT, reload); document.removeEventListener("visibilitychange", reload); };
  }, [session, refresh]);
  async function play(level?: BidReadingLevel) {
    if (!session || !profile || state !== "ready" || actionLock.current) return;
    const epoch = authEpoch.current;
    actionLock.current = true; setPending(true); setMessage(null);
    try {
      const path = await friendGamePath(profile.userId, session, level);
      if (epoch === authEpoch.current) router.push(path);
    } catch (error) {
      if (epoch !== authEpoch.current) return;
      actionLock.current = false; setPending(false); setTraining(false); setMessage(socialErrorMessage(error));
    }
  }
  return <><FriendProfileView profile={profile} state={state} userId={userId} online={onlineIds.has(userId.toLowerCase())}
    pending={pending} message={message} onRetry={() => void refresh(session)} onPlay={() => void play()} onTrain={() => setTraining(true)} />
    {training && profile ? <TrainWithFriendDialog username={profile.username} pending={pending} onCreate={(level) => void play(level)} onClose={() => setTraining(false)} /> : null}</>;
}

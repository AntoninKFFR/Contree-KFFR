"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/multiplayerPresence";
import { fetchTrainingDuoView, sendTrainingDuoPresence, TrainingDuoApiError } from "@/lib/trainingDuoApi";
import { subscribeToTrainingDuoRealtime } from "@/lib/trainingDuoRealtime";
import type { TrainingDuoView } from "@/lib/trainingDuoTypes";
import { getSupabaseClient } from "@/lib/supabaseClient";

export type DuoPageState = "loading" | "ready" | "signed-out" | "missing" | "expired" | "unsupported" | "unavailable";
export const duoErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Action impossible pour le moment.";

export function newerDuoView(current: TrainingDuoView | null, next: TrainingDuoView) {
  return current?.session.id === next.session.id && current.session.stateVersion > next.session.stateVersion ? current : next;
}

export type TrainingDuoSyncServices = {
  getSupabaseClient: () => SupabaseClient | null;
  fetchView: typeof fetchTrainingDuoView;
  sendPresence: typeof sendTrainingDuoPresence;
  subscribe: typeof subscribeToTrainingDuoRealtime;
};
const servicesDefault: TrainingDuoSyncServices = {
  getSupabaseClient, fetchView: fetchTrainingDuoView, sendPresence: sendTrainingDuoPresence,
  subscribe: subscribeToTrainingDuoRealtime,
};

export function startTrainingDuoHeartbeat(sessionId: string, token: { access_token: string },
  send: typeof sendTrainingDuoPresence, accept: (view: TrainingDuoView) => void) {
  let active = true;
  let inFlight = false;
  const heartbeat = async () => {
    if (inFlight || !active) return;
    inFlight = true;
    try { const view = await send(sessionId, token); if (active) accept(view); }
    catch { /* A later heartbeat or refetch handles a temporary outage. */ }
    finally { inFlight = false; }
  };
  void heartbeat();
  const interval = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
  const visible = () => { if (document.visibilityState === "visible") void heartbeat(); };
  const resume = () => void heartbeat();
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("focus", resume);
  window.addEventListener("online", resume);
  return () => {
    active = false;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("focus", resume);
    window.removeEventListener("online", resume);
  };
}

export function useTrainingDuoSync(sessionId: string, services: TrainingDuoSyncServices = servicesDefault) {
  const [pageState, setPageState] = useState<DuoPageState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<TrainingDuoView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const authActive = useRef(false);

  useEffect(() => {
    const client = services.getSupabaseClient();
    if (!client) { setPageState("unavailable"); return; }
    let alive = true;
    const invalidateRequests = () => { generation.current++; };
    const updateAuth = (next: Session | null) => {
      if (!alive) return;
      invalidateRequests();
      authActive.current = Boolean(next);
      setSession(next);
      setView(null);
      setError(null);
      setPageState(next ? "loading" : "signed-out");
    };
    void client.auth.getSession().then(({ data }) => updateAuth(data.session)).catch(() => { if (alive) setPageState("unavailable"); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => updateAuth(next));
    return () => { alive = false; authActive.current = false; invalidateRequests(); subscription.unsubscribe(); };
  }, [services]);

  useEffect(() => {
    generation.current++;
    setView(null);
    setError(null);
    setPageState((current) => current === "signed-out" || current === "unavailable" ? current : "loading");
  }, [sessionId]);

  const acceptView = useCallback((next: TrainingDuoView) => {
    if (!authActive.current || next.session.id !== sessionId) return;
    setView((current) => newerDuoView(current, next));
    setError(null);
    setPageState("ready");
  }, [sessionId]);

  const refresh = useCallback(async () => {
    if (!session) return;
    const requestGeneration = generation.current;
    try {
      const next = await services.fetchView(sessionId, session);
      if (requestGeneration === generation.current) acceptView(next);
    } catch (cause) {
      if (requestGeneration !== generation.current) return;
      if (cause instanceof TrainingDuoApiError) {
        if (cause.code === "duo_session_expired") { setPageState("expired"); return; }
        if (cause.code === "duo_version_unsupported") { setPageState("unsupported"); return; }
        if (cause.code === "duo_session_not_found" || cause.code === "duo_not_member") { setPageState("missing"); return; }
      }
      setError(duoErrorMessage(cause));
      setPageState((current) => current === "ready" ? current : "unavailable");
    }
  }, [session, sessionId, services, acceptView]);

  useEffect(() => { if (session) void refresh(); }, [session, refresh]);
  useEffect(() => {
    const client = services.getSupabaseClient();
    if (!session || !client || !["loading", "ready"].includes(pageState)) return;
    return services.subscribe(client, sessionId, refresh);
  }, [session, sessionId, services, refresh, pageState]);
  const activeStatus = view?.session.status;
  useEffect(() => {
    if (!session || !activeStatus || !["lobby", "active"].includes(activeStatus) || pageState !== "ready") return;
    const requestGeneration = generation.current;
    return startTrainingDuoHeartbeat(sessionId, session, services.sendPresence, (next) => {
      if (requestGeneration === generation.current) acceptView(next);
    });
  }, [session, activeStatus, sessionId, pageState, services, acceptView]);

  return { pageState, session, view, error, setError, acceptView, refresh };
}

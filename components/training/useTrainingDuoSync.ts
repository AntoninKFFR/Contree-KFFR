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
export function terminalDuoPageState(error: unknown): DuoPageState | null {
  if (!(error instanceof TrainingDuoApiError)) return null;
  if (error.code === "duo_session_expired") return "expired";
  if (error.code === "duo_version_unsupported") return "unsupported";
  if (error.code === "duo_session_not_found" || error.code === "duo_not_member") return "missing";
  return null;
}

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
  send: typeof sendTrainingDuoPresence, accept: (view: TrainingDuoView) => void,
  refresh: () => Promise<void>) {
  let active = true;
  let inFlight = false;
  let refreshInFlight: Promise<void> | null = null;
  const refreshCanonical = () => {
    if (!active || refreshInFlight) return;
    refreshInFlight = refresh().catch(() => { /* A later resume or refetch can retry. */ })
      .finally(() => { refreshInFlight = null; });
  };
  const heartbeat = async () => {
    if (inFlight || !active) return;
    inFlight = true;
    try { const view = await send(sessionId, token); if (active) accept(view); }
    catch { refreshCanonical(); }
    finally { inFlight = false; }
  };
  void heartbeat();
  const interval = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
  const resume = () => { void heartbeat(); refreshCanonical(); };
  const visible = () => { if (document.visibilityState === "visible") resume(); };
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
  const latestView = useRef<TrainingDuoView | null>(null);

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
      latestView.current = null;
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
    latestView.current = null;
    setView(null);
    setError(null);
    setPageState((current) => current === "signed-out" || current === "unavailable" ? current : "loading");
  }, [sessionId]);

  const acceptView = useCallback((next: TrainingDuoView) => {
    if (!authActive.current || next.session.id !== sessionId) return;
    const accepted = newerDuoView(latestView.current, next);
    latestView.current = accepted;
    setView(accepted);
    setError(null);
    setPageState(accepted.session.status === "cancelled" && accepted.session.cancelReason === "expired" ? "expired" : "ready");
  }, [sessionId]);

  const markTerminalError = useCallback((cause: unknown) => {
    const terminal = terminalDuoPageState(cause);
    if (!terminal || !authActive.current) return false;
    generation.current++;
    setError(null);
    setPageState(terminal);
    return true;
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    const requestGeneration = generation.current;
    try {
      const next = await services.fetchView(sessionId, session);
      if (requestGeneration === generation.current) acceptView(next);
    } catch (cause) {
      if (requestGeneration !== generation.current) return;
      if (markTerminalError(cause)) return;
      setError(duoErrorMessage(cause));
      setPageState((current) => ["ready", "expired", "unsupported", "missing"].includes(current) ? current : "unavailable");
    }
  }, [session, sessionId, services, acceptView, markTerminalError]);

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
    }, refresh);
  }, [session, activeStatus, sessionId, pageState, services, acceptView, refresh]);

  return { pageState, session, view, error, setError, acceptView, refresh, markTerminalError };
}

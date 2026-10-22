import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSISTABLE_PUZZLE_AXES, type TrainingSeriesSubmission, type PersistablePuzzleAxisId } from "@/engine/training/seriesContract";
import { generatorVersion } from "@/engine/training/generator";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import { SOLO_ORIGIN, type SoloIdentity } from "../solo/api";
import type { AccountTrainingRecord } from "@/lib/training/records";

export class TrainingApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code = "network") { super(message); }
}
export function createTrainingApi(fetcher: typeof fetch = fetch) {
  return async function request<T>(identity: SoloIdentity, signal: AbortSignal, path: string, body?: unknown): Promise<T> {
    if (!identity.access_token || identity.expires_at !== undefined && identity.expires_at * 1000 <= Date.now()) throw new TrainingApiError("Session expirée. Reconnecte-toi.", 401, "expired");
    const controller = new AbortController(), abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(abort, 15000);
    try {
      const response = await fetcher(SOLO_ORIGIN + path, { signal: controller.signal, method: body === undefined ? "GET" : "POST", cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${identity.access_token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.status === 204 && response.ok) return null as T;
      const raw = await response.text();
      if (controller.signal.aborted || raw.length > 2_000_000) throw new TrainingApiError("Réponse interrompue ou trop volumineuse.");
      let wire: { data?: T; error?: string; code?: string };
      try { wire = JSON.parse(raw); } catch { throw new TrainingApiError("Réponse serveur illisible.", response.status, "invalid_response"); }
      if (!response.ok) throw new TrainingApiError(wire.error ?? "Action refusée.", response.status, wire.code ?? "http");
      if (!wire || !("data" in wire)) throw new TrainingApiError("Réponse serveur invalide.", 502, "invalid_response");
      return wire.data as T;
    } catch (error) {
      if (error instanceof TrainingApiError) throw error;
      throw new TrainingApiError("Connexion interrompue. Ton résultat local reste disponible.");
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  };
}
export function seriesSubmission(input: Pick<TrainingSeriesSubmission, "axisId" | "level" | "seed" | "answers" | "durationMs">): TrainingSeriesSubmission {
  return { ...input, axisVersion: PERSISTABLE_PUZZLE_AXES[input.axisId], generatorVersion, rulesetId: "contree-kffr", rulesetVersion: CONTREE_KFFR_RULESET.version, timed: true };
}
export async function readTrainingRecords(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<AccountTrainingRecord[]> {
  const { data, error } = await client.from("training_records").select("axis_id,level,best_score,best_duration_ms").eq("user_id", userId).abortSignal(signal);
  if (error) throw new Error("Records du compte indisponibles pour le moment.");
  return (data ?? []).filter((r) => Object.hasOwn(PERSISTABLE_PUZZLE_AXES, r.axis_id)).map((r) => {
    if (!Number.isInteger(r.level) || r.level < 1 || !Number.isFinite(r.best_score) || r.best_score < 0 || r.best_score > 10 || r.best_duration_ms !== null && (!Number.isInteger(r.best_duration_ms) || r.best_duration_ms < 0)) throw new Error("Record serveur invalide.");
    return { axisId: r.axis_id as PersistablePuzzleAxisId, level: r.level, bestScore: r.best_score, bestDurationMs: r.best_duration_ms };
  });
}

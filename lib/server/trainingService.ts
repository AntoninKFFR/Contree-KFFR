import "server-only";
import { NextResponse } from "next/server";
import { verifyTrainingSeriesSubmission, TrainingVerificationError } from "@/engine/training/seriesVerification";
import { sanitizeApiErrorText } from "@/lib/server/apiError";
import { authenticatedUserId, getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

type RpcObject = Record<string, unknown>;
type TrainingRpcResult = { series: RpcObject; record: RpcObject };
const MAX_BODY_BYTES = 64 * 1024;

export class TrainingServerError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

function object(value: unknown): RpcObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RpcObject : null;
}

export async function readTrainingJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new TrainingServerError("invalid_body", 400);
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new TrainingServerError("invalid_body", 400);
  if (!request.body) throw new TrainingServerError("invalid_body", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new TrainingServerError("invalid_body", 400);
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new TrainingServerError("invalid_body", 400); }
}

function parseRpcResult(value: unknown, verifiedScore: number): TrainingRpcResult {
  const payload = object(value);
  const series = object(payload?.series);
  const record = object(payload?.record);
  if (!series || !record || Number(series.score) !== verifiedScore) throw new TrainingServerError("server_error", 500);
  return { series, record };
}

export async function submitTrainingSeries(request: Request) {
  const userId = await authenticatedUserId(request);
  const verified = verifyTrainingSeriesSubmission(await readTrainingJson(request));
  const { data, error } = await getSupabaseAdmin().rpc("record_verified_training_series", {
    p_user_id: userId, p_axis_id: verified.axisId, p_axis_version: verified.axisVersion, p_level: verified.level,
    p_ruleset_id: verified.rulesetId, p_ruleset_version: verified.rulesetVersion,
    p_generator_version: verified.generatorVersion, p_seed: verified.seed, p_answers: verified.answers,
    p_question_count: verified.questionCount, p_score: verified.score, p_duration_ms: verified.durationMs,
    p_timed: verified.timed,
  });
  if (error) throw error;
  const { series, record } = parseRpcResult(data, verified.score);
  return {
    series: { id: series.id, axisId: series.axis_id, level: series.level, score: Number(series.score),
      questionCount: series.question_count, durationMs: series.duration_ms, timed: series.timed, createdAt: series.created_at },
    record: { axisId: record.axis_id, level: record.level, bestScore: Number(record.best_score),
      bestDurationMs: record.best_duration_ms, updatedAt: record.updated_at },
  };
}

export function trainingApiSuccess(data: unknown) {
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

export function trainingApiFailure(error: unknown) {
  const known = error instanceof TrainingVerificationError
    ? new TrainingServerError(error.code, 400)
    : error instanceof TrainingServerError
      ? error
      : error instanceof Error && error.message === "Authentication required."
        ? new TrainingServerError("authentication_required", 401)
        : new TrainingServerError("server_error", 500);
  if (known.status >= 500) {
    const details = object(error);
    console.error("[training-api] request failed", {
      code: sanitizeApiErrorText(details?.code),
      message: sanitizeApiErrorText(details?.message),
    });
  }
  return NextResponse.json({ error: known.status === 500 ? "Erreur serveur." : "Requête d’entraînement invalide.", code: known.code },
    { status: known.status, headers: { "Cache-Control": "private, no-store" } });
}

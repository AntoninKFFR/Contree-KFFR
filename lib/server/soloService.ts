import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createInitialGame } from "@/engine/game";
import { createGameSettings } from "@/engine/rulesets/resolve";
import { buildCustomRuleset } from "@/engine/rulesets/custom";
import { authenticatedUserId, getSupabaseAdmin } from "./supabaseAdmin";
import { parseServerGameState } from "./gameStateValidation";
import { advanceSoloState, exactKeys, object, parseSoloIntent, SoloError } from "./soloGame";
import { toPlayerGameView } from "@/engine/views";
import type { GameState } from "@/engine/types";
import { assertProgressionGameXpReady, ProgressionReadinessError } from "./progressionReadiness";
import type { SoloSession } from "@/lib/solo/sessionTypes";

export function requireSoloId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new SoloError("invalid_solo_id");
  }
}
type SoloServerSession = { id: string; version: number; state: GameState };

function session(value: unknown): SoloServerSession {
  if (!object(value) || typeof value.id !== "string" || !Number.isSafeInteger(value.state_version) || value.engine_version !== 1) {
    throw new Error("Invalid stored Solo session");
  }
  return { id: value.id, version: value.state_version as number, state: parseServerGameState(value.state) };
}
export async function readSoloJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json") || !request.body) throw new SoloError("invalid_solo_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 16 * 1024) throw new SoloError("invalid_solo_body");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!object(value)) throw new Error();
    return value;
  } catch { throw new SoloError("invalid_solo_body"); }
}
export async function startSoloSession(request: Request): Promise<SoloServerSession> {
  const userId = await authenticatedUserId(request);
  const body = await readSoloJson(request);
  exactKeys(body, ["rules", "startKey"]);
  requireSoloId(body.startKey);
  let rules;
  try { rules = buildCustomRuleset(body.rules); } catch { throw new SoloError("invalid_solo_rules"); }
  await assertProgressionGameXpReady();
  const state = createInitialGame(Math.random, createGameSettings({ ruleset: rules }));
  const { data, error } = await getSupabaseAdmin().rpc("create_solo_game_session", {
    p_user_id: userId, p_start_key: body.startKey, p_state: state,
  });
  if (error) throw error;
  return session(data);
}
async function ownedSession(id: string, userId: string): Promise<SoloServerSession> {
  requireSoloId(id);
  const { data, error } = await getSupabaseAdmin().from("solo_game_sessions").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new SoloError("solo_session_not_found", 404);
  return session(data);
}
export async function loadSoloSession(request: Request, id: string): Promise<SoloServerSession> {
  return ownedSession(id, await authenticatedUserId(request));
}
export async function moveSoloSession(request: Request, id: string): Promise<SoloServerSession> {
  const userId = await authenticatedUserId(request);
  const body = await readSoloJson(request);
  exactKeys(body, ["expectedVersion", "intent"]);
  if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0) throw new SoloError("invalid_solo_version");
  const intent = parseSoloIntent(body.intent);
  const current = await ownedSession(id, userId);
  if (current.version !== body.expectedVersion || current.state.phase === "game-over") return current;
  const next = advanceSoloState(current.state, intent);
  const { data, error } = await getSupabaseAdmin().rpc("commit_solo_game_session", {
    p_session_id: id, p_user_id: userId, p_expected_version: current.version, p_state: next,
  });
  if (error) throw error;
  return session(data);
}
export function soloSuccess(data: SoloServerSession) {
  return NextResponse.json({ data: { id: data.id, version: data.version, state: toPlayerGameView(data.state, 0) } satisfies SoloSession }, { headers: { "Cache-Control": "private, no-store" } });
}
export function soloFailure(error: unknown) {
  const unauthenticated = error instanceof Error && error.message === "Authentication required.";
  const status = (error instanceof SoloError || error instanceof ProgressionReadinessError) ? error.status : unauthenticated ? 401 : 500;
  const code = (error instanceof SoloError || error instanceof ProgressionReadinessError) ? error.code : unauthenticated ? "authentication_required" : "server_error";
  // Never log private state, tokens or raw DB details.
  if (status >= 500) console.error("[solo-api] request failed", { incident: randomUUID(), code });
  else if (status === 400) console.info("[solo-api] rejected", { code });
  return NextResponse.json({ error: "Impossible de traiter la partie Solo.", code },
    { status, headers: { "Cache-Control": "private, no-store" } });
}

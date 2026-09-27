import "server-only";
import { randomBytes } from "node:crypto";
import {
  BID_READING_SERIES_LENGTH, type BidReadingAnswer, type BidReadingLevel,
} from "@/engine/training/bidReading";
import type { TrainingDuoIntent, TrainingDuoView } from "@/lib/trainingDuoTypes";
import { cleanUsername, validateUsername } from "@/lib/profiles";
import { duoDatabaseError, TrainingDuoError } from "./trainingDuoError";
import { assertSupportedDuoVersions, duoSeries, gradeDuoAnswer } from "./trainingDuoExercise";
import { assertDuoCanStart } from "./trainingDuoStart";
import {
  toTrainingDuoView, type TrainingDuoAnswerRow, type TrainingDuoParticipantRow,
  type TrainingDuoSessionRow,
} from "./trainingDuoProjection";
import { getSupabaseAdmin } from "./supabaseAdmin";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_SEED = Number.MAX_SAFE_INTEGER - (BID_READING_SERIES_LENGTH - 1) * 1_000;
const SESSION_COLUMNS = "id,code,host_user_id,status,question_phase,level,axis_id,axis_version,doctrine_id,doctrine_revision,generator_version,ruleset_id,ruleset_version,series_length,current_index,state_version,created_at,updated_at,started_at,finished_at,cancel_reason";

async function displayName(userId: string, slot: 0 | 1): Promise<string> {
  const { data, error } = await getSupabaseAdmin().from("profiles").select("username").eq("id", userId).maybeSingle();
  if (error) throw error;
  const username = typeof data?.username === "string" ? data.username : "";
  return validateUsername(username) ? `Joueur ${slot + 1}` : cleanUsername(username);
}

function newCode(): string {
  return Array.from(randomBytes(10), (byte) => CODE_CHARS[byte % CODE_CHARS.length]).join("");
}

export function secureDuoSeed(): number {
  let seed: number;
  do {
    const bytes = randomBytes(7);
    seed = bytes[0] & 0x1f;
    for (let index = 1; index < bytes.length; index += 1) seed = seed * 256 + bytes[index];
  } while (seed > MAX_SEED);
  return seed;
}

type DuoSnapshot = {
  session: TrainingDuoSessionRow;
  participants: TrainingDuoParticipantRow[];
  answers: TrainingDuoAnswerRow[];
  seed: number | null;
};

async function snapshot(sessionId: string, userId: string): Promise<DuoSnapshot> {
  const db = getSupabaseAdmin();
  const { error: expiryError } = await db.rpc("training_duo_expire", {
    p_session_id: sessionId, p_actor: userId,
  });
  if (expiryError) duoDatabaseError(expiryError);
  const { data: session, error } = await db.from("training_duo_sessions")
    .select(SESSION_COLUMNS).eq("id", sessionId).maybeSingle();
  if (error) throw error;
  if (!session) throw new TrainingDuoError("duo_session_not_found");
  const row = session as TrainingDuoSessionRow;
  assertSupportedDuoVersions(row);
  const [participantsResult, answersResult, secretResult] = await Promise.all([
    db.from("training_duo_participants").select("*").eq("session_id", sessionId),
    db.from("training_duo_answers").select("*").eq("session_id", sessionId),
    row.status === "active" || row.status === "completed"
      ? db.from("training_duo_session_secrets").select("seed").eq("session_id", sessionId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (participantsResult.error) throw participantsResult.error;
  if (answersResult.error) throw answersResult.error;
  if (secretResult.error) throw secretResult.error;
  const participants = (participantsResult.data ?? []) as TrainingDuoParticipantRow[];
  if (!participants.some((participant) => participant.user_id === userId && participant.left_at === null)) {
    throw new TrainingDuoError("duo_session_not_found");
  }
  const seed = secretResult.data?.seed === undefined ? null : Number(secretResult.data.seed);
  if ((row.status === "active" || row.status === "completed") && (seed === null || !Number.isSafeInteger(seed))) {
    throw new TrainingDuoError("duo_version_unsupported");
  }
  return { session: row, participants, answers: (answersResult.data ?? []) as TrainingDuoAnswerRow[], seed };
}

function project(state: DuoSnapshot, userId: string): TrainingDuoView {
  const exercise = state.seed === null || (state.session.status !== "active" && state.session.status !== "completed")
    ? null : duoSeries(state.session, state.seed)[state.session.current_index];
  return toTrainingDuoView({ ...state, exercise, viewerUserId: userId });
}

export async function trainingDuoView(sessionId: string, userId: string): Promise<TrainingDuoView> {
  return project(await snapshot(sessionId, userId), userId);
}

export async function createTrainingDuo(level: BidReadingLevel, userId: string): Promise<TrainingDuoView> {
  const name = await displayName(userId, 0);
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await db.rpc("training_duo_create", {
      p_actor: userId, p_display_name: name, p_code: newCode(), p_level: level,
    });
    if (!error && typeof data === "string") return trainingDuoView(data, userId);
    if (error?.code !== "23505") {
      if (error) duoDatabaseError(error);
      throw new Error("Duo creation returned no session.");
    }
  }
  throw new Error("Duo code allocation failed.");
}

export async function joinTrainingDuo(code: string, userId: string): Promise<TrainingDuoView> {
  const name = await displayName(userId, 1);
  const { data, error } = await getSupabaseAdmin().rpc("training_duo_join", {
    p_actor: userId, p_display_name: name, p_code: code,
  });
  if (error) duoDatabaseError(error);
  if (typeof data !== "string") throw new TrainingDuoError("duo_session_not_found");
  return trainingDuoView(data, userId);
}

export async function executeTrainingDuoIntent(
  sessionId: string, userId: string, expectedVersion: number, intent: TrainingDuoIntent,
): Promise<TrainingDuoView> {
  const current = await snapshot(sessionId, userId);
  if (current.session.status === "cancelled" && current.session.cancel_reason === "expired") {
    throw new TrainingDuoError("duo_session_expired");
  }
  let seed: number | null = null;
  let answer: BidReadingAnswer | null = null;
  let score: 0 | 1 | null = null;
  if (intent.type === "start") {
    assertDuoCanStart(current.session, current.participants, userId);
    seed = secureDuoSeed();
    duoSeries(current.session, seed);
  }
  if (intent.type === "submit-answer") {
    answer = { selectedAssertionIds: [...intent.answer.selectedAssertionIds].sort() };
    const old = current.answers.find((candidate) => candidate.question_index === current.session.current_index
      && candidate.user_id === userId);
    if (old) {
      if (JSON.stringify([...old.answer.selectedAssertionIds].sort()) !== JSON.stringify(answer.selectedAssertionIds)) {
        throw new TrainingDuoError("duo_already_answered");
      }
    } else if (current.session.state_version !== expectedVersion) {
      throw new TrainingDuoError("duo_version_conflict");
    }
    if (current.seed === null || current.session.status !== "active"
      || current.session.question_phase !== "answering" && !old) {
      throw new TrainingDuoError("duo_wrong_status");
    }
    const exercise = duoSeries(current.session, current.seed)[current.session.current_index];
    const graded = gradeDuoAnswer(exercise, answer);
    answer = graded.answer;
    score = graded.score;
  }
  const { error } = await getSupabaseAdmin().rpc("training_duo_mutate", {
    p_session_id: sessionId, p_actor: userId, p_expected_version: expectedVersion,
    p_type: intent.type, p_ready: intent.type === "set-ready" ? intent.ready : null,
    p_seed: intent.type === "start" ? seed : null,
    p_base_seed: intent.type === "submit-answer" ? current.seed : null,
    p_question_index: intent.type === "submit-answer" ? current.session.current_index : null,
    p_answer: answer, p_score: score,
  });
  if (error) duoDatabaseError(error);
  return trainingDuoView(sessionId, userId);
}

export async function heartbeatTrainingDuo(sessionId: string, userId: string): Promise<TrainingDuoView> {
  const { data, error } = await getSupabaseAdmin().rpc("training_duo_heartbeat", {
    p_session_id: sessionId, p_actor: userId,
  });
  if (error) duoDatabaseError(error);
  if (data !== true) throw new TrainingDuoError("duo_session_not_found");
  return trainingDuoView(sessionId, userId);
}

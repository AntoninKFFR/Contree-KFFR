import type { BidReadingLevel } from "@/engine/training/bidReading";
import type { TrainingDuoIntent, TrainingDuoView } from "@/lib/trainingDuoTypes";

export type DuoToken = { access_token: string };

export class TrainingDuoApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "TrainingDuoApiError";
  }
}

async function request(url: string, token: DuoToken, init?: RequestInit): Promise<TrainingDuoView | null> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.access_token}`, ...init?.headers },
  });
  if (response.status === 204 && response.ok) return null;
  let body: { data?: TrainingDuoView; code?: string; error?: string } = {};
  try { body = await response.json() as typeof body; } catch { /* Preserve status for non-JSON responses. */ }
  if (!response.ok || !body.data) {
    throw new TrainingDuoApiError(body.error ?? "Action impossible. Réessaie.", response.status, body.code ?? "duo_unknown_error");
  }
  return body.data;
}

const base = "/api/training/duo/sessions";
function sessionUrl(sessionId: string) { return `${base}/${encodeURIComponent(sessionId)}`; }

export async function createTrainingDuoSession(level: BidReadingLevel, token: DuoToken) {
  return (await request(base, token, { method: "POST", body: JSON.stringify({ level }) }))!;
}
export async function joinTrainingDuoSession(code: string, token: DuoToken) {
  return (await request(`${base}/join`, token, { method: "POST", body: JSON.stringify({ code }) }))!;
}
export async function fetchTrainingDuoView(sessionId: string, token: DuoToken) {
  return (await request(sessionUrl(sessionId), token))!;
}
export function sendTrainingDuoIntent(sessionId: string, expectedVersion: number, intent: TrainingDuoIntent, token: DuoToken) {
  return request(sessionUrl(sessionId), token, { method: "POST", body: JSON.stringify({ expectedVersion, intent }) });
}
export async function sendTrainingDuoPresence(sessionId: string, token: DuoToken) {
  return (await request(`${sessionUrl(sessionId)}/presence`, token, { method: "POST" }))!;
}

const retryable = new Set<TrainingDuoIntent["type"]>(["set-ready", "submit-answer", "ready-next"]);

function satisfied(intent: TrainingDuoIntent, previous: TrainingDuoView, current: TrainingDuoView) {
  const viewer = current.participants.find((participant) => participant.slot === current.viewerSlot);
  if (intent.type === "set-ready") return current.session.status === "lobby" && viewer?.isReady === intent.ready;
  if (intent.type === "submit-answer") return current.session.currentIndex > previous.session.currentIndex
    || (current.session.currentIndex === previous.session.currentIndex && (viewer?.hasAnswered || current.session.questionPhase === "revealed"));
  if (intent.type === "ready-next") return current.session.currentIndex > previous.session.currentIndex
    || current.session.status === "completed" || viewer?.readyForNext === true;
  return false;
}

export async function sendTrainingDuoIntentWithRetry(
  view: TrainingDuoView, intent: TrainingDuoIntent, token: DuoToken,
): Promise<TrainingDuoView | null> {
  const sessionId = view.session.id;
  try {
    return await sendTrainingDuoIntent(sessionId, view.session.stateVersion, intent, token);
  } catch (error) {
    if (!(error instanceof TrainingDuoApiError) || error.code !== "duo_version_conflict" || !retryable.has(intent.type)) throw error;
    const latest = await fetchTrainingDuoView(sessionId, token);
    if (satisfied(intent, view, latest)) return latest;
    if (latest.session.status !== view.session.status || latest.session.currentIndex !== view.session.currentIndex
      || latest.session.questionPhase !== view.session.questionPhase) {
      throw new TrainingDuoApiError("La session a changé. Vérifie son nouvel état.", 409, "duo_version_conflict");
    }
    try {
      return await sendTrainingDuoIntent(sessionId, latest.session.stateVersion, intent, token);
    } catch (retryError) {
      if (retryError instanceof TrainingDuoApiError && retryError.code === "duo_version_conflict") {
        throw new TrainingDuoApiError("La session a changé. Réessaie.", 409, "duo_version_conflict");
      }
      throw retryError;
    }
  }
}

import "server-only";
import { PRESENCE_OFFLINE_TIMEOUT_MS } from "@/lib/multiplayerPresence";
import type { TrainingDuoParticipantRow, TrainingDuoSessionRow } from "./trainingDuoProjection";
import { TrainingDuoError } from "./trainingDuoError";

/** Fast server preflight; training_duo_mutate repeats every check under its DB lock. */
export function assertDuoCanStart(
  session: TrainingDuoSessionRow,
  participants: TrainingDuoParticipantRow[],
  actorUserId: string,
  nowMs = Date.now(),
): void {
  if (session.host_user_id !== actorUserId) throw new TrainingDuoError("duo_host_required");
  if (session.status !== "lobby") throw new TrainingDuoError("duo_wrong_status");
  const active = participants.filter((participant) => participant.left_at === null);
  if (active.length !== 2 || !active.every((participant) => participant.is_ready)) {
    throw new TrainingDuoError("duo_waiting_for_partner");
  }
  if (!active.every((participant) => participant.last_seen_at !== null
    && Number.isFinite(Date.parse(participant.last_seen_at))
    && Date.parse(participant.last_seen_at) >= nowMs - PRESENCE_OFFLINE_TIMEOUT_MS)) {
    throw new TrainingDuoError("duo_partner_offline");
  }
}

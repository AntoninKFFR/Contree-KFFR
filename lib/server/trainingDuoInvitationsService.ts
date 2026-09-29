import "server-only";
import { parseTrainingDuoInvitations, parseDuoInvitationSent, parseDuoInvitationJoined, parseDuoInvitationDeclined } from "@/lib/trainingDuoInvitationsApi";
import { duoDatabaseError, TrainingDuoError } from "./trainingDuoError";
import { duoDisplayName } from "./trainingDuoService";
import { getSupabaseAdmin } from "./supabaseAdmin";

export async function listDuoInvitations(actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc("training_duo_list_invitations", { p_actor: actor });
  if (error) duoDatabaseError(error);
  return parseTrainingDuoInvitations(data);
}
export async function sendDuoInvitation(actor: string, sessionId: string, inviteeId: string) {
  const { data, error } = await getSupabaseAdmin().rpc("training_duo_send_invitation", {
    p_actor: actor, p_session_id: sessionId, p_invitee: inviteeId,
  });
  if (error) duoDatabaseError(error);
  return parseDuoInvitationSent(data);
}
export async function resolveDuoInvitation(actor: string, invitationId: string, decision: "join" | "decline") {
  const { data, error } = await getSupabaseAdmin().rpc("training_duo_resolve_invitation", {
    p_actor: actor, p_invitation_id: invitationId, p_decision: decision,
    p_display_name: decision === "join" ? await duoDisplayName(actor, 1) : null,
  });
  if (error) duoDatabaseError(error);
  if (data?.status === "unavailable") throw new TrainingDuoError("duo_invitation_unavailable");
  return decision === "join" ? parseDuoInvitationJoined(data) : parseDuoInvitationDeclined(data);
}

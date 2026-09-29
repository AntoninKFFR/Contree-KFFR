import { NextResponse } from "next/server";
import { duoApiFailure, TrainingDuoError } from "@/lib/server/trainingDuoError";
import { enforceDuoRateLimit } from "@/lib/server/trainingDuoRateLimit";
import { readDuoJson, parseDuoSessionId } from "@/lib/server/trainingDuoValidation";
import { sendDuoInvitation } from "@/lib/server/trainingDuoInvitationsService";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = await authenticatedUserId(request);
    await enforceDuoRateLimit(request, actor, "mutation");
    const { sessionId } = await context.params;
    const body = await readDuoJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("inviteeId" in body) || typeof body.inviteeId !== "string") throw new TrainingDuoError("duo_invalid_request");
    const data = await sendDuoInvitation(actor, parseDuoSessionId(sessionId), parseDuoSessionId(body.inviteeId));
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return duoApiFailure(error, "/api/training/duo/sessions/[sessionId]/invitations"); }
}

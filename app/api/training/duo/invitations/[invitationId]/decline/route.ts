import { NextResponse } from "next/server";
import { duoApiFailure, TrainingDuoError } from "@/lib/server/trainingDuoError";
import { enforceDuoRateLimit } from "@/lib/server/trainingDuoRateLimit";
import { readDuoJson, parseDuoSessionId } from "@/lib/server/trainingDuoValidation";
import { resolveDuoInvitation } from "@/lib/server/trainingDuoInvitationsService";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

export async function POST(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  try {
    const actor = await authenticatedUserId(request);
    await enforceDuoRateLimit(request, actor, "mutation");
    const { invitationId } = await context.params;
    const body = await readDuoJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new TrainingDuoError("duo_invalid_request");
    const data = await resolveDuoInvitation(actor, parseDuoSessionId(invitationId), "decline");
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return duoApiFailure(error, "/api/training/duo/invitations/[invitationId]/decline"); }
}

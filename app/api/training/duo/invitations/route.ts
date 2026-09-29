import { NextResponse } from "next/server";
import { duoApiFailure } from "@/lib/server/trainingDuoError";
import { listDuoInvitations } from "@/lib/server/trainingDuoInvitationsService";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const actor = await authenticatedUserId(request);
    const data = await listDuoInvitations(actor);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return duoApiFailure(error, "/api/training/duo/invitations"); }
}

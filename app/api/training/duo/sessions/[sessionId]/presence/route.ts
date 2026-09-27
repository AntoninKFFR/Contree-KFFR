import { NextResponse } from "next/server";
import { duoApiFailure, TrainingDuoError } from "@/lib/server/trainingDuoError";
import { heartbeatTrainingDuo } from "@/lib/server/trainingDuoService";
import { parseDuoSessionId, readBoundedDuoText } from "@/lib/server/trainingDuoValidation";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const userId = await authenticatedUserId(request);
    if ((await readBoundedDuoText(request)).length !== 0) throw new TrainingDuoError("duo_invalid_request");
    const { sessionId } = await context.params;
    return NextResponse.json({ data: await heartbeatTrainingDuo(parseDuoSessionId(sessionId), userId) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return duoApiFailure(error, "/api/training/duo/sessions/[sessionId]/presence");
  }
}

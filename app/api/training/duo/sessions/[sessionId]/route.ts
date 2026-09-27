import { NextResponse } from "next/server";
import { duoApiFailure } from "@/lib/server/trainingDuoError";
import { executeTrainingDuoIntent, trainingDuoView } from "@/lib/server/trainingDuoService";
import { parseDuoMutation, parseDuoSessionId, readDuoJson } from "@/lib/server/trainingDuoValidation";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const userId = await authenticatedUserId(request);
    const { sessionId } = await context.params;
    return NextResponse.json({ data: await trainingDuoView(parseDuoSessionId(sessionId), userId) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return duoApiFailure(error, "/api/training/duo/sessions/[sessionId]");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const userId = await authenticatedUserId(request);
    const { sessionId } = await context.params;
    const { expectedVersion, intent } = parseDuoMutation(await readDuoJson(request));
    return NextResponse.json({ data: await executeTrainingDuoIntent(
      parseDuoSessionId(sessionId), userId, expectedVersion, intent,
    ) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return duoApiFailure(error, "/api/training/duo/sessions/[sessionId]");
  }
}

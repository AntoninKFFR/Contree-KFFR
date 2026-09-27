import { NextResponse } from "next/server";
import { duoApiFailure } from "@/lib/server/trainingDuoError";
import { enforceDuoRateLimit } from "@/lib/server/trainingDuoRateLimit";
import { joinTrainingDuo } from "@/lib/server/trainingDuoService";
import { parseJoinDuo, readDuoJson } from "@/lib/server/trainingDuoValidation";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const userId = await authenticatedUserId(request);
    await enforceDuoRateLimit(request, userId, "join");
    const { code } = parseJoinDuo(await readDuoJson(request));
    return NextResponse.json({ data: await joinTrainingDuo(code, userId) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return duoApiFailure(error, "/api/training/duo/sessions/join");
  }
}

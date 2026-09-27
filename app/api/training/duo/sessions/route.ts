import { NextResponse } from "next/server";
import { duoApiFailure } from "@/lib/server/trainingDuoError";
import { createTrainingDuo } from "@/lib/server/trainingDuoService";
import { parseCreateDuo, readDuoJson } from "@/lib/server/trainingDuoValidation";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const userId = await authenticatedUserId(request);
    const { level } = parseCreateDuo(await readDuoJson(request));
    return NextResponse.json({ data: await createTrainingDuo(level, userId) }, {
      status: 201, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return duoApiFailure(error, "/api/training/duo/sessions");
  }
}

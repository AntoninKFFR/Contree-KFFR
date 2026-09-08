import { NextResponse } from "next/server";
import { createRoom, findRoomByCode } from "@/lib/server/multiplayerService";
import { MultiplayerError } from "@/lib/server/multiplayerGame";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

function failure(error: unknown) {
  const status = error instanceof MultiplayerError ? error.status : error instanceof Error && error.message === "Authentication required." ? 401 : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur." }, { status });
}

export async function POST(request: Request) {
  try {
    const userId = await authenticatedUserId(request);
    const body = await request.json() as Record<string, unknown>;
    const data = body.type === "create"
      ? await createRoom({ userId, displayName: body.displayName, scoringMode: body.scoringMode, targetScore: body.targetScore })
      : body.type === "find"
        ? await findRoomByCode(body.code, userId)
        : (() => { throw new MultiplayerError("Requête inconnue."); })();
    return NextResponse.json({ data });
  } catch (error) {
    return failure(error);
  }
}

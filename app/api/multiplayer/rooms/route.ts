import { NextResponse } from "next/server";
import { apiFailure } from "@/lib/server/apiError";
import { createRoom, findRoomByCode } from "@/lib/server/multiplayerService";
import { MultiplayerError } from "@/lib/server/multiplayerGame";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

export async function POST(request: Request) {
  let action = "unknown";
  try {
    const userId = await authenticatedUserId(request);
    const body = await request.json() as Record<string, unknown>;
    action = typeof body.type === "string" ? body.type : "unknown";
    const data = body.type === "create"
      ? await createRoom({ userId, displayName: body.displayName, scoringMode: body.scoringMode, targetScore: body.targetScore })
      : body.type === "find"
        ? await findRoomByCode(body.code, userId)
        : (() => { throw new MultiplayerError("Requête inconnue."); })();
    return NextResponse.json({ data });
  } catch (error) {
    return apiFailure(error, { route: "/api/multiplayer/rooms", action });
  }
}

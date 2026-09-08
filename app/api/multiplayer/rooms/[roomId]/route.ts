import { NextResponse } from "next/server";
import { MultiplayerError } from "@/lib/server/multiplayerGame";
import { executeIntent, roomView } from "@/lib/server/multiplayerService";
import { parseRoomIntent } from "@/lib/server/roomIntentValidation";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

type Context = { params: Promise<{ roomId: string }> };

function failure(error: unknown) {
  const status = error instanceof MultiplayerError ? error.status : error instanceof Error && error.message === "Authentication required." ? 401 : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur." }, { status });
}

export async function GET(request: Request, context: Context) {
  try {
    const userId = await authenticatedUserId(request);
    const { roomId } = await context.params;
    return NextResponse.json({ data: await roomView(roomId, userId) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const userId = await authenticatedUserId(request);
    const { roomId } = await context.params;
    const body = await request.json() as { expectedVersion?: unknown; intent?: unknown };
    if (!Number.isInteger(body.expectedVersion) || !body.intent || typeof body.intent !== "object") {
      throw new MultiplayerError("Intention ou version invalide.");
    }
    return NextResponse.json({
      data: await executeIntent(roomId, userId, body.expectedVersion as number, parseRoomIntent(body.intent)),
    });
  } catch (error) {
    return failure(error);
  }
}

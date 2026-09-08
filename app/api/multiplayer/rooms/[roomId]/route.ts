import { NextResponse } from "next/server";
import { apiFailure } from "@/lib/server/apiError";
import { MultiplayerError } from "@/lib/server/multiplayerGame";
import { executeIntent, roomView } from "@/lib/server/multiplayerService";
import { parseRoomIntent } from "@/lib/server/roomIntentValidation";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

type Context = { params: Promise<{ roomId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const userId = await authenticatedUserId(request);
    const { roomId } = await context.params;
    return NextResponse.json({ data: await roomView(roomId, userId) });
  } catch (error) {
    return apiFailure(error, { route: "/api/multiplayer/rooms/[roomId]", action: "load-room" });
  }
}

export async function POST(request: Request, context: Context) {
  let action = "unknown";
  try {
    const userId = await authenticatedUserId(request);
    const { roomId } = await context.params;
    const body = await request.json() as { expectedVersion?: unknown; intent?: unknown };
    if (!Number.isInteger(body.expectedVersion) || !body.intent || typeof body.intent !== "object") {
      throw new MultiplayerError("Intention ou version invalide.");
    }
    const intent = parseRoomIntent(body.intent);
    action = intent.type;
    return NextResponse.json({ data: await executeIntent(roomId, userId, body.expectedVersion as number, intent) });
  } catch (error) {
    return apiFailure(error, { route: "/api/multiplayer/rooms/[roomId]", action });
  }
}

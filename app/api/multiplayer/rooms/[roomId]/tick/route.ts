import { NextResponse } from "next/server";
import { apiFailure } from "@/lib/server/apiError";
import { tickRoom } from "@/lib/server/multiplayerService";
import { authenticatedUserId } from "@/lib/server/supabaseAdmin";

type Context = { params: Promise<{ roomId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const userId = await authenticatedUserId(request);
    const { roomId } = await context.params;
    return NextResponse.json({ data: await tickRoom(roomId, userId) });
  } catch (error) {
    return apiFailure(error, {
      route: "/api/multiplayer/rooms/[roomId]/tick",
      action: "tick-room",
    });
  }
}

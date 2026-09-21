import { getInvitableFriends, parseSocialUuid, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

type Context = { params: Promise<{ roomId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const roomId = parseSocialUuid((await context.params).roomId, "Table");
    return socialApiSuccess(await getInvitableFriends(request, roomId));
  } catch (error) {
    return socialApiFailure(error, "/api/social/rooms/[roomId]/invitable-friends", "list");
  }
}

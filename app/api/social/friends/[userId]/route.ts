import { deleteFriend, parseSocialUuid, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

type Context = { params: Promise<{ userId: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    const userId = parseSocialUuid((await context.params).userId, "Ami");
    return socialApiSuccess(await deleteFriend(request, userId));
  } catch (error) {
    return socialApiFailure(error, "/api/social/friends/[userId]", "remove");
  }
}

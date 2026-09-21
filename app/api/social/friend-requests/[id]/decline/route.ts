import { mutateFriendRequest, parseSocialUuid, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const id = parseSocialUuid((await context.params).id, "Demande");
    return socialApiSuccess(await mutateFriendRequest(request, "decline", id));
  } catch (error) {
    return socialApiFailure(error, "/api/social/friend-requests/[id]/decline", "decline");
  }
}

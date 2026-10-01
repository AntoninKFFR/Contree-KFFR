import { getFriendProfile, parseSocialUuid, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";
export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const id = parseSocialUuid((await context.params).userId, "Ami");
    return socialApiSuccess(await getFriendProfile(request, id));
  } catch (error) {
    return socialApiFailure(error, "/api/social/friends/[userId]/profile", "read");
  }
}

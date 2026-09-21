import { mutateFriendRequest, parseFriendRequestBody, readSocialJson, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

export async function POST(request: Request) {
  try {
    const body = await readSocialJson(request);
    const { recipientId } = parseFriendRequestBody(body);
    return socialApiSuccess(await mutateFriendRequest(request, "send", recipientId));
  } catch (error) {
    return socialApiFailure(error, "/api/social/friend-requests", "send");
  }
}

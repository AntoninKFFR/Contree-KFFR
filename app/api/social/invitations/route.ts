import { getGameInvitations, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

export async function GET(request: Request) {
  try {
    return socialApiSuccess(await getGameInvitations(request));
  } catch (error) {
    return socialApiFailure(error, "/api/social/invitations", "list");
  }
}

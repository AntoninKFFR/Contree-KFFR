import { parseSocialUuid, resolveRoomGameInvitation, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const id = parseSocialUuid((await context.params).id, "Invitation");
    return socialApiSuccess(await resolveRoomGameInvitation(request, id));
  } catch (error) {
    return socialApiFailure(error, "/api/social/invitations/[id]/resolve", "resolve");
  }
}

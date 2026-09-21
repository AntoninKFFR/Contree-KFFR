import { mutateGameInvitation, parseSocialUuid, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const id = parseSocialUuid((await context.params).id, "Invitation");
    return socialApiSuccess(await mutateGameInvitation(request, "cancel", id));
  } catch (error) {
    return socialApiFailure(error, "/api/social/invitations/[id]/cancel", "cancel");
  }
}

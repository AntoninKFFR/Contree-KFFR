import {
  parseGameInvitationBody,
  parseSocialUuid,
  readSocialJson,
  sendRoomGameInvitation,
  socialApiFailure,
  socialApiSuccess,
} from "@/lib/server/socialService";

type Context = { params: Promise<{ roomId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const roomId = parseSocialUuid((await context.params).roomId, "Table");
    const { inviteeId } = parseGameInvitationBody(await readSocialJson(request));
    return socialApiSuccess(await sendRoomGameInvitation(request, roomId, inviteeId));
  } catch (error) {
    return socialApiFailure(error, "/api/social/rooms/[roomId]/invitations", "send");
  }
}

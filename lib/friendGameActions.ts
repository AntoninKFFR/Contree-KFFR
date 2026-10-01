import type { Session } from "@supabase/supabase-js";
import type { BidReadingLevel } from "@/engine/training/bidReading";
import { createMultiplayerRoom } from "@/lib/multiplayerApi";
import { sendGameInvitation } from "@/lib/socialApi";
import { createTrainingDuoSession } from "@/lib/trainingDuoApi";
import { sendTrainingDuoInvitation } from "@/lib/trainingDuoInvitationsApi";
// Same room/session creation and invitation fallback for both friend screens.
export async function friendGamePath(userId: string, session: Session, level?: BidReadingLevel): Promise<string> {
  if (level !== undefined) {
    const result = await createTrainingDuoSession(level, session);
    const path = `/training/duo/${result.session.id}`;
    try { await sendTrainingDuoInvitation(result.session.id, userId, session); return path; }
    catch { return `${path}?inviteFriends=1`; }
  }
  const result = await createMultiplayerRoom({ rules: { presetId: "contree-kffr" } }, session);
  const path = `/multiplayer/${result.room.id}`;
  try { await sendGameInvitation(result.room.id, userId, session); return path; }
  catch { return `${path}?inviteFriends=1`; }
}

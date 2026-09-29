import { getFriendPresence, touchFriendPresence, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

export async function GET(request: Request) {
  try {
    // A minimal list of IDs, never the exact heartbeat time.
    return socialApiSuccess((await getFriendPresence(request)).map((user_id) => ({ user_id })));
  } catch (error) {
    return socialApiFailure(error, "/api/social/presence", "list");
  }
}

export async function POST(request: Request) {
  try {
    return socialApiSuccess(await touchFriendPresence(request));
  } catch (error) {
    return socialApiFailure(error, "/api/social/presence", "touch");
  }
}

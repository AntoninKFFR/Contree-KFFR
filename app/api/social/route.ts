import { getSocialSnapshot, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

export async function GET(request: Request) {
  try {
    return socialApiSuccess(await getSocialSnapshot(request));
  } catch (error) {
    return socialApiFailure(error, "/api/social", "snapshot");
  }
}

import { parseSocialSearchPrefix, searchPlayers, socialApiFailure, socialApiSuccess } from "@/lib/server/socialService";

export async function GET(request: Request) {
  try {
    const prefix = parseSocialSearchPrefix(new URL(request.url).searchParams.get("q"));
    return socialApiSuccess(await searchPlayers(request, prefix));
  } catch (error) {
    return socialApiFailure(error, "/api/social/search", "search");
  }
}

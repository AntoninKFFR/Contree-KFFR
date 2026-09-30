import { loadSoloSession, moveSoloSession, soloFailure, soloSuccess } from "@/lib/server/soloService";

type Context = { params: Promise<{ sessionId: string }> };
export async function GET(request: Request, context: Context) {
  try { return soloSuccess(await loadSoloSession(request, (await context.params).sessionId)); }
  catch (error) { return soloFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { return soloSuccess(await moveSoloSession(request, (await context.params).sessionId)); }
  catch (error) { return soloFailure(error); }
}

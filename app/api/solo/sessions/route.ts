import { soloFailure, soloSuccess, startSoloSession } from "@/lib/server/soloService";

export async function POST(request: Request) {
  try { return soloSuccess(await startSoloSession(request)); }
  catch (error) { return soloFailure(error); }
}

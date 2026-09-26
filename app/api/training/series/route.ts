import { submitTrainingSeries, trainingApiFailure, trainingApiSuccess } from "@/lib/server/trainingService";

export async function POST(request: Request) {
  try { return trainingApiSuccess(await submitTrainingSeries(request)); }
  catch (error) { return trainingApiFailure(error); }
}

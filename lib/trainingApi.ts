import { PERSISTABLE_PUZZLE_AXES, type PersistablePuzzleAxisId, type SubmittedTrainingAnswer,
  type TrainingSeriesSubmission } from "@/engine/training/seriesContract";
import { getSupabaseClient } from "@/lib/supabaseClient";

export async function submitCompletedPuzzleSeries(input: {
  axisId: PersistablePuzzleAxisId; level: number; seed: number;
  answers: SubmittedTrainingAnswer[]; durationMs: number;
}): Promise<"saved" | "signed-out" | "failed"> {
  const client = getSupabaseClient();
  if (!client) return "signed-out";
  try {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "signed-out";
    const [{ generatorVersion }, { getRulesetPreset }] = await Promise.all([
      import("@/engine/training/generator"), import("@/engine/rulesets/presets"),
    ]);
    const ruleset = getRulesetPreset("contree-kffr");
    if (!ruleset) return "failed";
    const body: TrainingSeriesSubmission = {
      axisId: input.axisId, axisVersion: PERSISTABLE_PUZZLE_AXES[input.axisId], level: input.level,
      rulesetId: "contree-kffr", rulesetVersion: ruleset.version, generatorVersion,
      seed: input.seed, answers: input.answers, durationMs: input.durationMs, timed: true,
    };
    const response = await fetch("/api/training/series", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), cache: "no-store" });
    return response.ok ? "saved" : "failed";
  } catch { return "failed"; }
}

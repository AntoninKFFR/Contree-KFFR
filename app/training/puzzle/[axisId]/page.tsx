import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TrainingPuzzleClient } from "@/components/training/TrainingPuzzleClient";
import { TrainingChallengeClient } from "@/components/training/TrainingChallengeClient";
import { parseTrickValueLevel } from "@/components/training/progress";
import { isTrainingAxisId } from "@/engine/training/axes";
import { parseTrickValueChallengeMode } from "@/engine/training/trickValueChallenge";

export const metadata: Metadata = { title: "Valeur d’un pli | Entraînement" };

export default async function TrainingPuzzlePage({ params, searchParams }: {
  params: Promise<{ axisId: string }>;
  searchParams: Promise<{ level?: string | string[]; mode?: string | string[] }>;
}) {
  const { axisId } = await params;
  if (!isTrainingAxisId(axisId)) notFound();
  const { level: requestedLevel, mode: requestedMode } = await searchParams;
  if (requestedLevel === undefined && requestedMode === undefined) redirect("/training");
  if (requestedLevel !== undefined && requestedMode !== undefined) notFound();
  if (requestedMode !== undefined) {
    const mode = parseTrickValueChallengeMode(requestedMode);
    if (!mode) notFound();
    return <TrainingChallengeClient key={mode} mode={mode} />;
  }
  const level = parseTrickValueLevel(requestedLevel);
  if (!level) notFound();
  return <TrainingPuzzleClient key={level} level={level} />;
}

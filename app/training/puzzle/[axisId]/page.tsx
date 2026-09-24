import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PileCountClient } from "@/components/training/PileCountClient";
import { TrainingPuzzleClient } from "@/components/training/TrainingPuzzleClient";
import { TrainingChallengeClient } from "@/components/training/TrainingChallengeClient";
import { parseTrickValueLevel } from "@/components/training/progress";
import { isTrainingAxisId, trainingAxes } from "@/engine/training/axes";
import { parsePileCountMode } from "@/engine/training/pileCount";
import { parseTrickValueChallengeMode } from "@/engine/training/trickValueChallenge";

type PageProps = {
  params: Promise<{ axisId: string }>;
  searchParams: Promise<{ level?: string | string[]; mode?: string | string[] }>;
};

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { axisId } = await params;
  return { title: `${isTrainingAxisId(axisId) ? trainingAxes.resolve(axisId).label : "Exercice"} | Entraînement` };
}

export default async function TrainingPuzzlePage({ params, searchParams }: PageProps) {
  const { axisId } = await params;
  if (!isTrainingAxisId(axisId)) notFound();
  const { level: requestedLevel, mode: requestedMode } = await searchParams;
  if (axisId === "pile-count") {
    if (requestedLevel !== undefined) notFound();
    if (requestedMode === undefined) redirect("/training");
    const mode = parsePileCountMode(requestedMode);
    if (!mode) notFound();
    return <PileCountClient key={mode} mode={mode} />;
  }
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

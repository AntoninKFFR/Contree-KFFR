import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CountingPuzzleClient } from "@/components/training/CountingPuzzleClient";
import { TrainingPuzzleClient } from "@/components/training/TrainingPuzzleClient";
import { isCountingAxisId, parseCountingLevel, parseTrickValueLevel } from "@/components/training/progress";
import { isTrainingAxisId, trainingAxes } from "@/engine/training/axes";

type PageProps = {
  params: Promise<{ axisId: string }>;
  searchParams: Promise<{ level?: string | string[] }>;
};

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { axisId } = await params;
  const label = isTrainingAxisId(axisId) ? trainingAxes.resolve(axisId).label : "Exercice";
  return { title: `${label} | Entraînement` };
}

export default async function TrainingPuzzlePage({ params, searchParams }: PageProps) {
  const { axisId } = await params;
  if (!isTrainingAxisId(axisId)) notFound();
  const { level: requestedLevel } = await searchParams;
  if (requestedLevel === undefined) redirect("/training");
  if (isCountingAxisId(axisId)) {
    const level = parseCountingLevel(requestedLevel);
    if (!level) notFound();
    return <CountingPuzzleClient axisId={axisId} key={`${axisId}-${level}`} level={level} />;
  }
  const level = parseTrickValueLevel(requestedLevel);
  if (!level) notFound();
  return <TrainingPuzzleClient key={level} level={level} />;
}

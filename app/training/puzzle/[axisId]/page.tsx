import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TrainingPuzzleClient } from "@/components/training/TrainingPuzzleClient";
import { parseTrickValueLevel } from "@/components/training/progress";
import { isTrainingAxisId } from "@/engine/training/axes";

export const metadata: Metadata = { title: "Valeur d’un pli | Entraînement" };

export default async function TrainingPuzzlePage({ params, searchParams }: {
  params: Promise<{ axisId: string }>;
  searchParams: Promise<{ level?: string | string[] }>;
}) {
  const { axisId } = await params;
  if (!isTrainingAxisId(axisId)) notFound();
  const { level: requestedLevel } = await searchParams;
  if (requestedLevel === undefined) redirect("/training");
  const level = parseTrickValueLevel(requestedLevel);
  if (!level) notFound();
  return <TrainingPuzzleClient key={level} level={level} />;
}

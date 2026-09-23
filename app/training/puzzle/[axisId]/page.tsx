import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrainingPuzzleClient } from "@/components/training/TrainingPuzzleClient";
import { isTrainingAxisId } from "@/engine/training/axes";

export const metadata: Metadata = { title: "Valeur d’un pli | Entraînement" };

export default async function TrainingPuzzlePage({ params }: { params: Promise<{ axisId: string }> }) {
  const { axisId } = await params;
  if (!isTrainingAxisId(axisId)) notFound();
  return <TrainingPuzzleClient />;
}

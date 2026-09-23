import type { Metadata } from "next";
import { TrainingHubClient } from "@/components/training/TrainingHubClient";

export const metadata: Metadata = { title: "Entraînement" };

export default function TrainingPage() {
  return <TrainingHubClient />;
}

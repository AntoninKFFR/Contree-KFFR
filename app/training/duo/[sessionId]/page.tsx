import type { Metadata } from "next";
import { TrainingDuoSessionClient } from "@/components/training/TrainingDuoSessionClient";

export const metadata: Metadata = { title: "Session duo · Lire les enchères" };
export default async function TrainingDuoSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <TrainingDuoSessionClient sessionId={sessionId} />;
}

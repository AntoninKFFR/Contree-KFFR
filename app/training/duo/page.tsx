import type { Metadata } from "next";
import { TrainingDuoHomeClient } from "@/components/training/TrainingDuoHomeClient";

export const metadata: Metadata = { title: "Lire les enchères à deux" };
export default function TrainingDuoPage() { return <TrainingDuoHomeClient />; }

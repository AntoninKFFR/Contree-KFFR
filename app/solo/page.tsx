import type { Metadata } from "next";
import SoloPageClient from "./SoloPageClient";

export const metadata: Metadata = {
  title: "Solo",
};

export default function SoloPage() {
  return <SoloPageClient />;
}

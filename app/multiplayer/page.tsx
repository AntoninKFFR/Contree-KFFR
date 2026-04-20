import type { Metadata } from "next";
import MultiplayerPageClient from "./MultiplayerPageClient";

export const metadata: Metadata = {
  title: "Multijoueur",
};

export default function MultiplayerPage() {
  return <MultiplayerPageClient />;
}

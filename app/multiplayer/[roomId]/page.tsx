import type { Metadata } from "next";
import RoomPageClient from "./RoomPageClient";

export const metadata: Metadata = {
  title: "Table",
};

export default function RoomPage() {
  return <RoomPageClient />;
}

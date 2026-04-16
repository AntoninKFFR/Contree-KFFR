import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coinche V1",
  description: "Une V1 pédagogique de coinche contre trois bots.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

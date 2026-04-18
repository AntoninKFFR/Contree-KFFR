import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contrée V1",
  description: "Une V1 pédagogique de contrée contre trois bots.",
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

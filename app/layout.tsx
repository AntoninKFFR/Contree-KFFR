import type { Metadata } from "next";
import { AppDrawerNav } from "@/components/AppDrawerNav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Contrée KFFR",
    default: "Contrée KFFR",
  },
  description: "La contrée, en solo ou entre amis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="bg-[#f4f1e8] text-stone-950">
        <div className="min-h-dvh">
          <AppDrawerNav />
          {children}
        </div>
      </body>
    </html>
  );
}

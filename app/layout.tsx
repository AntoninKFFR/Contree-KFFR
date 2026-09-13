import type { Metadata } from "next";
import { AppDrawerNav } from "@/components/AppDrawerNav";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
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
        <PlayerPreferencesProvider>
          <div className="min-h-dvh">
            <AppDrawerNav />
            {children}
          </div>
        </PlayerPreferencesProvider>
      </body>
    </html>
  );
}

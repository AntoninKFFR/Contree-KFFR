import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AppTopNav } from "@/components/AppTopNav";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { MusicProvider } from "@/components/settings/MusicProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Contrée KFFR",
    default: "Contrée KFFR",
  },
  description: "La contrée, en solo ou entre amis",
};

const themeBootstrap = `(()=>{try{const raw=localStorage.getItem("coinche:player-preferences:v1");const value=raw?JSON.parse(raw):null;document.documentElement.dataset.theme=value?.visual?.theme==="light"?"light":"dark"}catch{document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="dark" lang="fr" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>
        <PlayerPreferencesProvider>
          <MusicProvider>
            <div className="min-h-dvh">
              <AppTopNav />
              {children}
            </div>
          </MusicProvider>
        </PlayerPreferencesProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}

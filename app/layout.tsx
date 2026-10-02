import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AppTopNav } from "@/components/AppTopNav";
import { PlayerPreferencesProvider } from "@/components/settings/PlayerPreferencesProvider";
import { MusicProvider } from "@/components/settings/MusicProvider";
import { SocialNotificationsProvider } from "@/components/social/SocialNotifications";
import { SocialPresenceHeartbeat } from "@/components/social/SocialPresenceHeartbeat";
import { ProgressionProvider } from "@/components/progression/ProgressionProvider";
import { MobileInstallGate } from "@/components/pwa/MobileInstallGate";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Contrée KFFR",
    default: "Contrée KFFR",
  },
  description: "La contrée, en solo ou entre amis",
  appleWebApp: { capable: true, title: "KFFR", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071c17",
};

const themeBootstrap = `(()=>{try{const raw=localStorage.getItem("coinche:player-preferences:v1");const value=raw?JSON.parse(raw):null;document.documentElement.dataset.theme=value?.visual?.theme==="light"?"light":"dark"}catch{document.documentElement.dataset.theme="dark"}})()`;
const isVercelDeployment = process.env.VERCEL === "1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="dark" lang="fr" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>
        <MobileInstallGate>
        <PlayerPreferencesProvider>
          <MusicProvider>
            <SocialNotificationsProvider>
              <ProgressionProvider>
                <SocialPresenceHeartbeat />
                <div className="coinche-viewport-dynamic">
                  <AppTopNav />
                  {children}
                </div>
              </ProgressionProvider>
            </SocialNotificationsProvider>
          </MusicProvider>
        </PlayerPreferencesProvider>
        {isVercelDeployment ? <SpeedInsights /> : null}
        {isVercelDeployment ? <Analytics /> : null}
        </MobileInstallGate>
      </body>
    </html>
  );
}

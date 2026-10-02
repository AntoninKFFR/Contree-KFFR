import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KFFR Contrée",
    short_name: "KFFR",
    description: "La contrée, en solo ou entre amis, dans l’application KFFR.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#06120d",
    theme_color: "#071c17",
    lang: "fr",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

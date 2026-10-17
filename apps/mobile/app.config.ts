import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "KFFR Contrée",
  slug: "kffr-contree",
  version: "0.1.0",
  scheme: "kffrcontree",
  orientation: "default",
  userInterfaceStyle: "dark",
  platforms: ["ios"],
  ios: { supportsTablet: false },
  plugins: ["expo-router"],
  experiments: { typedRoutes: true },
};

export default config;

import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "KFFR Contrée",
  slug: "kffr-contree",
  version: "0.1.0",
  scheme: "kffrcontree",
  orientation: "landscape",
  userInterfaceStyle: "dark",
  platforms: ["ios"],
  ios: {
    // Development identifier only; not registered with Apple or linked to EAS yet.
    bundleIdentifier: "com.antoninkffr.kffrcontree.dev",
    supportsTablet: false,
    // Native game compatibility mode, not an unconditional iOS 27 resize opt-out.
    requireFullScreen: true,
    infoPlist: {
      UISupportedInterfaceOrientations: ["UIInterfaceOrientationLandscapeLeft", "UIInterfaceOrientationLandscapeRight"],
      "UISupportedInterfaceOrientations~ipad": ["UIInterfaceOrientationLandscapeLeft", "UIInterfaceOrientationLandscapeRight"],
    },
  },
  plugins: [
    "expo-router",
    ["expo-screen-orientation", { initialOrientation: "LANDSCAPE" }],
    ["expo-dev-client", { launchMode: "most-recent" }],
    // SDK 57 requires this opt-in for apps built with Xcode / iOS SDK 27.
    ["expo-build-properties", { ios: { enableSceneSupport: true } }],
  ],
  experiments: { typedRoutes: true },
};

export default config;

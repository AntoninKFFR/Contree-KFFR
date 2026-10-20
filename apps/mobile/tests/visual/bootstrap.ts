import { installExpoGlobalPolyfill } from "expo-modules-core/src/polyfill/dangerous-internal";

// Metro's Expo entry installs this web runtime before loading app modules.
// The standalone Vite harness needs the same real SDK initialization; loading
// the app afterwards also prevents Audio's SharedObject subclass evaluating first.
installExpoGlobalPolyfill();
void import("./main");

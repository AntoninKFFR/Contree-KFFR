import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Evaluate the installed Expo/config plugins, not just the app.config source.
// Introspection neither builds/signs an app nor contacts Apple/EAS/Supabase.
const projectRoot = process.cwd();
const localRequire = createRequire(resolve(projectRoot, "package.json"));
const result = spawnSync(process.execPath, [localRequire.resolve("expo/bin/cli"), "config", "--type", "introspect", "--json"], {
  cwd: projectRoot,
  env: { ...process.env, EXPO_NO_DOTENV: "1" },
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 8 * 1024 * 1024,
});
assert.equal(result.status, 0, "Expo native introspection failed; run expo config --type introspect locally for diagnostics.");
const config = JSON.parse(result.stdout);
const plist = config._internal?.modResults?.ios?.infoPlist;
assert.ok(plist, "Expo must evaluate the native iOS Info.plist mods.");
const landscape = ["UIInterfaceOrientationLandscapeLeft", "UIInterfaceOrientationLandscapeRight"];
for (const key of ["UISupportedInterfaceOrientations", "UISupportedInterfaceOrientations~ipad"]) {
  assert.deepEqual([...plist[key]].sort(), [...landscape].sort(), key + " must allow exactly the two landscape orientations.");
}
assert.equal(plist.EXDefaultScreenOrientationMask, "UIInterfaceOrientationMaskLandscape");
assert.equal(plist.UIRequiresFullScreen, true);
assert.equal(plist.UIRequiresFullScreenIgnoredStartingWithVersion, undefined);
assert.equal(config.orientation, "landscape");
assert.equal(config.ios.supportsTablet, false);
assert.equal(config.ios.bundleIdentifier, "com.antoninkffr.kffrcontree.dev");
assert.equal(plist.UIApplicationSceneManifest?.UIApplicationSupportsMultipleScenes, false);
assert.equal(
  plist.UIApplicationSceneManifest?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication?.[0]?.UISceneDelegateClassName,
  "EXExpoAppSceneDelegate",
  "SDK 57 must opt in to the Expo scene lifecycle before building with iOS SDK 27.",
);

const eas = JSON.parse(readFileSync(resolve(projectRoot, "eas.json"), "utf8"));
const development = eas.build.development;
assert.equal(development.developmentClient, true);
assert.equal(development.distribution, "internal");
assert.equal(development.environment, "development");
assert.equal(development.ios.simulator, false);
// SDK 57's current default image uses Xcode 26; the iOS 27 game behavior needs SDK 27.
assert.equal(development.ios.image, "macos-tahoe-26.6-xcode-27.0");
assert.equal(eas.build["development-simulator"].extends, "development");
assert.equal(eas.build["development-simulator"].ios.simulator, true);
assert.equal(eas.submit, undefined);
console.log("Native iOS configuration verified: landscape left/right only, initial landscape, full-screen game preference, scene lifecycle, iPhone development profiles (Xcode 27). No binary built or signed.");

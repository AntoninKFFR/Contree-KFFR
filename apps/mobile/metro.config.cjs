/* global __dirname */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

// This repository has two independently installed apps, not npm workspaces.
// Metro must index the shared pure TS sources outside apps/mobile explicitly.
const config = getDefaultConfig(__dirname);
config.watchFolders = [...new Set([...config.watchFolders, path.resolve(__dirname, "../..")])];
config.resolver.nodeModulesPaths = [...new Set([
  ...config.resolver.nodeModulesPaths,
  path.resolve(__dirname, "node_modules"),
])];
// Validation/build artifacts are not app sources. Indexing them during repeated
// web builds and captures needlessly invalidates the live iPhone dev server.
const generated = ["../../.next", "../../test-results", "../../playwright-report", "dist", ".visual-build", "geometry-results", "geometry-report"]
  .map((folder) => path.resolve(__dirname, folder).split(path.sep).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\\\/]"));
const previousBlockList = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(previousBlockList) ? previousBlockList : previousBlockList ? [previousBlockList] : []), new RegExp(`^(?:${generated.join("|")})(?:[\\\\/]|$)`)];
module.exports = config;

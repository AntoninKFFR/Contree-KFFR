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
module.exports = config;

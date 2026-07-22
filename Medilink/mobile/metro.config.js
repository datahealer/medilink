// Monorepo Metro config (watch shared/, resolve hoisted deps) — finalized in Step 5.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);
// Merge (don't replace) Expo's default watchFolders so we keep its monorepo
// defaults AND watch the workspace root for the shared package.
config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), workspaceRoot])
);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Mixed-React monorepo: the root has react@18 (Next.js backend/frontend), mobile has
// react@19 (Expo SDK 54), and react-native is hoisted to the root. Normal resolution
// would make react-native's own `require('react')` resolve the root's react@18 while
// the app uses react@19 → two Reacts → "invalid hook call" crash. We redirect ONLY
// `react`/`react/*` to mobile's single copy; everything else (incl. legitimately
// nested transitive deps) keeps default hierarchical resolution.
const mobileReactDir = path.resolve(projectRoot, "node_modules", "react");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(mobileReactDir, "index.js") },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;

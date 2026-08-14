// Monorepo Metro config (watch shared/, resolve hoisted deps) — finalized in Step 5.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);
// Watch ONLY the workspace paths Metro needs to bundle the app: the `shared`
// package source + the hoisted root `node_modules`. Do NOT watch `workspaceRoot`
// itself — that pulled `backend/.next` and `frontend/.next` (volatile Next.js build
// output) into Metro's file watcher, which on Windows (no Watchman) registers a
// per-directory fs.watch and crashes when Next.js rotates `.next/static/development`:
//   ENOENT: no such file or directory, watch '...\backend\.next\static\development'
config.watchFolders = Array.from(
  new Set([
    ...(config.watchFolders ?? []),
    path.resolve(workspaceRoot, "shared"),
    path.resolve(workspaceRoot, "node_modules"),
  ])
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

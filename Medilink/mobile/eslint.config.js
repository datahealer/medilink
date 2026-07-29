// ESLint v9 flat config for the MediLink Expo app (SDK 54).
// Extends Expo's flat ruleset (TypeScript + React Native + Expo Router aware).
const path = require("path");
const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    // Resolve imports with the TypeScript resolver so `import/no-unresolved` matches
    // `tsc` exactly. Expo's default config resolves with `eslint-import-resolver-node`
    // only, whose extension list has no `.cjs` and which doesn't read package `exports`
    // maps — so workspace-hoisted deps like @tanstack/* (`main: *.cjs`) and some RN
    // packages fail to resolve even though TypeScript resolves them. The TS resolver
    // reads `exports`/`main`/`module`/`types` + tsconfig `paths`; the `node` entry (with
    // RN platform extensions) remains a fallback.
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: path.resolve(__dirname, "tsconfig.json"),
        },
        node: {
          extensions: [
            ".ios.js",
            ".android.js",
            ".native.js",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".d.ts",
            ".cjs",
            ".mjs",
            ".json",
          ],
        },
      },
    },
  },
  {
    ignores: ["node_modules/**", ".expo/**", "dist/**", "assets/**", "expo-env.d.ts"],
  },
  {
    // Node-context config files (CommonJS: __dirname / require / module / process).
    files: ["*.config.js", "metro.config.js", "babel.config.js", "eslint.config.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        module: "writable",
        require: "readonly",
        process: "readonly",
      },
    },
  },
];

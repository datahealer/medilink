// ESLint v9 flat config for the MediLink Expo app (SDK 54).
// Extends Expo's flat ruleset (TypeScript + React Native + Expo Router aware).
const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
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

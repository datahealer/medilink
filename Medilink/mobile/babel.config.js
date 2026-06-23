module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          // Metro doesn't read tsconfig `paths` — mirror them here so `@/*` and the
          // shared package resolve to TS source at runtime (kept in sync with tsconfig.json).
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
          alias: {
            "^@medilink/shared/mobile$": "../shared/src/mobile.ts",
            "^@medilink/shared$": "../shared/src/index.ts",
            "@": "./src",
          },
        },
      ],
      // Reanimated 4 (SDK 54) moved its Babel plugin to react-native-worklets.
      // It MUST be listed last (Expo Router depends on reanimated/worklets).
      "react-native-worklets/plugin",
    ],
  };
};

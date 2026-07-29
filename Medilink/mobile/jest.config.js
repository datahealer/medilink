/**
 * Jest configuration — MediLink mobile (Expo SDK 54 / RN 0.81 / React 19).
 *
 * Preset: `jest-expo` handles the RN/Expo transform pipeline (Flow types in
 * react-native source, Expo winter runtime, asset stubs) so tests run against the
 * same Babel config as the app.
 *
 * SCOPE POLICY — deliberately narrow. This suite exists to protect logic where a
 * silent regression would cause real harm: money math, refund tiers, clinical
 * status mapping, notification routing, validation, and the HAMS queue contract
 * boundary. It is not here to chase a coverage number, so `collectCoverageFrom`
 * targets only the modules under test rather than the whole app.
 */
module.exports = {
  preset: "jest-expo",

  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],

  // Metro does not read tsconfig paths, and neither does Jest — mirror the
  // aliases declared in tsconfig.json + babel.config.js (kept in sync by hand).
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@medilink/shared/mobile$": "<rootDir>/../shared/src/mobile.ts",
    "^@medilink/shared$": "<rootDir>/../shared/src/index.ts",

    // SINGLE REACT IDENTITY (monorepo hazard).
    // The repo root hoists react@18.3.1 for backend/frontend (Next.js), while mobile
    // pins react@19.1.0. Without these mappings, `react-test-renderer` loads mobile's
    // React 19 but transitive deps that `require("react")` — zustand via
    // use-sync-external-store, @tanstack/react-query — resolve the root's React 18.
    // Two React copies means two hook dispatchers, and every render fails with
    // "Cannot read properties of null (reading 'useRef')".
    //
    // This is the Jest-resolver counterpart of the react/jsx-runtime pinning that
    // tsconfig.typecheck.json already applies for TYPES (see CLAUDE.md → module
    // resolution). Keep all three in sync.
    "^react$": "<rootDir>/node_modules/react",
    "^react/(.*)$": "<rootDir>/node_modules/react/$1",
    "^react-is$": "<rootDir>/node_modules/react-is",
  },

  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],

  // `node_modules` is transform-ignored by default; the preset's pattern already
  // whitelists react-native/expo packages that ship untranspiled source.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@tanstack/.*))",
  ],

  clearMocks: true,
  restoreMocks: true,

  // Scoped to the modules this suite is meant to protect, so the number is a
  // regression signal rather than a vanity metric. Presentation-only helpers
  // (localizedName, specialties, mime, text) and the i18n-bound label formatters are
  // intentionally excluded — they are verified by eye during manual QA, and testing
  // them would mean asserting on translated strings.
  //
  // NOTE: `shared/src/config/payments.ts` (round3 / feeForType / consultationTotal)
  // IS covered by src/utils/__tests__/payments.test.ts but cannot appear here —
  // it lives outside `rootDir`, so Jest excludes it from the report.
  collectCoverageFrom: [
    "src/data/queueMapping.ts",
    "src/hooks/queries/queuePolling.ts",
    "src/utils/appointments.ts",
    "src/utils/notifications.ts",
    "src/utils/payments.ts",
    "src/utils/validation.ts",
    "src/utils/format.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text", "text-summary", "lcov"],

  // Floors, not targets — they exist so deleting a test fails the build. The queue
  // contract modules are held at 100% because they are the MediLink↔HAMS seam.
  coverageThreshold: {
    global: { statements: 55, branches: 55, functions: 55, lines: 55 },
    "src/data/queueMapping.ts": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    "src/hooks/queries/queuePolling.ts": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};

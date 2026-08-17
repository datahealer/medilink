// ESLint v9 flat config — @medilink/shared (isomorphic API client + domain logic).
//
// Same scope policy and rationale as backend/eslint.config.mjs. This package had no lint
// script at all, so the root `npm run lint` skipped it via `--if-present` and it went
// unchecked — which matters more here than the name suggests: `utils/appointmentLifecycle.ts`,
// `utils/normalize.ts` and `config/payments.ts` hold real domain logic consumed identically
// by backend, web and mobile, so a defect here reaches all three.
//
// ISOMORPHIC, so no environment globals are assumed beyond ES2024. Anything reaching for
// `window` or `process` in this package is a portability bug — mobile has no `window` and
// `shared/src/mobile.ts` exists precisely to keep the web-only helpers out of the RN bundle.
// Leaving browser/node globals undeclared would normally surface that, but `no-undef` is off
// for TypeScript (see the backend config for why), so `tsc` remains the authority.
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      // CLI-generated from the live database (`npm run db:types`) — never hand-edited, and
      // it is a single enormous type literal that no lint rule has useful advice about.
      "src/types/supabase.ts",
      "**/*.d.ts",
    ],
  },

  js.configs.recommended,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: { ...globals.es2024 },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      "no-undef": "off",

      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      "@typescript-eslint/no-explicit-any": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "smart"],
    },
  },
];

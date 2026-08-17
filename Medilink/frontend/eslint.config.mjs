// ESLint v9 flat config — MediLink patient web (Next.js 15 App Router, React 18).
//
// Companion to backend/eslint.config.mjs; see that file's header for why this project moved
// off `next lint` (deprecated in Next 15, removed in Next 16, and with no config present it
// drops into an interactive prompt and exits 1 — which is why `npm run lint` failed at the
// repo root and this workspace was effectively unlinted).
//
// The difference from the backend config is React: this package renders, so the hooks rules
// matter here. `react-hooks/exhaustive-deps` in particular catches a real class of bug in
// this codebase — several screens hold data in effects keyed on query state.
//
// Same scope policy: BUGS, NOT STYLE. No formatting rules, no Prettier, and type-aware
// linting stays off because `npm run typecheck` already covers it and would triple lint time.
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "next-env.d.ts",
      "**/*.d.ts",
      "public/**",
    ],
  },

  js.configs.recommended,

  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mjs"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      // Browser AND node: this is an App Router codebase, so the same package contains
      // client components (window, document, localStorage) and server components (process).
      globals: { ...globals.browser, ...globals.node, ...globals.es2024 },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // Hooks correctness — the rules that catch real bugs rather than style.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // See the backend config: TypeScript resolves identifiers far better than the core
      // rule, which false-positives on types, JSX and lib globals.
      "no-undef": "off",

      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      "@typescript-eslint/no-explicit-any": "warn",

      // Intentional in a few places (Supabase cookie writes in Server Components).
      "no-empty": ["error", { allowEmptyCatch: true }],

      eqeqeq: ["error", "smart"],
    },
  },

  {
    // CommonJS build-config files at the package root run in Node, not the browser or ESM.
    files: ["*.config.js", "*.config.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
];

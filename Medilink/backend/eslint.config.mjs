// ESLint v9 flat config — MediLink backend (Next.js 15, API-only).
//
// ── WHY THIS FILE EXISTS ──
//
// `backend` and `frontend` had no ESLint configuration at all. Their `lint` script was
// `next lint`, which — with no config present — drops into an INTERACTIVE setup prompt and
// exits 1. So `npm run lint` at the repo root failed, and two of four workspaces were
// effectively unlinted. In CI that prompt would hang or fail with no useful message.
//
// ── WHY NOT `next lint` / `eslint-config-next` ──
//
// `next lint` is deprecated in Next 15 and removed in Next 16, so configuring it would be
// building on something already scheduled for deletion. Running the ESLint CLI directly is
// where Next itself points, and it works identically in CI and locally.
//
// `eslint-config-next` is not installed, and its main value is React/JSX and Core Web
// Vitals rules for a *rendered* app. This package renders nothing — it is 43 API route
// handlers plus lib code. Pulling in a React-oriented config here would add a dependency to
// enforce rules that cannot apply.
//
// ── SCOPE: BUGS, NOT STYLE ──
//
// Deliberately narrow, matching the repo's existing posture (see the jest scope policy in
// mobile/jest.config.js). Formatting is not linted — there is no Prettier in this project
// and adding opinionated style rules now would bury real findings under hundreds of
// cosmetic ones in a codebase that never had them enforced.
//
// Type-aware linting (`projectService`) is deliberately NOT enabled: it needs a full type
// build per run, roughly triples lint time, and `npm run typecheck` already covers what it
// would catch.
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "next-env.d.ts",
      // Vendored/generated Supabase types.
      "**/*.d.ts",
    ],
  },

  js.configs.recommended,

  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mjs"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: { ...globals.node, ...globals.es2024 },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      /**
       * `no-undef` is OFF for TypeScript, which is typescript-eslint's own documented
       * guidance. TypeScript already resolves every identifier and reports unknown ones
       * with far better accuracy; leaving the core rule on just produces false positives
       * for types, DOM/Node lib globals and JSX (`React`, `RequestInit`, `window`), which
       * would drown the real findings. `npm run typecheck` is the authority here.
       */
      "no-undef": "off",

      /**
       * `catch {}` is a deliberate pattern in a few places — most notably the Supabase SSR
       * cookie writer, where `cookieStore.set` throws in a Server Component and the correct
       * response is to ignore it. Every instance carries a comment. Empty blocks of any
       * other kind stay an error.
       */
      "no-empty": ["error", { allowEmptyCatch: true }],

      // `no-unused-vars` must come from the TS plugin — the core rule reports false
      // positives on type-only constructs (interfaces, enums, overload signatures).
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      // This codebase uses `any` intentionally in a number of places, each with a comment
      // (Supabase row shapes that codegen does not model yet, Thawani's untyped payload).
      // A hard error would demand churn with no safety gain; a warning keeps it visible.
      "@typescript-eslint/no-explicit-any": "warn",

      // Real-bug rules worth being strict about on a server that handles money and PHI:
      "no-console": "off", // structured operator logging is intentional here
      eqeqeq: ["error", "smart"],
      "no-implicit-coercion": "off",
      "require-atomic-updates": "off", // noisy on legitimate async route handlers
    },
  },

  {
    // Test files: the mocking harness legitimately reaches for loose shapes.
    files: ["**/__tests__/**", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

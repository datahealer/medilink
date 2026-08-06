# EAS build profiles

Rationale for `eas.json`. This file exists because **`eas.json` cannot carry comments** —
see "Why this document exists" at the bottom.

---

## ⚠️ There are TWO `eas.json` files

| Path | Used when you run `eas` from | Env strategy |
|---|---|---|
| `Medilink/eas.json` | the **repo root** | expects **EAS environment variables** (nothing committed) |
| `Medilink/mobile/eas.json` | **`Medilink/mobile/`** ← the normal case | **hardcodes** the production env block |

EAS resolves `eas.json` from the project directory it is invoked in. Day-to-day builds run
from `mobile/`, so **`mobile/eas.json` is the file that actually takes effect**. The root
file is the one almost nobody exercises, which is exactly why an invalid key sat in it
undetected (see the history note below).

**Consequence:** any profile change — especially the Google client ID — must be applied to
**both files**, or a build run from the other directory silently ships without it.
Consolidating to one file is the real fix and is tracked separately; do not do it as a
drive-by.

---

## Profiles

### `development`
Dev-client builds (`developmentClient: true`, internal distribution, Android APK).

**No `env` block, on purpose.** A dev-client build must keep reading the developer's local
`mobile/.env` so day-to-day work is unchanged. `app.config.ts` still refuses
`APP_ENV=production` combined with a non-production `DATA_MODE`, so this cannot silently
produce a bad artefact.

Rebuild this profile whenever a **native** dependency is added or removed — a JS-only
change does not need it, but a new native module will fail at runtime with
`<ModuleName> could not be found` until the client is rebuilt.

### `preview`
Internal/tester builds. `APP_ENV=staging`, `DATA_MODE=staging`.

**`DATA_MODE` must never be `mock` here** — testers would exercise seeded fake patient data
and the whole QA pass would be worthless. The remaining `EXPO_PUBLIC_*` values (`API_URL`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`) are environment-specific and come from EAS environment
variables rather than being committed; `src/config/env.ts` throws if any is missing while
`DATA_MODE` is not `mock`.

### `production`
Store builds. `autoIncrement: true`, `APP_ENV=production`, `DATA_MODE=production`.

`APP_ENV=production` also disables the `app/dev/*` routes (see `isDev` in
`src/config/env.ts`).

In `mobile/eas.json` the Supabase URL and **anon** key are committed inline — the anon key
is public by design, in the same category as a client ID. In the root `eas.json` these come
from EAS environment variables instead.

---

## Google Sign-In environment requirement

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must be set for the `production` (and `preview`) profile
in **both** `eas.json` files, or `isGoogleConfigured` is false and **the Google button is
hidden on Android**. Set it inline in `mobile/eas.json`; supply it as an EAS environment
variable for the root file.

It is a **PUBLIC** client ID and safe to commit. The client **secret** is a different value
and belongs only in the Supabase dashboard — never in this repo or the mobile bundle.

🚫 **Do NOT add `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` yet.** App Store Guideline 4.8 requires
Sign in with Apple alongside any third-party social login on iOS, and Apple Sign-In is not
implemented. Setting it would enable Google on iOS and get the build rejected.

Full detail: [`GOOGLE_SIGN_IN_SETUP.md`](./GOOGLE_SIGN_IN_SETUP.md).

---

## Why this document exists

`eas.json` is strict JSON validated against a schema that **rejects unknown keys**,
including the `"//"` convention often used for JSON comments. Documentation was previously
embedded as `"//"` / `"//2"` properties inside the build profiles, which made the file
invalid:

```
eas.json is not valid.
- "build.production.//" is not allowed
- "build.production.//2" is not allowed
```

Two things are worth knowing about that failure:

- **EAS validates the entire file, not just the profile you asked for.** The error above
  appeared while running `--profile development`, because the offending keys were under
  `production`.
- The root `eas.json` had carried `"//"` keys since before the Google Sign-In work and was
  therefore *always* invalid — it simply never failed, because no one ran `eas` from the
  repo root.

**Never add explanatory keys to `eas.json`. Put them here instead.**

Validate a change without starting a build:

```bash
cd Medilink/mobile
npx eas-cli config --platform android --profile development
npx eas-cli config --platform android --profile production
```

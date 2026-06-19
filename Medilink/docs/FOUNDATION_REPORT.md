# MediLink — Foundation Report (Steps 5 & 6)

Application foundations for **mobile (Expo)** and **web (Next.js)**. **No product UI screens** were built — only providers, configuration, clients, and navigation/routing scaffolding. The monorepo is structured to be runnable once dependencies are installed and env vars are set.

> Scope guard honored: the only rendered components are non-product placeholders required for each app to boot (web `app/page.tsx`, mobile navigator `Placeholder`). Both are explicitly marked for replacement.

---

## 1. Dependencies added

### Web — `frontend/package.json`
| Package | Purpose |
|---|---|
| `next-themes` | Light/Dark/System theme (class strategy) |
| `tailwindcss`, `postcss`, `autoprefixer` (dev) | Styling toolchain |
| `@types/node`, `@types/react`, `@types/react-dom`, `typescript` (dev) | Types/build |
| *(already present)* `@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`, `react-dom`, `@medilink/shared` | SSR auth, Supabase, framework, shared pkg |

### Mobile — `mobile/package.json`
| Package | Purpose |
|---|---|
| `@react-navigation/native` **v6**, `@react-navigation/native-stack` **v6** | Navigation — **must stay v6** on Expo SDK 51 (v7 needs `react-native-screens@>=4`, which is SDK 52+) |
| `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler` | Navigation native deps |
| `@supabase/supabase-js` | Supabase client (bearer) |
| `react-native-url-polyfill` | URL polyfill required by supabase-js on RN |
| `expo-secure-store` | Keychain/Keystore session storage |
| `expo-notifications`, `expo-device` | Push foundation |
| `expo-localization` | Device locale detection (EN/AR) |
| `expo-constants` | Read EAS projectId for push token |
| `expo-status-bar` | Status bar styling |
| `babel-plugin-module-resolver` (dev) | Runtime `@/*` + shared aliases (Metro) |

> After pulling, run **`npx expo install`** in `mobile/` to reconcile native module versions to the installed Expo SDK before the first native build.

---

## 2. Workspace wiring
- **Shared imports made bundler-portable:** stripped `.js` specifiers from all `shared/src` relative imports (11 files) → extensionless, so the same TS source resolves under **Next (webpack/turbopack)** and **Metro** alike.
- **Web** resolves `@medilink/shared` via `tsconfig paths` + `transpilePackages: ["@medilink/shared"]` (frontend & backend `next.config.ts`).
- **Mobile** can't read tsconfig `paths` at runtime → `babel-plugin-module-resolver` mirrors them in `babel.config.js`:
  - `^@medilink/shared/mobile$` → `../shared/src/mobile.ts`
  - `^@medilink/shared$` → `../shared/src/index.ts`
  - `@` → `./src`
  Metro `watchFolders` already includes the workspace root so shared TS is transpiled.
- **Mobile entry:** `index.js` (gesture-handler side-effect import first → `registerRootComponent(App)`); `main` field points at it.

## 3. Supabase integration status
| Concern | Web | Mobile |
|---|---|---|
| Project / schema / RLS | **Same** remote project (reused) | **Same** |
| Client lib | `@supabase/ssr` | `@supabase/supabase-js` |
| Session transport | SSR **cookies** | **Bearer** token |
| Persistence | cookie store (browser + server) | **SecureStore** (chunked adapter) |
| Files | `frontend/src/lib/supabase/{client,server,middleware}.ts` + root `middleware.ts` | `mobile/src/lib/{supabase.ts,secureStore.ts}` |
| Token refresh | middleware `getUser()` on every request | `autoRefreshToken` gated by `AppState` (foreground only) |

Both paths hit identical RLS — only the credential medium differs. Secrets (service-role key, Thawani/Stripe/Gemini/etc.) remain **backend-only**; neither client package imports them.

## 4. Shared package integration status
- **Web** consumes `@medilink/shared`: `i18n` (en/ar catalogs, `translateFromMessages`), `SUPPORTED_LOCALES`, `Locale`, `Database` (Supabase client typing).
- **Mobile** consumes `@medilink/shared/mobile` (RN-safe subset — no `cn`/tailwind-merge): same i18n + `Database` typing + `api` contracts.
- Fixed a migration leftover: `shared/src/config/i18n/translate.ts` referenced an old `./messages/*` path → rewired to the flattened `./en`/`./ar` catalogs (synchronous, bundle-safe).
- Re-home data modules (`shared/src/api/*`) remain the single source of CRUD queries — both clients will pass their own typed `DB` client into them (unchanged from Step 3).

## 5. Auth flow architecture
```
                 ┌───────────────── Supabase Auth (one project, one RLS) ─────────────────┐
   WEB (cookies) │                                                                          │ MOBILE (bearer)
   ─────────────┐│                                                                          │┌─────────────
   middleware.ts ─→ updateSession() refreshes token + rewrites cookie on every request       AppState → start/stopAutoRefresh
   AuthProvider  ─→ getSession() + onAuthStateChange → React context (user/session/loading)   AuthProvider → getSession()+onAuthStateChange
   server.ts     ─→ RSC/route-handler SSR client (RLS)                                         supabase.ts → SecureStore-persisted session
   client.ts     ─→ singleton browser client (+ Google OAuth, signOut)                         getAccessToken() → Bearer for backend calls
   Protected prefixes (/account,/appointments,/records,/wallet) → redirect to /login           RootNavigator gates Auth vs App stack on session
```
- **Privileged/secret/heavy** operations (payments·Thawani, AI, PDFs, GDPR, push dispatch) → **backend** Next.js routes. Web calls same-origin; mobile calls `EXPO_PUBLIC_BACKEND_URL` with `Authorization: Bearer <token>` via `mobile/src/services/api.ts`.
- **Plain RLS CRUD** → direct Supabase from each client through `shared/src/api/*`.
- OTP/signup/2FA flows stay server-side (decision #1) — existing HAMS auth flow preserved.

## 6. Push notification architecture
```
Mobile app                         Supabase                         Backend (Next.js)
──────────                         ────────                         ─────────────────
syncPushToken()                    device_tokens (RLS own-row)      POST /api/notifications/push
  permission → Expo push token  →  upsert(user_id,token,platform)   guard: x-internal-secret = INVITE_SECRET
                                   notification_preferences (push)  read prefs.push → skip if disabled
                                                                    service role → select tokens for userId
                                                                    fan out → Expo push (exp.host) → FCM/APNs
```
- Client foundation: `mobile/src/services/push.ts` (`registerForPushNotifications`, `saveDeviceToken`, `syncPushToken`) + foreground handler. App config: `expo-notifications`/`expo-secure-store`/`expo-localization` plugins in `app.json`; EAS `projectId` slot reserved.
- Server foundation: `backend/src/app/api/notifications/push/route.ts` — secret-guarded, opt-in aware, Expo transport (swappable for direct FCM/APNs).
- Storage foundation: additive migrations `device_tokens` + `notification_preferences` (from Step 3, RLS own-row only).

---

## 7. Theme & localization (both platforms)
- **Theme:** Russian Violet / Shocking Lavender / Smooth Pastel Blue / Eye White tokens. Web = CSS vars in `globals.css` + Tailwind `colors.*` → vars + `next-themes`. Mobile = `theme/tokens.ts` (light/dark `ThemeColors`) + `ThemeProvider` (`useColorScheme`, persisted to SecureStore) + RN Navigation theme bridge.
- **Localization:** EN + AR from shared catalogs. Web `I18nProvider` sets `<html lang/dir>` (RTL) + persists to `localStorage`. Mobile `I18nProvider` uses `expo-localization` default, persists to SecureStore, toggles `I18nManager` RTL (restart-aware).

## 8. Verification — **PASSING** ✅
- `npm install` (root) — **succeeds with no peer conflicts**, no `--force` / `--legacy-peer-deps`. 1292 packages, lockfile generated.
- `npm run typecheck` (all 4 workspaces) — **exit 0**.

### Issues found & fixed during verification
| Issue | Root cause | Fix |
|---|---|---|
| `native-stack@7` ⇄ `react-native-screens@3.31.1` peer conflict | React Navigation **v7** needs screens `>=4` (Expo SDK 52+); project is SDK 51 | Pinned React Navigation **v6** (`native/native-stack ^6`); removed the v7-only `fonts` theme block |
| `supabase.ts` parse error (lines 5702–5703) | `supabase gen types` CLI **update notice leaked into the file** | Stripped the trailing notice; hardened `db:types` script (`2>/dev/null`) |
| `@/*` paths unresolved (frontend+mobile) | base `baseUrl:"."` made child `paths` resolve against repo root | Removed `baseUrl` (deprecated in TS 7 anyway); base `paths` made relative → each workspace's `paths` resolve locally |
| `window`/`document`/`fetch` not found | base `lib` was `["ES2022"]`, no DOM | Added `lib: ["ES2022","DOM","DOM.Iterable"]` to frontend/backend/mobile |
| `isStaff` type error (shared) | `Set<literal-union>.has(string)` rejected | `STAFF_ROLES` typed `Set<string>` + exported `StaffRole` |
| `device_tokens`/`notification_preferences` not typed | new additive tables not in remote-generated types | Augmented `Database` in `shared/src/types/index.ts` (drops out after `db:push` + `db:types`) |
| backend: missing modules (`groq-sdk`,`googleapis`,`bcryptjs`,`nodemailer`,`chrono-node`,…) | runtime deps weren't declared in `backend/package.json` | Added all backend runtime deps + `@types/*` at HAMS versions |
| backend: `noUncheckedIndexedAccess` errors in copied code | HAMS uses `strict` but **not** this flag | Disabled `noUncheckedIndexedAccess` for backend only (mirrors HAMS); kept ON for shared/frontend/mobile |
| backend: `enqueue_appointment` RPC arg null-types | generated RPC args are non-null strings; migrated path forwards nullable/`null` | `as never` cast on the args object — runtime payload unchanged (consistent with the file's existing `as any`) |

### To run the apps
1. `cd mobile && npx expo install` — reconcile native module versions to Expo SDK 51.
2. Set env (`.env` from `.env.example`): `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`, `EXPO_PUBLIC_BACKEND_URL`, backend secrets. *(env accessors throw fast if missing — intentional.)*
3. `npm run dev:frontend` · `npm run dev:backend` · `cd mobile && npm start`.

## 9. What is intentionally NOT built
Product UI screens (auth screens, home, appointments, records, account), design-system components, forms, and the re-home query bodies in `shared/src/api/*` (signatures fixed in Step 3; bodies authored during feature work). The navigation param lists (`mobile/src/navigation/types.ts`) and protected web route prefixes are declared so screens drop into a typed, gated shell.
```
Status: monorepo foundation complete & wired — ready for UI/feature development.
```

# MediLink — Mobile (Expo / React Native)

Patient-only healthcare app. **One shared TypeScript codebase for Android + iOS.**
This package contains **Week 1 (real auth) + Week 2 (dashboard, profile, medical history,
family)**. Week 3+ (doctors / booking / payments / records / labs / prescriptions / AI /
notifications / settings) is intentionally **not** built yet.

- **Stack:** Expo SDK 54 · React Native 0.81 · React 19 · Expo Router 6 · TypeScript
- **Server state:** TanStack Query · **API client:** reused `@medilink/shared` `api.*` (Supabase-direct + RLS) + `apiFetch` for backend REST
- **Local state:** Zustand — `authStore` (session), `patientStore` (active patient), theme / locale / onboarding (persisted in `expo-secure-store`)
- **Forms:** React Hook Form + Zod · **Responsive:** `useResponsive` (tablet ≥ 768)
- **Theme:** light + dark from design tokens · **i18n:** English + Arabic with real RTL
- **Brand:** Russian Violet `#2E1A47` · Lavender `#DFC8E7` · Pastel Blue `#C3D7EE` · Eye White `#F9F4FA`

## Screens

**Public:** `splash` → `welcome` → `onboarding` → `language` → `auth/sign-in` · `auth/sign-up`
→ `auth/otp` · `auth/forgot-password` → `auth/reset-password`.

**Authenticated (`app/(app)/`, auth-gated):** a **bottom-tab** group
`(tabs)/` — `dashboard` (Home) · `search` · `me` (Me Family) · `records` · `profile` — plus
full-screen detail pushes (no tab bar): `edit-profile` · `medical-history` · `family/add` ·
`family/[id]` · `patient-switcher`. The persistent tab bar (`BottomTabBar`, central Me submark,
RTL- and safe-area-aware) shows only on the five tab roots. See `docs/DESIGN_FIDELITY_AUDIT.md`.

Splash restores the Supabase session and routes: authenticated → Dashboard; else Welcome (new)
or Sign In (returning). The `(app)` group's layout redirects unauthenticated users to Sign In —
deep links cannot bypass it. See `docs/HAMS_MOBILE_INTEGRATION.md` and
`../docs/MOBILE_HAMS_API_AUDIT.md`.

## Project layout

```
mobile/
  app/                       # Expo Router routes
    _layout.tsx              # providers (Theme, i18n) + Stack
    index.tsx                # → redirects to /splash
    splash.tsx  welcome.tsx  onboarding.tsx  language.tsx
    auth/ _layout.tsx  sign-in  sign-up  otp  forgot-password  reset-password
  src/
    components/ui/           # Button, TextField, PasswordField, PhoneField, OtpInput,
                             # LanguageCard, ProgressDots, Logo, Screen, Checkbox,
                             # ThemeToggle, BackButton, Text
    theme/                   # tokens, typography, light, dark, ThemeProvider
    i18n/                    # en, ar, index (provider + RTL)
    stores/                  # themeStore, localeStore, onboardingStore (+ persist)
    hooks/                   # useTheme, useLocale
    utils/                   # validation (Zod), platform (shadows)
    services/                # authService (typed MOCK — no real API yet)
  assets/fonts/              # drop brand fonts here (see “Fonts” below)
```

## Prerequisites (Windows)

- Node 18+ and the repo installed: from the monorepo root run `npm install`.
- (Android) Android Studio + an emulator, **or** the **Expo Go** app on a physical phone.
- (iOS) see “Testing on iOS without a Mac”.

## Scripts

```bash
npm run start       # expo start (dev server + QR)
npm run android     # expo start --android
npm run ios         # expo start --ios   (requires macOS)
npm run web         # expo start --web   (note: react-native-web not installed yet)
npm run lint        # expo lint (ESLint)
npm run typecheck   # tsc --noEmit
```

Run them from `mobile/` (or `npm run <script> --workspace=@medilink/mobile` from the root).

---

## Android testing

### A. Android emulator (Android Studio)

1. Install **Android Studio**; via **Device Manager** create & **start** an emulator
   (e.g. Pixel 7, API 34).
2. From the repo root: `npm install`.
3. `cd mobile && npx expo start`.
4. Press **`a`** in the terminal to open the app on the running emulator.
   (First run installs **Expo Go** into the emulator automatically.)

### B. Physical Android phone (Expo Go — no Android Studio needed)

1. Install **Expo Go** from the Play Store on your phone.
2. Put the phone on the **same Wi-Fi** as your PC.
3. `cd mobile && npx expo start`.
4. Scan the **QR code** in the terminal with the Expo Go app.
   - If the QR won’t connect (corporate Wi-Fi / VPN), use a tunnel: `npx expo start --tunnel`.

---

## Testing on iOS without a Mac

The iOS **Simulator requires macOS** — it cannot run on Windows. The code is written to be
iOS-compatible from day one (SafeArea, KeyboardAvoidingView, platform-safe shadows, no
Android-only assumptions). To get a real iOS build from Windows, use **EAS cloud builds**:

```bash
npx eas login                                   # create/login to an Expo account
npx eas build:configure                         # links the project (writes projectId)
npx eas build --platform ios --profile development
```

- A **development** iOS build (see `eas.json`) requires an **Apple Developer account**
  ($99/yr) and at least one **registered test device** (EAS will guide UDID registration).
- When the build finishes, EAS gives an install link/QR for the iPhone.
- On the iPhone, then run `npx expo start --dev-client` and open the build.

### iPhone real-device checklist (when Mac/iPhone access is available)
- [ ] Apple Developer account active; device UDID registered with EAS.
- [ ] `eas build --platform ios --profile development` succeeds.
- [ ] Dev build installs on the iPhone.
- [ ] App launches → Splash → routes correctly.
- [ ] Safe-area insets correct on notch/Dynamic-Island devices.
- [ ] Keyboard avoidance works on all form screens.
- [ ] Light/Dark follow iOS system setting.
- [ ] Arabic RTL mirrors layout (after restart prompt).

---

## Fonts (wired)

The official brand fonts are **bundled and loaded**: **Agatho** (Regular/Medium/Bold,
EN headings), **Manrope** (Regular→ExtraBold, EN UI/body) and **29LT Zarid Sans**
(Arabic). Files live in `assets/fonts/`, are registered via `useFonts(BRAND_FONT_FILES)`
in `app/_layout.tsx` (render gated until loaded), and resolved per (role, weight, locale)
by `fontFamilyFor` in `src/theme/typography.ts` (`USE_BRAND_FONTS = true`). See
`docs/FONT_AUDIT.md`. Caveat: Zarid ships one weight (Arabic bold renders regular).

## Brand assets & dark mode

The official **Me submark** + **wordmark** are rasterised from the package SVGs into
`assets/brand/` and rendered via `MeMark`/`Logo` (tinted per context) — see
`docs/BRAND_ASSET_AUDIT.md`. Dark-mode colours are the exact approved tokens
(`#0F0A18` base, `#221634` cards) — see `docs/DARK_MODE_COLOR_AUDIT.md`.

## RTL note

Switching English ↔ Arabic changes layout direction. React Native only fully applies
`I18nManager.forceRTL` after an app reload, so the Language screen shows a **restart
confirmation** when direction changes. Selection is persisted (SecureStore), so the correct
direction is applied on next launch.

## Data mode (UI-first)

The app reads `EXPO_PUBLIC_DATA_MODE` (`mock` | `staging` | `production`, default `mock`).
Screens depend only on **domain models behind repository interfaces** (`src/data/`), not on
Supabase/HAMS shapes. In `mock` mode the app runs fully populated (seed: Aisha Al Harthy +
family) with **no backend** — ideal for visual fidelity work. `staging`/`production` use the
real implementations that wrap the unchanged backend transport. See `docs/DATA_LAYER.md`.

## Backend

The backend foundation below is **preserved and wrapped** by `data/real` (used when
`DATA_MODE` is staging/production). Auth and patient data map to the reused HAMS backend +
Supabase:
- Supabase-direct (RLS) via `@medilink/shared` `api.*`: sign-in, session, profile, medical
  history, family, dashboard appointments.
- Backend REST via `apiFetch` (`src/services/api.ts`): signup, send-otp, verify-otp,
  profile-photo upload.

Known BLOCKED/partial (documented, never faked): Google login (no endpoint/client IDs →
button disabled), patient password-reset completion (needs a deep-link recovery session; the
email send is real), OTP SMS delivery (backend stores the OTP; provider send not enabled).
Full detail: `../docs/MOBILE_HAMS_API_AUDIT.md`. QA: `docs/WEEK1_WEEK2_QA_CHECKLIST.md`.

## Environment variables

Public `EXPO_PUBLIC_*` only — see `.env.example`. Required: `EXPO_PUBLIC_API_URL`,
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Optional: `EXPO_PUBLIC_APP_ENV`,
the three `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` (enable the Google button when set).

> **Physical device:** `EXPO_PUBLIC_API_URL` must be a staging URL or your laptop **LAN IP**
> (e.g. `http://192.168.1.20:3000`), never `localhost`. Never place service-role keys, JWT
> secrets, DB URLs, or any client *secret* in mobile files.

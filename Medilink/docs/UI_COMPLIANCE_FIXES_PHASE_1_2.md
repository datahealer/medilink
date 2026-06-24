# MediLink Mobile — UI Compliance Fixes (Phase 1 & 2)

Implements the approved Phase 1 (global design-system) and Phase 2 (existing real-screen)
fixes from the UI compliance audit, against `MediLink_Design_Documentation.pdf` and the
extracted brand reference (`docs/.../Medilink/`). **Placeholder screens were NOT built** —
this pass only makes the 25 real screens brand-compliant.

Checks after implementation: `tsc --noEmit` ✅ · `expo lint` ✅ (0 errors) ·
`expo export --platform android` ✅ (bundles cleanly, incl. `react-native-svg`).

---

## Phase 1 — global design-system

### P1.1 — Brand icon set replaces Ionicons
- **New:** `src/components/ui/Icon.tsx` — a single-stroke, rounded 24×24 SVG icon family
  matching the PDF "Healthcare Icon Set" (p8). Covers all priority marks (Home, Search,
  Calendar, Records, Profile, Alerts, Location, Favourite, Rating, Medication, Lab, AI,
  Document, Payment, Security, Language, Upload, Share, Time, Done, Close, Filter) plus the
  UI glyphs the app actually uses (chevron w/ direction, eye/eye-off, plus, settings, moon/
  sun, radio, mail, grid, alert, info, scan, people, physio, skincare, dentist). `filled`
  supports selected states (heart/star/radio/done-circle); `resolveIconName()` maps legacy
  data icon keys (e.g. `flask-outline`) onto the brand set.
- **Dependency:** added `react-native-svg@15.12.1` via `expo install` (bundled in Expo Go).
- **Migrated (Ionicons → `Icon`):** BackButton, BottomTabBar, Chip, Checkbox, LanguageCard,
  PasswordField, ThemeToggle, MeMark; screens: dashboard, profile, search, map, settings,
  me, patient-switcher, notifications (index + messages), appearance, specialties (tiles via
  `resolveIconName`), doctors/[id] (+ reviews stars), edit-profile, medical-history,
  screen-gallery, sign-in (flask/alert only).
- **Intentionally kept on Ionicons:** `logo-google` / `logo-apple` in sign-in (third-party
  brand logos — not part of the MediLink icon set).
- **Before/after:** generic Ionicons (Medication/Lab/AI/etc. visibly off-brand) → bespoke
  single-stroke marks. Bottom-tab active state now uses colour + stroke weight (outline
  always), per the PDF, instead of an outline→filled swap.

### P1.2 — Typography tokens
- `src/theme/typography.ts`: Display **34→40 / lineHeight 40→46**, H1 **26→28 / 32→34**.
  H2/title/body/caption unchanged. Weights still resolve to concrete loaded families
  (`fontFamilyFor`); no synthesized weights (`EMIT_FONT_WEIGHT` stays off for brand fonts).

### P1.3 — Arabic support
- **New:** `src/utils/format.ts` `localizeDigits()` (ASCII → Eastern-Arabic-Indic `٠-٩`).
- Wired into `src/i18n/index.tsx`: **every `t()` result is digit-localized** in `ar`, and a
  new `num()` helper localizes raw numeric strings. Applied at raw call sites: OTP timer,
  search results count, dashboard/search/map prices·ratings·distance, profile stats,
  featured-clinic meta.
- **AR wordmark:** `MeWordmark` now swaps to `assets/brand/me-wordmark-ar.png` under RTL.
- **RTL chevrons:** `Icon name="chevron"` takes an explicit `direction` resolved from
  `isRTL` at each call site (back buttons, list rows, map). Arabic strings already use the
  official 29LT Zarid Sans (`ZaridSans.ttf`); English layouts untouched.

### P1.4 — Official angled brand CTA
- **New:** `src/components/ui/CtaButton.tsx` — the official angled tag shape (rounded left,
  full-width top, slanted right edge) drawn with `react-native-svg`, lavender fill + violet
  label per the "BRAND CTA" sheet. `mirror` flips the slant for RTL.
- **Applied (brand moments only, not a global button swap):** Welcome "Create account";
  Onboarding final-slide "Get Started". All other screen CTAs remain the standard rounded
  `Button` (which matches every screen CTA in the PDF artboards).

### P1.5 — Brand pattern + gradient-orb hero
- **New:** `src/components/ui/HeroBackground.tsx` — the connected-dot/molecule motif +
  subtle gradient orbs (`tone="onViolet" | "onSurface"`), subtle by default.
- **Applied:** Splash (behind logo), Welcome (hero card), Onboarding (full canvas, subtle),
  and the Dashboard featured-clinic hero (see P2.4). **Not** applied to ordinary content
  screens or generic empty states (per "do not decorate content screens").

### P1.6 — Shared component polish
- `TextField.tsx`: focused inputs now show the **violet active border** (2px) unless an
  error is present (PDF p6); preserves `onFocus`/`onBlur` passthrough, RTL, a11y.
- `app/(app)/_layout.tsx`: Filters upgraded from `presentation: "modal"` to a **true bottom
  sheet** — `formSheet` with `sheetAllowedDetents: [0.65, 0.95]`, grabber, 24px corners.

---

## Phase 2 — existing real-screen fixes

| # | Item | File(s) | Before → After |
|---|------|---------|----------------|
| 2.1 | OTP phone target | `app/auth/otp.tsx`, `i18n/en.ts`+`ar.ts` | "sent to **.**" when no param → falls back to `phone`, else a generic "…sent to your phone." (new `otp.subtitleGeneric`); digits localized in AR |
| 2.2 | Profile `O+` glyph | `app/(app)/(tabs)/profile.tsx` | Stat values rendered in Agatho (serif lacks a clean "+", broke "O+") → rendered in Manrope (`title`, 20px). No carousel/chevron exists in code; the "stray chevron" was the broken-glyph artifact and is resolved by the font fix |
| 2.3 | Settings dialog copy | `app/(app)/settings/index.tsx`, catalogs | "Privacy & security" dialog showed the data-export message → new `settings.privacyComingSoon` |
| 2.4 | Dashboard date + featured | `app/(app)/(tabs)/dashboard.tsx` | Next-visit truncated on one line → facility + date/time on **two lines** (no truncation); flat lavender featured block → branded `HeroBackground` violet hero |
| 2.5 | Search name/badge + padding | `app/(app)/(tabs)/search.tsx` | Name could collide with the "Available today" badge → name `flexShrink`, badge `flexShrink:0` + 1-line; added `paddingBottom` so Book/Profile clear the tab bar (also added to dashboard/profile/me) |
| 2.6 | Map | `app/(app)/search/map.tsx` | Bare grid → soft map blocks + roads, **price pins with pointer tails**, **user marker with pulse halo**; prices/ratings localized |
| 2.7 | Splash/Welcome/Onboarding | splash/welcome/onboarding + audit note | Pattern/orb treatment applied (P1.5); angled CTA applied (P1.4). Brand capitalization in **copy** is already "MediLink" everywhere; the lowercase wordmark is the official logotype **asset** (intentional) — left as-is |

---

## Files changed

**New:** `src/components/ui/Icon.tsx`, `CtaButton.tsx`, `HeroBackground.tsx`,
`src/utils/format.ts`, this doc.

**Modified (design system):** `src/theme/typography.ts`, `src/i18n/index.tsx`,
`src/i18n/en.ts`, `src/i18n/ar.ts`, `src/components/ui/index.ts`, `TextField.tsx`,
`MeMark.tsx`, `package.json`, `package-lock.json`.

**Modified (icon migration):** `BackButton.tsx`, `BottomTabBar.tsx`, `Chip.tsx`,
`Checkbox.tsx`, `LanguageCard.tsx`, `PasswordField.tsx`, `ThemeToggle.tsx`;
`app/(app)/(tabs)/me.tsx`, `app/(app)/patient-switcher.tsx`,
`app/(app)/notifications/index.tsx`, `app/(app)/notifications/messages.tsx`,
`app/(app)/settings/appearance.tsx`, `app/(app)/search/specialties.tsx`,
`app/(app)/doctors/[id]/index.tsx`, `app/(app)/doctors/[id]/reviews.tsx`,
`app/(app)/edit-profile.tsx`, `app/(app)/medical-history.tsx`, `app/dev/screen-gallery.tsx`,
`app/auth/sign-in.tsx`.

**Modified (screen fixes + hero/CTA):** `app/welcome.tsx`, `app/onboarding.tsx`,
`app/splash.tsx`, `app/(app)/(tabs)/dashboard.tsx`, `app/(app)/(tabs)/profile.tsx`,
`app/(app)/(tabs)/search.tsx`, `app/(app)/search/map.tsx`, `app/(app)/settings/index.tsx`,
`app/auth/otp.tsx`, `app/(app)/_layout.tsx`.

---

## Still blocked / needs real-device verification

- **Arabic (RTL) device QA:** no Arabic screenshots existed in the audit set. Numerals,
  AR wordmark, RTL chevrons and `formSheet` detents are implemented but should be verified
  on a device in `ar` (a full LTR↔RTL switch requires an app reload — existing behavior).
- **Onboarding control row** (`Back`/`Next`) is not horizontally reversed for RTL
  (pre-existing); low impact, flagged for a later RTL pass.
- **`formSheet` detents** render best on react-native-screens with new-arch; verify the
  partial-height sheet on the target Android build (falls back gracefully to a full modal).
- **Map** remains a styled stand-in (no maps SDK, per instruction) — a real provider is a
  later task.
- **Featured-clinic / onboarding imagery:** brand pattern is used as the approved fallback;
  real illustrations/photos are not yet available.
- Icon SVG paths are hand-authored to the PDF style; if the original vector icon files are
  provided later, swap the path data in `Icon.tsx` for pixel-exact marks.

---

## Suggested QA screenshots (final sign-off)

Capture each in **EN-Light, EN-Dark, AR-Light, AR-Dark** (Android + iOS):
Splash · Welcome · Onboarding (slide 1 & final) · Language · Sign In · Sign Up · OTP ·
Dashboard · Profile · Edit Profile · Family · Add Member · Switch Patient · Search ·
Filters (sheet) · Specialties · Map · Doctor Details · Reviews · Notifications ·
Facility Messages · Notification Preferences · Settings · Appearance.

Focus checks: brand icons render (no Ionicons); angled CTA on Welcome/Onboarding-final;
hero pattern on Splash/Welcome/Onboarding/Featured; Display/H1 sizes; input focus border;
**AR**: Eastern-Arabic numerals, Arabic wordmark, mirrored chevrons/layout, filters sheet.

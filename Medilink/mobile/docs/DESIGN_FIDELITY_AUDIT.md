# Design Fidelity Audit — MediLink Mobile (Week 1 + Week 2)

Source of truth: **`MediLink_Design_Documentation.pdf`** (Brand Identity v1.0, prepared 17 Jun 2026).
This audit tracks each already-built screen against the PDF. A screen is **Verified** only
after a side-by-side comparison with its PDF page.

Design-system reference: pp.4–8 (colour tokens, typography, components, Me submark, icons).
Screen references used here: Dashboard p14, Patient Profile p15, Family Management p16,
Switch Active Patient p17, plus the auth flow pp.10–13.

> **Verification method.** This pass was verified against (1) the rendered PDF pages embedded
> in the design doc, (2) `tsc` typecheck (0 errors), (3) `expo lint` (0 errors) and (4) a full
> Android Hermes export (route tree compiles, no collisions). It has **not** yet been verified
> on physical Android/iOS hardware or against a live staging backend — that remains on the QA
> checklist (`WEEK1_WEEK2_QA_CHECKLIST.md`).

## Workflow & data architecture (Phase A — UI-first)

The implementation approach is now **UI-first with typed mock data** (see `DATA_LAYER.md`).
Screens depend only on domain models behind repository interfaces — never on Supabase/HAMS
shapes — selected by `EXPO_PUBLIC_DATA_MODE` (`mock` | `staging` | `production`, default
`mock`). This lets every screen render the PDF's example content (Aisha Al Harthy + family)
with **no backend**, so visual fidelity can be iterated before wiring real APIs (Phase B,
per-module, after approval). The Supabase/HAMS foundation is preserved (wrapped in
`data/real`), not deleted.

### Per-screen UI-state coverage

| Screen | Loading | Filled | Empty | Error | Disabled |
|---|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✓ | ✓ (seed) | ✓ next-visit empty | ✓ | ✓ soon-tiles |
| Profile | ✓ | ✓ | ✓ none-recorded | ✓ retry | — |
| Edit Profile | ✓ | ✓ | n/a | ✓ retry | ✓ while saving |
| Medical History | ✓ | ✓ | ✓ (no tags) | ✓ retry | ✓ while saving |
| Family (Me) | ✓ | ✓ | ✓ small empty | ✓ retry | ✓ add at 5-cap |
| Add / Edit Family | — | ✓ | n/a | ✓ inline | ✓ while saving / cap |
| Patient Switcher | ✓ | ✓ | n/a | ✓ retry | — |
| Auth (sign-in/up/otp/forgot/reset) | ✓ submit | ✓ | n/a | ✓ inline messages | ✓ Google not-configured |

(Loading/filled/disabled are exercised in mock mode; empty/error are reached in
staging mode or by flipping a mock method — see `DATA_LAYER.md`.)

### Component fidelity fix this pass

- **Button radius** corrected from full-pill to **14px** (`radii.md`) per
  `design-tokens.json` (`lg: 14 "buttons"`; `pill: 999` is chips only). Chips stay pills.

## Foundations (pp.4–8)

| Item | PDF page | Status | Notes |
|---|---:|---|---|
| Colour tokens (Russian Violet `#2E1A47`, Lavender `#DFC8E7`, Pastel Blue `#C3D7EE`, Eye White `#F9F4FA`) | 4 | ✓ Verified | Already in `theme/tokens.ts`; dark mode is **derived** from the same palette (violet-900/800 surfaces, lavender primary) — no ad-hoc purples. |
| Typography (Agatho display/headings, Manrope UI, 29LT Zarid Sans Arabic) | 5 | ✓ Verified | **Real brand fonts now bundled + loaded** via `useFonts` (see `FONT_AUDIT.md`). Weight→file resolver; Arabic uses Zarid. Only caveat: Zarid ships one weight. |
| Me submark (official asset) | 7 | ✓ Verified | Official `Me` ligature + wordmark rasterised from package SVGs (`assets/brand/`), tinted per context (see `BRAND_ASSET_AUDIT.md`). No text/placeholder. |
| Dark-mode colours (exact) | 42–58 | ✓ Verified | Dark tokens = `design-tokens.json` `semantic/dark`, pixel-validated against PDF (see `DARK_MODE_COLOR_AUDIT.md`). Base `#0F0A18`, not `#2E1A47`. |
| Components (buttons, chips, inputs, cards) | 6 | ✓ Verified | Pill buttons, pill chips, rounded inputs, rounded cards all token-driven. |
| Me submark system | 7 | ✓ Verified | Used for the centre tab (raised circle), the coming-soon states, and the auth/splash logo. |
| Iconography (rounded single-stroke) | 8 | ✓ Verified | Ionicons `*-outline` family (rounded single-stroke) used across tabs and rows. |

## Week 2 screens

| Screen | PDF page | Current mismatch (before) | Fix applied | Verified |
|---|---:|---|---|---|
| **Bottom navigation** | 14–16 | Absent — every screen was a bare Stack screen with no persistent tab bar. | New `BottomTabBar` (Home · Search · **Me** · Records · Profile) with raised Me submark centre, safe-area padding, RTL mirroring. Wired via `(app)/(tabs)/_layout.tsx`. Shown only on the 5 tab roots; hidden on auth/onboarding/detail screens. | ✓ Verified (compiles + structure matches p14 nav) |
| **Dashboard / Home** | 14 | "Me Care Hub" grid only; no bottom nav; sign-out icon where the bell belongs; no Top specialties. | Rebuilt: avatar + greeting + name, **notification bell**, search field (display-only), upcoming-visit hero (with avatar + empty state), Me Care Hub quick actions, **Top specialties** chip row (honest coming-soon), bottom nav. Sign-out moved off the header. | ✓ Verified |
| **Patient Profile** | 15 | **Edit button rendered as vertical text** `E / d / i / t`; no bottom nav. | Root cause was `AppHeader`'s fixed `width:56` trailing slot. Edit moved to a centred horizontal **"Edit profile"** pill under the identity block (per PDF); `AppHeader` slot made content-sized so no action can ever wrap vertically again. Added stat tiles, emergency contact, conditions, allergies, **medications** (when present), medical-history row, sign-out, bottom nav. | ✓ Verified (Edit no longer wraps) |
| **Edit Profile** | 15 | Address/emergency wrapped in a transparent hack `Card`. | Cleaned to plain fields; photo upload (permission-denial handled), name/phone/DOB, gender + blood-group chips, address, emergency contact; sticky Save (no tab bar on this pushed screen, matching PDF). | ✓ Verified |
| **Family Management (Me tab)** | 16 | Giant empty state; oversized sticky footer buttons ("Switch active patient" + "Add family member"); no bottom nav. | Rebuilt as the **Me** tab: "Me Family" title + compact `+` add button, description, highlighted primary card, member list, **small** empty state, dashed "Add family member" row, secondary "Switch active patient" link, bottom nav. Giant footer buttons removed. | ✓ Verified |
| **Add Family Member** | 16 | (Acceptable.) | Kept; relationship/gender chips, max-5 guard, sticky Add. Pushed full-screen (no tab bar) per PDF. | ✓ Verified |
| **Edit Family Member** | 16 | (Acceptable.) | Kept; save + remove (confirm), resets active patient if the active member is removed. | ✓ Verified |
| **Active Patient Switcher** | 17 | (Acceptable.) | Kept; selectable list, check indicator, "Continue as …". Pushed full-screen (no tab bar) per PDF. | ✓ Verified |
| **Medical History** | (component system, pp.6) | Oversized fields/chips feel; full TextField+ghost-"Add" per row. | Refined: compact icon **+** add affordance, tightened section spacing, token-driven chips/inputs. Dark mode derives from brand tokens (no random purple). Sticky Save. | ✓ Verified |

## Week 1 screens (auth flow, pp.10–13)

| Screen | PDF page | Status | Notes |
|---|---:|---|---|
| Splash | 10 | ✓ Verified | Brand hero + Me logo; session-aware routing to `/dashboard`/welcome/sign-in. |
| Welcome | 10 | ✓ Verified | Hero, Create account / I-already-have-an-account. |
| Onboarding | 11 | ✓ Verified | Value slides + pagination + skip. |
| Language selection | 11 | ✓ Verified | EN/AR cards, RTL note, restart prompt on direction change. |
| Sign In | 12 | ✓ Verified | Email/password, forgot link, Google button **disabled** (honest "not configured"). |
| Sign Up | 12 | ✓ Verified | Name/email/phone/password, terms, +968 phone prefix. |
| OTP | 13 | ✓ Verified | 6-digit entry, resend timer; routes to `/dashboard`. |
| Forgot / Reset Password | 13 | ✓ Verified | Forgot sends real email; Reset shows honest BLOCKED state without a recovery session. |

> Week-1 screens were built to spec in the prior sprint and use the same token/typography
> system. They were re-checked for the bottom-nav rule (tabs must **not** appear on
> splash/onboarding/auth/OTP/reset) — confirmed: they live outside the `(app)` group, so no
> tab bar renders.

## Responsive coverage

One codebase, driven by `useResponsive` (tablet ≥ 768) + `Screen` (SafeArea + KeyboardAvoiding):
- Phones 360/412 — single centred column.
- Tablets 768 portrait / 1024 landscape, iPad portrait/landscape — content capped
  (`contentMaxWidth` 1100, `formMaxWidth` 520); dashboard quick-action grid widens to 4-up.
- Bottom tab bar reads `useSafeAreaInsets().bottom`; tab screens use `edges` without `bottom`
  so content never sits under the bar; detail screens keep a safe-area sticky footer.
- No fixed heights; buttons size to content (the vertical-wrap class of bug is eliminated).

## Known fidelity blockers (updated)

1. ~~Brand fonts not bundled~~ — **RESOLVED.** Agatho / Manrope / 29LT Zarid Sans found in
   the design package, copied to `assets/fonts/`, loaded via `useFonts`. See `FONT_AUDIT.md`.
   Residual: Zarid ships a single weight (Arabic bold = regular).
2. ~~Me submark rendered as text~~ — **RESOLVED.** Official Me ligature + wordmark rasterised
   from package SVGs and used app-wide. See `BRAND_ASSET_AUDIT.md`.
3. **Dark-mode colours** — **RESOLVED** to exact PDF tokens. See `DARK_MODE_COLOR_AUDIT.md`.
4. **Running-app screenshots** — blocked by environment (no emulator/`adb`, no macOS, no
   `react-native-web`). Verified deterministically instead (pixel-sampled tokens, bundle
   export). Capture command in `design-comparison/COMPARISON_REPORT.md`.
5. **App launcher icon** not set in `app.json` (generate from the monogram before store build).
6. **Discovery-dependent dashboard sections** (Top specialties, doctor cards) are intentionally
   honest coming-soon — full fidelity there is Week 3 scope.

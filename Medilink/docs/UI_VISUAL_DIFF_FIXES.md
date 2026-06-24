# MediLink Mobile — Visual-Difference Fixes

Implements the corrections in `UI_VISUAL_DIFF_AUDIT.md` against the PDF + extracted
brand folder. Colours are the exact values extracted from the PDF vector; assets are the
official supplied files. Checks: `tsc` ✅ · `expo lint` ✅ (0 problems) ·
`expo export --platform android` ✅ (4 Zarid Sans weights + SVG splash bundle clean).

| Audit ID / item | File(s) | Exact token / asset / font used | Status |
|---|---|---|---|
| **G1** dark bg too cool | `src/theme/dark.ts` | `background #160E26` (PDF vector, dark artboard per-phone fill) | ✅ fixed |
| **G2** invisible borders | `Card.tsx`, `Chip.tsx`, `TextField.tsx` | solid **1px** (was `hairlineWidth*2`≈0.6px@3x); colours `#E8E0F0`/`#3A2B53` | ✅ fixed |
| **G3** Arabic too thin | `assets/fonts/ZaridSans-{Regular,Medium,SemiBold,Bold}.ttf`, `theme/typography.ts` | static instances of the supplied variable font at **wght 400/500/600/700** (default was Thin 100); `fontFamilyFor` maps Arabic per weight | ✅ fixed |
| **G4** primaryMuted | `light.ts`, `dark.ts` | `#6E4AA0` (PDF vector) both themes | ✅ fixed |
| **G5** avatar lavender | `Avatar.tsx` | already `accent #DFC8E7` + violet initials — JPEG artifact, no change | ✅ verified |
| Splash wrong | `app/splash.tsx` | violet **SVG LinearGradient** `heroFrom #2E1A47`→`heroTo #3B2056`; app-icon **squircle tile** (28r, translucent white over violet); **official white SUBMARK**; `Medilink` wordmark (white); tagline `accent`; progress track translucent-white + **lavender fill** | ✅ fixed |
| Welcome wrong | `app/welcome.tsx` | violet hero `heroFrom` (both themes), `HeroBackground` orbs, heading+subtitle **inside** card (white), **theme-aware angled** `CtaButton`, **filled** secondary (`surfaceAlt`) | ✅ fixed |
| Onboarding off-spec | `app/onboarding.tsx` | removed dot pattern; **all-rounded** `Button` (Next + Get Started); plain lavender circle (`accent`) | ✅ fixed |
| CTA color/shape | `src/components/ui/CtaButton.tsx` | theme-aware: `colors.primary` fill + `colors.textOnPrimary` text (violet/white light, lavender/violet dark) | ✅ fixed |
| Dot pattern overused | `src/components/ui/HeroBackground.tsx` | reduced to **orbs only** (large upper-right + small mid-left); dot field removed (not on any artboard) | ✅ fixed |
| Submark asset | `assets/brand/me-mark.png`, `MeMark.tsx` | official **SUBMARK-05** (white), trimmed; ratio `1363/926` | ✅ fixed |
| Mixed AR date | `app/(app)/(tabs)/dashboard.tsx` | dropped `num()` on the English data date (kept on pure prices/ratings/counts) | ✅ fixed |
| Featured hero | `dashboard.tsx` | violet `heroFrom` (both themes) + orbs (no dots) | ✅ fixed |
| unused font | removed `assets/fonts/ZaridSans.ttf` | — | ✅ removed |

## Blocked / out-of-scope (not visual-token issues)
- **Arabic data not translated** (doctor/clinic/specialty names, allergy chips, demo-mode
  string) — these are content/i18n-catalog + backend data tasks, not styling. The numeral
  mix users saw on dates stems from this; UI numbers (counts/timers/OTP/prices/ratings) are
  correctly Eastern-Arabic. Recommend a content-localization pass (Phase 3).
- **Full RTL on a running build** requires an app reload after switching locale (native
  `I18nManager`); verify on device.
- Splash gradient/tile, Arabic weights, and 1px borders are best confirmed on a real
  device — see the QA checklist below.

## Route-by-route QA checklist (Android)

Capture each in **EN-Light / EN-Dark / AR-Light / AR-Dark**:

| Route | What to verify |
|---|---|
| `/splash` | Violet **gradient** (not flat), squircle tile + white Me, `Medilink` wordmark, lavender progress fill |
| `/welcome` | Violet hero **both themes** (not lavender on dark), 2 orbs, heading+subtitle **inside** card, angled CTA (violet/white light · lavender/violet dark), **filled** secondary |
| `/onboarding` (slides 1–3) | Clean bg (no dots), lavender circle, **rounded** Next/Get Started, dots |
| `/language` | Cards, selected violet border; **Arabic "العربية" readable weight** (not thin) |
| `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/otp` | Inputs show **visible border** + violet focus border; OTP "sent to +968…"; AR labels **readable weight** |
| `/dashboard` | Dark bg warm `#160E26`; next-visit date not mixed-script; featured hero violet+orbs; brand icons |
| `/search`, `/search/specialties`, `/search/filters`, `/search/map` | Visible card/chip borders; filters bottom sheet; map pins+halo; AR numerals on prices/ratings |
| `/doctors/[id]` | Card borders visible; lavender Book button on dark / violet on light |
| `/profile`, `/edit-profile` | `O+` renders; stat tiles; visible borders; AR labels readable |
| Global | Dark bg `#160E26`; 1px borders; Agatho serif headings; Manrope body; Arabic medium-weight |

After QA, send back any route that still deviates with a screenshot and the mode.

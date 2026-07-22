# Font Audit — MediLink Mobile

Source design package fonts located in `…/Medilink APP/document/document/assets/` and
`…/GUIDELINE/04_…/Fonts/`. All required brand fonts were **found and wired**.

| Font | Required use | Found? | File path (copied to) | Loaded in Expo? | Screens verified |
|---|---|---|---|---|---|
| **Agatho** | EN headings / display / brand moments | ✓ | `mobile/assets/fonts/Agatho-Regular.otf`, `Agatho-Medium.otf`, `Agatho-Bold.otf` | ✓ `useFonts(BRAND_FONT_FILES)` in `app/_layout.tsx` | display/h1/h2 across all screens (resolver maps weight→file) |
| **Manrope** | EN UI / body | ✓ | `mobile/assets/fonts/Manrope-{Regular,Medium,SemiBold,Bold,ExtraBold}.otf` | ✓ | title/body/label/caption across all screens |
| **29LT Zarid Sans** | all Arabic UI/body (and AR headings) | ✓ (one weight shipped) | `mobile/assets/fonts/ZaridSans.ttf` | ✓ | all text when `isRTL` (Arabic) |
| Abigaila (signature) | signatures only (Week 3 e-prescription) | ✓ in package, not needed for Week 1/2 | _(not copied)_ | — | out of scope |

## How fonts are applied

- **Loaded before UI renders:** `app/_layout.tsx` calls `useFonts(BRAND_FONT_FILES)` and
  renders a brand-violet holding view until fonts are ready — no system-font flash.
- **Weight → concrete family:** custom fonts don't synthesise weights, so
  `src/theme/typography.ts` → `fontFamilyFor(role, weight, isRTL)` maps each
  (role, weight) to a real loaded family:
  - heading: 400→`Agatho-Regular`, 500→`Agatho-Medium`, ≥600→`Agatho-Bold`
  - body: 400→`Manrope-Regular`, 500→Medium, 600→SemiBold, 700→Bold, 800→ExtraBold
  - Arabic / RTL: always `ZaridSans-Regular`
- **Per-locale:** in RTL, every role (including headings) resolves to 29LT Zarid Sans,
  matching `design-tokens.json` `type/ar` (Arabic uses Zarid for headlines too).
- `USE_BRAND_FONTS = true`; `EMIT_FONT_WEIGHT` is false (the family already encodes the
  weight, so RN `fontWeight` is not emitted — avoids Android weight-fallback bugs).
- Only `Text` and `TextField` resolve fonts; screens never set `fontFamily` directly.

## Known limitation (documented, not hidden)

- **29LT Zarid Sans ships a single weight** in the package (`ZaridSans.ttf`). Arabic
  bold/semibold therefore render at regular weight. If a weighted Arabic set is licensed
  later, add the files and extend `fontFamilyFor`'s Arabic branch. Until then Arabic
  emphasis relies on size/colour, which is acceptable but not weight-exact.
- The bundle includes the Agatho OTFs (~1.5 MB each → ~4.7 MB). Acceptable for a dev/EAS
  build; can be subset later to shrink size.

**Status:** fonts are real, loaded, and applied — not system fallbacks.

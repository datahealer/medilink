# MediLink Mobile — Visual-Difference Audit (pre-implementation)

Source of truth: `MediLink_Design_Documentation.pdf` + extracted brand folder
(`docs/.../Medilink/`). Colours below were extracted **directly from the PDF vector**
(`get_drawings` fill enumeration, per-phone rect matching), not eyeballed. Current state
read from the Android captures in `UIscreenshots/` (37 WhatsApp frames + 2 device shots).

## Exact token truth (from PDF vector)

| Role | Light | Dark | Current app | Action |
|------|-------|------|-------------|--------|
| screen background | `#F9F4FA` | **`#160E26`** | light ✓ / dark `#0F0A18` | fix dark → `#160E26` |
| surface (card) | `#FFFFFF` | `#221634` | ✓ / ✓ | keep |
| surfaceAlt / input | `#F4EEF9` | `#2B1D40` | ✓ / ✓ | keep |
| border | `#E8E0F0` | `#3A2B53` | ✓ / ✓ (but rendered too thin) | widen stroke to 1px |
| text | `#241338` | `#F1EBF8` | ✓ / ✓ | keep |
| primary | `#2E1A47` | `#DFC8E7` | ✓ / ✓ | keep |
| primaryMuted | `#6E4AA0` | `#6E4AA0` | `#5B3B86` / `#E8DCF1` | fix → `#6E4AA0` |
| accent | `#DFC8E7` | `#4A3168` | ✓ / ✓ | keep |

## Key cross-cutting defects (from screenshots)

| ID | Issue | Evidence | Fix |
|----|-------|----------|-----|
| G1 | **Dark bg too cool/dark**, not warm violet | all dark frames | token dark bg `#160E26` |
| G2 | **Card/input borders nearly invisible** (both modes) | every card/input frame | `StyleSheet.hairlineWidth*2` ≈ 0.6px on 3x → use solid **1px** in Card/TextField/Chip |
| G3 | **Arabic text too thin/hairline** | every AR frame (login/home/profile/edit/signup) | variable font defaulted to **wght=100**; ship static instances 400/500/600/700 and map by weight |
| G4 | **primaryMuted off** | splash/track | `#6E4AA0` |
| G5 | **Avatar lavender oversaturated** (~#C9A8DC vs #DFC8E7) | family/profile | Avatar bg → `accent` |

## Screen-by-screen

### Splash (`app/splash.tsx`) — PDF p10 / artboards
- **Current:** flat `#2E1A47`, recreated logo, no tile, weak/again-no gradient, no progress styling.
- **Reference:** violet **gradient** (≈`#2E1A47`→`#3B2056`), an **app-icon squircle tile**
  (lighter translucent violet) holding a **white Me** submark, the **"Medilink" wordmark** (white),
  tagline, thin progress track (dark) with **lavender fill**. **No dot pattern.**
- **Fix:** rebuild with SVG linear gradient + tile + official white submark + wordmark + progress.
- Priority: **Critical**.

### Welcome (`app/welcome.tsx`) — artboards
- **Current:** dark-mode hero renders **lavender** (used `colors.primary`); heading/subtitle
  **outside** the card; secondary is a **text link**; CTA shape ok but **lavender on light** (wrong).
- **Reference:** **violet** rounded hero card (both themes) with **2 soft orbs**; heading+subtitle
  **inside** the card (white); **angled CTA** that is **violet/white on light, lavender/violet on dark**;
  secondary = **filled light button**.
- **Fix:** fixed violet hero; orbs; move text inside; theme-aware CtaButton; filled secondary.
- Priority: **Critical**.

### Onboarding (`app/onboarding.tsx`) — artboards
- **Current:** added **dot pattern** (not in ref); final slide uses **angled** "Get Started"
  while others use rounded "Next" (**inconsistent**); Me mark inside the circle.
- **Reference:** clean Eye-White bg (no pattern); **plain lavender circle**; **all CTAs rounded**
  (Next + Get Started); dots (active = elongated violet pill).
- **Fix:** remove HeroBackground; rounded Button for all; plain circle.
- Priority: **High**.

### Dashboard (`(tabs)/dashboard.tsx`)
- **Current:** next-visit date localized produced mixed script ("Wed ١٨ Jun") on AR; featured hero
  used dot pattern.
- **Reference:** date stays as data string (no per-digit localization of mixed English dates);
  featured = branded violet block w/ orbs (no dots).
- **Fix:** drop `num()` on the mixed date string (keep on pure prices/ratings/counts); featured uses orbs.
- Priority: **Medium**.

### CTA shape per screen (verified against artboards)
- **Angled** CTA: **Welcome** "Create account" only (brand hero moment).
- **Rounded** Button everywhere else incl. Onboarding Next/Get Started, Sign in/up, OTP, Forgot,
  Language Continue, Booking, Save, etc. — matches the PDF.

### Arabic / RTL
- Thin font (G3) — primary readability fix. After static weights: headings→Bold, titles/buttons→
  SemiBold, body→Regular(400), labels→Medium.
- Numerals: Eastern-Arabic for UI numbers (counts, timers, OTP, prices, ratings) — keep; do **not**
  digit-localize mixed English data strings (dates) — avoids "Wed ١٨ Jun".
- **Blocked (content, not visual / Phase 3):** untranslated data (doctor/clinic/specialty names,
  allergy chips, demo string) on AR screens.

### Components
- **Borders** (G2): Card/TextField/Chip → 1px solid.
- **Avatar** (G5): bg = `accent` (#DFC8E7) with violet initials.
- **MeMark**: now uses official trimmed submark; ratio → 1363/926.
- **CtaButton**: theme-aware fill/text.
- **HeroBackground**: orbs-only (remove connected-dot pattern — not used on any screen).

This audit is the implementation checklist for `UI_VISUAL_DIFF_FIXES.md`.

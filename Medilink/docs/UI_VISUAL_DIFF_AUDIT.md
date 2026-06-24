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

---

# Pass 2 — English·Light density + structure (vs PDF p36 artboards)

Compared current Android captures (`compare/`) against the p36 EN-Light artboard phones
(cropped per-screen). Root theme: **current is looser/larger than the compact artboards**,
plus several structural mismatches.

| Screen | Mismatch (current → reference) | Exact spec | Files |
|---|---|---|---|
| Dashboard | **Upcoming card is white** → reference is a **filled VIOLET card** (white content, white avatar, "UPCOMING" pill, white "Check in" + ghost "Reschedule") | violet `heroFrom`, white text, pill | `(tabs)/dashboard.tsx` |
| Dashboard | Me Care Hub tiles = bare icon+label → reference has the icon inside a **lavender rounded-square sub-tile** within each white card; tiles compact | inner tile `accent`/`surfaceAlt`, ~40px, radius 12 | `(tabs)/dashboard.tsx` |
| Dashboard | Section gaps too tall | `lg(24)`→`md(16)` between sections | `(tabs)/dashboard.tsx` |
| Profile | Avatar too large (88) + loose top/gaps | avatar ~76; tighter `marginBottom`; card gaps `md→sm`(10) | `(tabs)/profile.tsx` |
| Profile | Blood-group stat plain text → reference shows **"O+" in a pale-red pill** (semantic) | bg `#FBE7EC`, text `error #C93B56`, radius pill | `(tabs)/profile.tsx` |
| Edit Profile | Field labels Title Case → reference **UPPERCASE** small muted | `letterSpacing`, uppercase, `label` variant | `edit-profile.tsx` |
| Edit Profile | Loose vertical rhythm | field gaps `md→sm/12`; chip rows tighter | `edit-profile.tsx` |
| Global | Screen scroll padding 24 too tall | `paddingVertical 24→16` | `components/ui/Screen.tsx` |
| Family/Add/Switch | Looser than artboards | card radius `lg`, list gaps `sm`; tighten header margins | `(tabs)/me.tsx`, `family/add.tsx`, `patient-switcher.tsx` |

Notes:
- Light cards rely on **shadow + a 1px border** (Android shadows are weak), kept.
- Blood-group red pill is the only place red is used decoratively (it is the semantic error/blood token); matches the artboard.

---

# Pass 3 — Dashboard EN-Light + EN-Dark vs PDF (p14 catalogue / p36 + p42 artboards)

Evidence: 4 supplied Android captures (Dashboard, EN Light top+scroll, EN Dark top+scroll).
These are PRODUCTION dashboard screenshots (the dashboard still uses inline styles, NOT the
new shared components). Source of truth = PDF dashboard artboard. **No code changed in this pass.**

Status legend: ▢ shared-component fix needed · ◻ rollout (wire production screen to the shared component, after approval).

| # | Current (screenshot) element | PDF reference | Exact mismatch | Component to change |
|---|---|---|---|---|
| 1 | Appointment-card pill reads **"NEXT VISIT"** | p14 pill reads **"UPCOMING"** | wrong pill label | ▢ `AppointmentCard` (statusLabel) + dashboard caller |
| 2 | No relative time on the pill row | p14 shows **"in 2 days"** right-aligned on the pill row | missing relative-time chip | ▢ `AppointmentCard` (add optional `relativeLabel`, right-aligned, RTL-mirrored) |
| 3 | Subtitle **truncated**: "Royal Hospital · General Care · Wed 18 Jun · 1…" | p14: concise **"General Care · Today 4:30 PM"** | 4-part string overflows one line → ellipsis | ▢ `AppointmentCard` subtitle = dept + date·time only (drop facility or 2-line); dashboard caller passes concise subtitle |
| 4 | "Me Care Hub" title has **no leading Me badge** | p14 shows a small **Me submark badge** before the title | missing brand badge | ◻ dashboard section header (use `MeMark` 16px before `sectionTitle`) |
| 5 | Hub tiles have **no notification dot** | p14 tiles show a small **dot** at the top-right of each icon sub-tile | missing dot indicator | ▢ `HubActionTile` (add optional `dot` prop, top-end, RTL-aware) |
| 6 | Featured-clinic hero = flat violet + faint orb; **submark watermark not visible** | p14 featured uses a clinic image; brand fallback should still carry the **submark watermark** | watermark too faint / production card not using `ClinicCard` | ▢ `ClinicCard` raise submark watermark opacity slightly · ◻ wire dashboard featured → `ClinicCard` |
| 7 | Header shows **grid + bell** icons | p14 header = bell (+ optional) | grid icon is **dev-only** (`isDev` Screen Gallery) — will not ship; not a true mismatch | (no change) |

### Verified matching (no change needed)
- Violet appointment card fill, white avatar, white "Check in" + ghost "Reschedule" — match p14. ✓
- Me Care Hub icon-in-lavender-sub-tile treatment, tile size — match. ✓
- Top-specialties chips, Recently-visited cards (avatar, name, specialty·facility, ★rating OMR, Visited tag) — match. ✓
- **Dark mode**: warm violet bg `#160E26`, raised cards `#221634`, lavender CTA, lavender→violet "Me" tab badge — match p42. ✓
- Bottom nav order Home·Search·[Me]·Records·Profile + raised submark — match. ✓

### Notes
- Density/sizing now reads close to the artboard — the remaining deltas are the small structural
  details above (pill label, relative time, hub dot, Me badge, subtitle truncation), not global sizing.
- Items #1–3,5,6 are refinements to the **shared components** (AppointmentCard / HubActionTile /
  ClinicCard) so they are correct BEFORE the production rollout. Item #4 is a dashboard-caller detail.
- Production screens (Dashboard/Doctor/Search/Family/Profile/etc.) remain unchanged pending approval.

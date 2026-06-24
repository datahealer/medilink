# MediLink Mobile — Full Visual-Difference Audit (corrected)

**Source of truth:** `MediLink_Design_Documentation.pdf` ONLY.
Galleries are the approved target: **EN-Light pp.36–40, EN-Dark pp.42–46, AR-Light pp.48–52,
AR-Dark pp.54–58**; design system pp.4–8; annotated catalogue pp.10–34.
This supersedes the earlier iterative passes. **No production code changed in this audit.**

Method: every implemented screen compared to its gallery artboard + catalogue page. A screen is
only called aligned where it visually matches; otherwise concrete deltas are listed. Two truths
to keep in mind throughout:
1. **Production screens still use legacy inline styles**, not the new shared components
   (`AppCard`/`AppText`/`PatternCard`/`AppointmentCard`/`DoctorCard`/`ClinicCard`/`HubActionTile`/
   `SpecialtyTile`/`FamilyMemberCard`). Migration is required for every screen below.
2. The new shared components themselves need the corrections in §3 before rollout.

---

## 0. Design-system reference (pp.4–8) — the spec all screens must obey

- **Colour (p4):** primary `#2E1A47`, accent `#DFC8E7`, accent2 `#C3D7EE`, surface/bg `#f9f4fa`,
  surface2 `#f4eef9`, text `#241338`, muted `#6c6379`, border `#e8e0f0`; success `#2f8f63`,
  warning `#b07d12`, error `#c93b56`, info `#3b6aa8`. Dark tokens (from dark artboards) bg
  `#160E26`, surface `#221634`, border `#3A2B53`, primary→lavender. (App tokens now match.)
- **Type (p5):** Display Agatho **40**, H1 Agatho **28**, H2 Agatho **20**, Title Manrope **16/800**,
  Body Manrope **14**, Caption Manrope **12**. Arabic 29LT Zarid Sans; **Arabic-Indic numerals ٠–٩**.
- **Buttons (p6):** Primary (violet), Accent (lavender), Outline, Ghost, Destructive, **+ the official
  angled BRAND CTA** ("FIND YOUR CARE", lavender, slanted edge). Inputs: **UPPERCASE labels**, violet
  focus border. Segmented tabs (Upcoming/Past). Badges: Confirmed (green dot), Scheduled (blue),
  Pending (amber), Cancelled (pink), Follow-up (lavender).
- **Me submark (p7):** used as **Action button (FAB), Avatar, Tile, Badge, and empty/loading/success
  states** — NOT as a large watermark behind content cards. (Correction to our PatternCard, see §3.)
- **Icons (p8):** single-stroke rounded 24px set. (App now ships a matching custom set ✓.)

---

## 1. Cross-cutting findings (apply to most/all screens)

| ID | Finding | Fix target |
|----|---------|-----------|
| X1 | Production screens use legacy inline cards/text, not shared components → inconsistent radius/padding/min-height/shadow vs galleries | migrate all screens to §3 components |
| X2 | Card **vertical rhythm too compact** vs galleries (doctor/clinic/hub/appointment cards are taller & more padded in the PDF) | `AppCard` per-variant min-heights |
| X3 | **Submark used as a card watermark** (our PatternCard on appointment/doctor) — galleries show **clean** violet/surface cards; submark appears only as FAB/avatar/tile/badge/empty-state | reduce/remove `PatternCard` watermark; keep submark for FAB/avatar/empty states |
| X4 | **Arabic** unverified on device; numerals localized + static weights shipped, but RTL mirroring, wordmark swap, and numeral coverage need capture in AR-L/AR-D | all screens |
| X5 | **Light vs Dark parity** not verified screen-by-screen on device | all screens |
| X6 | Card titles / specialty names must be **Manrope semibold/bold**; some legacy screens use regular caption | `AppText` cardTitle / `SpecialtyTile` |
| X7 | Bottom nav: order + raised Me correct ✓; verify raised-Me colour inversion (violet circle light / lavender circle dark) and label size vs p36/p42 | `BottomTabBar` |

---

## 2. Screen-by-screen audit

Legend — **L/D/AR**: EN-Light / EN-Dark / Arabic status. ✦ = shared component to change.

### 01 · Splash & Onboarding

**Splash** — ref p36/p42 · `/splash`
- Layout: violet **gradient** + app-icon **tile** w/ white Me + "Medilink" wordmark + tagline + lavender
  progress. Current rebuilt to this. Deltas: confirm gradient direction/stops vs artboard; confirm tile
  corner-radius and progress width. Components: screen-level. Assets: official submark/wordmark used. ✦ none.

**Welcome** — ref p36/p42 · `/welcome`
- Layout: violet hero card w/ **2 soft orbs**, heading+subtitle **inside** card; **angled CREATE ACCOUNT
  CTA**; filled secondary "I already have an account". Current rebuilt to this.
- Deltas: confirm hero height ratio (~55–60%) and orb positions; confirm CTA slant matches the brand-CTA
  geometry (p6). L/D: hero violet both ✓; AR mirror + wordmark — verify. ✦ `CtaButton`, `HeroBackground`.

**Onboarding carousel** — ref p36/p42 · `/onboarding`
- Layout: Eye-White bg, lavender illustration circle, Agatho heading, dots (active = elongated violet),
  **rounded** Next + Skip. Current reverted to this. Deltas: confirm dot active-pill width + circle diameter. ✦ none.

**Language selection** — ref p36 · `/language`
- Layout: "Language" title, EN/AR option cards (selected = violet border + check), Continue.
- Deltas: confirm card height/radius; Arabic row weight (Zarid medium). ✦ `LanguageCard`.

**Sign In** — ref p36/p42 · `/auth/sign-in`
- Layout: back header, "Welcome back", **UPPERCASE** EMAIL/PASSWORD labels (done), violet focus border
  (done), Remember + Forgot, violet "Sign in", "or", Continue with Google/Apple (outline).
- Deltas: the **demo-mode banner** is an app-only addition not in the artboard → hide in production.
  Confirm input height vs p6. ✦ `TextField`, `Button`.

**Sign Up** — ref p36/p42 · `/auth/sign-up`
- Layout: back "Create account", FULL NAME/EMAIL/PHONE(+968)/PASSWORD uppercase labels, Terms checkbox,
  Create account. No structural mismatch identified; confirm field spacing + checkbox style on device. ✦ `TextField`.

**OTP Verification** — ref p36/p42 · `/auth/otp`
- Layout: "Verify phone", "Enter the 6-digit code / Sent to +968 9000 0000" (target fixed), 6 boxes,
  resend timer, Verify. Confirm box size/active border; AR shows Arabic-Indic digits. ✦ `OtpInput`.

**Forgot / Reset Password** — ref p36/p42 · `/auth/forgot-password`
- Layout: "Reset password", NEW PASSWORD + **strength meter**, CONFIRM PASSWORD, Update password. Verify
  strength-meter colour/heights vs artboard. ✦ `PasswordField`.

### 02 · Home Dashboard

**Patient Dashboard** — ref p36/p42 · `/dashboard`
- Layout mismatches: (a) Upcoming pill says **"NEXT VISIT"** → must be **"UPCOMING"**; (b) missing the
  **"in 2 days"** relative label on the pill row (right); (c) next-visit subtitle **truncates**
  ("…Wed 18 Jun · 1…") — artboard is concise "General Care · Today 4:30 PM"; (d) **"Me Care Hub" title has
  no leading Me badge**; (e) hub tiles **missing the small notification dot** top-right of each icon sub-tile.
- Component mismatches: upcoming → `AppointmentCard` (violet, **clean, no watermark** X3); hub tiles →
  `HubActionTile`; recents → `DoctorCard variant=recent`; featured → `ClinicCard`.
- Missing assets: featured clinic uses a violet+orb fallback; artboard shows a **clinic image area** —
  supply image or an approved branded fallback (no dot field).
- L/D/AR: L/D structurally close **but with the deltas above** (not matching); AR not captured.
  ✦ `AppointmentCard`, `HubActionTile`, `ClinicCard`, `DoctorCard`, dashboard.

### 03 · Patient Profile

**Personal Information** — ref p36/p42 · `/profile`
- Layout: avatar, name (Agatho), phone·Muscat, "Edit profile" outline pill, 3 stat cards (O+ in **pink
  pill** ✓, 32, 3), Emergency contact, Medical conditions, Allergies. Tab screen, **no back** ✓.
- Deltas: migrate stat tiles + info cards to `AppCard`; confirm stat-card height + gaps vs p36; gear top-right
  is app-added (acceptable). ✦ `AppCard`, profile.

**Edit Profile** — ref p36/p42 · `/edit-profile`
- Layout mismatch: artboard shows **BLOOD GROUP and DOB as two side-by-side fields** ("O+" | "12 Mar 1994");
  current renders a **full chip row for blood group**. Per "PDF is the only source of truth", the **field
  layout is the target** (this overrides the earlier keep-chips note) — flagged for your call.
- Labels UPPERCASE (done). Allergies = removable chips + "add" ✓. ✦ `TextField`, `Chip`, edit-profile.

### 04 · Family Management

**Family Members** — ref p37/p43 · `/me`
- Layout: "Me Family" + "+" (top-end), subtitle, member cards (avatar, name, relation·age, **Active green
  badge**, chevron), dashed "Add family member". Tab screen — **must NOT have a back button** ✓ (none now).
- Deltas: migrate rows to `FamilyMemberCard`; confirm card height/avatar size (≈44) + chevron vs p37.
- L/D/AR: RTL — + on left, chevrons mirrored — verify. ✦ `FamilyMemberCard`, me.

**Add Family Member** — ref p37/p43 · `/family/add`
- Layout: back "Add member", **official Me avatar** "Add a Me profile", FULL NAME, RELATIONSHIP chips,
  DOB + GENDER, Add member. Official submark used ✓. Confirm chip sizing + field rhythm + uppercase labels.
  ✦ `Chip`, `TextField`.

**Switch Active Patient** — ref p37/p43 · `/patient-switcher`
- Layout: "Switch profile", "Whose appointment is this for?", patient cards (selected = violet border +
  filled check), footer "Continue as …". Migrate rows to `FamilyMemberCard` (selectable, no chevron);
  confirm selected-state border. ✦ `FamilyMemberCard`.

### 05 · Doctor Discovery

**Search & Results** — ref p37/p43 · `/search`
- Layout: "Find a doctor", map + filter icons, search field, quick chips (All / Available today / Top rated),
  "N doctors · Sort: Rating", doctor cards w/ **Today** green badge + Book/Profile, bottom nav.
- Component mismatch: doctor cards → `DoctorCard variant=searchResult` (taller/padded, X2); name must not
  be clipped by the badge. ✦ `DoctorCard`, search.

**Filters** — ref p37/p43 · `/search/filters`
- Layout mismatch: artboard shows **CONSULTATION FEE as a SLIDER (OMR 0–30)**; current uses fee **chips** —
  add a real slider. "Reset" top-end ✓. SPECIALTY/GENDER chips + MIN RATING chips (4.0+/4.5+/4.8+) ✓.
- Presentation: must be a **bottom sheet** (formSheet configured) — verify partial-height detent on device.
  ✦ filters + new `Slider`, `Chip`.

**Specialty Categories** — ref p37/p43 · `/search/specialties`
- Layout mismatches: (a) **currently has a back button (AppHeader)** — artboard shows a **browse screen
  with bottom nav and NO back**; (b) specialty **labels must be semibold/bold** (current caption regular).
- Components: 3×3 grid of `SpecialtyTile` + search field. ✦ `SpecialtyTile`, `AppScreen headerVariant="tabs"`, specialties.

**Map View** — ref p37/p43 · `/search/map`
- Layout: search header (back), **light** stylised map with **price pins** (OMR 25/22/30) + **user-location
  dot**, bottom-sheet doctor card. Current = abstract dark grid + pins + halo.
- Deltas: make the map read like the artboard's light map; pins = rounded price pill w/ pointer; bottom card
  = `DoctorCard`-like. (No maps SDK — keep stylised but closer.) ✦ map.

### 06 · Doctor Profile

**Doctor Details** — ref p37/p43 · `/doctors/[id]`
- Layout: back + favourite (heart), **doctor header card** (avatar, name Agatho, specialty·hospital,
  Available-today green badge), **3 stat cards** (12y Experience / 4.9★ 320 reviews / OMR 25 Fee), About,
  Languages chips, Available-today slot chips, **sticky Book bar** ("Consultation OMR 25" + Book).
- Component mismatches: header + stats → `AppCard`/`DoctorCard variant=detail`; **no submark watermark** (X3);
  confirm stat-card height + sticky-bar height vs p37. L/D: dark Book = lavender. ✦ `DoctorCard`/`AppCard`, doctor.

**Reviews** — ref p37/p43 · `/doctors/[id]/reviews`
- Layout: back "Reviews", 4.9 + stars + 320 reviews + **distribution bars (5→1)**, review cards (avatar, name,
  gold stars, comment, date). No structural mismatch identified; migrate cards to `AppCard`; confirm
  distribution-bar widths + gold star colour. ✦ `AppCard`.

### 14 · Notifications

**Notification Center** — ref p39/p45 · `/notifications`
- Layout: "Notifications" + "Mark all", Today/Earlier groups, items (icon in lavender circle, title, time,
  body, unread dot). Brand icons used ✓. Migrate cards to `AppCard`; confirm row height + icon-circle size. ✦ `AppCard`.

**Facility Messages** — ref p39/p45 · `/notifications/messages`
- Layout: "Facility Messages", subtitle, message cards (icon, source, time, preview, unread dot). Migrate to
  `AppCard`; confirm row height. ✦ `AppCard`.

**Notification Preferences** — ref p39/p45 · `/settings/notifications`
- Layout: back "Notifications", toggle rows (Appointment reminders / Payment & invoices / Lab results /
  Prescriptions / Facility updates / Promotions), Channels chips (Push/Email/SMS). No structural mismatch
  identified; confirm toggle colour (lavender on) + dividers vs p39. ✦ `Chip`.

### 16 · Settings

**Settings** — ref p40/p46 · `/settings`
- Layout: "Settings", account card (avatar, name, email), Preferences (Language→English, **Appearance→
  Light·RTL**), Account & data (Privacy & security, Export my data), **Sign out + Delete account** row.
  Bottom nav shown in artboard.
- Deltas: dialog copy fixed ✓; migrate rows/account card to `AppCard`; confirm row height; app reaches
  Settings via push (no bottom nav) while artboard shows tab chrome — confirm intended nav. ✦ `AppCard`.

**Appearance & Accessibility** — ref p40/p46 · `/settings/appearance`
- Layout mismatches: (a) Theme should be **three preview tiles** (light / dark / split-system mini-mockups),
  not plain radio rows; (b) **MISSING "Arabic (RTL) layout" toggle + Arabic preview row**; (c) **MISSING
  "Larger text" toggle**. Current screen only offers Light/Dark/System selection.
  ✦ appearance (add RTL + larger-text controls + preview tiles).

### Extra (not in the 50)
- **Reset Password** `/auth/reset-password`, **Medical History** `/medical-history` — keep consistent with the
  auth/profile patterns; audit after the 26 catalogue screens are aligned.

---

## 3. Shared-component redesign targets (build first, preview, then roll out)

| Component | Required corrections (from galleries) |
|-----------|----------------------------------------|
| `AppCard` | per-variant min-heights/padding to match the **taller** PDF cards (X2); light = white + 1px border + soft shadow; dark = `#221634` + `#3A2B53` border |
| `PatternCard` | **remove/greatly reduce** the submark watermark on content cards (X3); submark stays for FAB/avatar/empty states only |
| `AppointmentCard` | pill text **"UPCOMING"**, add **relative-time** ("in 2 days") on the pill row, **concise** subtitle (no 4-part truncation), clean violet (no watermark) |
| `HubActionTile` | add the **notification dot**; size to the larger PDF tile; label Manrope semibold |
| `DoctorCard` | taller search/recent cards; **detail** variant for the Doctor-Details header+stats; Book(violet)/Profile(outline); name never clipped by badge |
| `ClinicCard` | image-area hero (or approved branded fallback, no dot field) + rating/Featured tag + name/meta |
| `SpecialtyTile` | icon-in-lavender-square + **bold** label |
| `FamilyMemberCard` | avatar + name + relation·age + **green Active badge** + chevron; selectable (switch) variant |
| `AppScreen` | enforce `headerVariant` so **Specialties / Me Family / Settings tab screens never get a back button** |
| `AppText` | semantic roles; specialty/card titles semibold/bold |
| `Button` / `CtaButton` | standard rounded for screen CTAs; **angled** only for Welcome (brand moment) |
| new `Slider` | consultation-fee slider for Filters |
| `appearance` controls | theme preview tiles + RTL toggle + larger-text toggle |

---

## 4. Process

1. **This document is the audit deliverable — awaiting your approval.** No production screen or component
   changed.
2. After approval: implement the §3 corrections to the shared components.
3. Capture `/dev/design-system-preview` in **EN-Light, EN-Dark, AR-Light, AR-Dark** for your sign-off.
4. Only after preview approval: migrate production screens (§2) to the shared components, then re-capture
   each screen in all four modes and diff against pp.36–58.

> Status discipline: no screen above is marked "matching/approved/complete". Items without a listed delta
> are "no structural mismatch identified — pending device capture in EN/AR · L/D".

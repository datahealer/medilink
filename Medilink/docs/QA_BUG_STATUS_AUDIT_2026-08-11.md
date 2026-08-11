# MediLink QA Bug Status Audit

**Date:** 2026-08-11 · **Branch:** `development` · **HEAD:** `5ad4c3b`
**QA source:** MediLink iOS 1.0.0 **Build 9** — EAS build `70b60fc`, 2026-07-31
**Audit type:** READ-ONLY. No code modified, no commit, no push, no migration, no build.

> **Why the old report cannot be trusted as-is:** HEAD is **19 commits ahead** of the build QA
> tested, **13 of them touching `mobile/` or `shared/`**. Several of these bugs were fixed
> *specifically by ID* after Build 9 — the code carries `QA MED-00x` annotations. Every verdict
> below is derived from the current source, not from the QA report.

---

## Summary

| Bug | Title | Current Status | Evidence | Runtime Verified? | Remaining Work |
|---|---|---|---|---|---|
| MED-001 | Full Name accepts invalid chars / no limit | ✅ RESOLVED | `validation.ts:27-113` shared rule, `NAME_MAX=100`, Unicode allow-list; wired into sign-up, setup, edit-profile, family add/edit | No — needs device | None (device confirm only) |
| MED-002 | Password toggle opposite to icon | ✅ RESOLVED | `PasswordField.tsx:10-33` + `PasswordField.test.tsx` | No — needs device | None |
| MED-003 | Masked chars shown before input (Sign In) | ✅ RESOLVED | `sign-in.tsx:221-225` — literal `••••••••` placeholder removed | No — needs device | None |
| MED-004 | OTP email not received (Sign In) | 🔍 NEEDS RUNTIME VERIFICATION | Trigger + template correct in repo (`fc9a712`); delivery depends on **Supabase dashboard SMTP**, not our Microsoft OAuth2 system | No | Verify Supabase Auth SMTP config + one real delivery |
| MED-005 | Password accepts whitespace-only (Sign In) | ✅ RESOLVED | `validation.ts:186-206` refine; `personName.test.ts:142` | No — needs device | None |
| MED-006 | Terms & Privacy consent spacing | ⚠️ PARTIALLY RESOLVED | Single i18n string with correct spacing (EN + AR); no post-Build-9 change | No | Visual confirm; likely already fine |
| MED-007 | Phone accepts special chars / >8 digits | ✅ RESOLVED | `PhoneField.tsx:23-38`, `normalize.ts:149+`, `omanPhone.test.ts` | No — needs device | None |
| MED-008 | Initials clipped in avatar | ✅ RESOLVED | `Avatar.tsx:39-48` derived `lineHeight`; `Avatar.test.tsx` | No — needs device | None |
| MED-009 | Avatar does not open photo flow | ✅ RESOLVED | `edit-profile.tsx:195-215` avatar wrapped in `Pressable` → `pickPhoto` | No — needs device | None |
| MED-010 | Auto-logged-in after fresh install | ⚠️ PARTIALLY RESOLVED | Not an auth bypass — iOS Keychain survives uninstall; no first-launch reset exists | No | **Product decision** required |
| MED-011 | Allergies: no validation, no limit, overflows | ❌ OPEN | `medical-history.tsx:45-53` `TagEditor.add()` only trims + dedupes; no `maxLength`, no charset rule, `Chip` has no truncation | No | Real fix needed |
| MED-012 | Civil Number accepts `00000000` | ❌ OPEN | `validation.ts:20` `CIVIL_NUMBER_RE = /^[0-9]{8}$/` — `00000000` matches | No | Real fix needed |
| MED-013 | Mobile Number accepts `00000000` | ❌ OPEN | `validation.ts:15` `OMAN_PHONE = /^[0-9]{8}$/` — no operator-prefix rule | No | Real fix needed |
| MED-014 | Splash screen not visually optimized | ❌ OPEN | Splash shipped in `fd8eff5`, **already in Build 9**; unchanged since | No | Design decision |

---

## MED-001 — Full Name accepts invalid characters and has no character limit

- **Original QA finding:** accepts spaces-only, numeric/special-only values, unbounded length.
- **Current implementation:** one shared rule in `mobile/src/utils/validation.ts:27-113`. Value is
  first passed through `normalizeHumanText` (trims ends, collapses internal runs) — so a
  spaces-only value becomes `""` and returns `required`. Then: `NAME_MIN = 2`, `NAME_MAX = 100`,
  and a Unicode allow-list `^\p{L}[\p{L}\p{M}\s'’.-]*$/u` which **must start with a letter** and
  permits only `- ' ’ .` as punctuation. Digits and emoji are absent from the class, so
  `"Satyam123"`, `"@@@@"`, `"-Ali"` and a 5,000-character paste are all rejected.
  `nameErrorKey()` returns a distinct i18n key per broken rule (`nameMin` / `nameMax` /
  `nameInvalid`), so the message says *which* rule failed.
  Arabic and mixed-script names pass (`\p{L}` + `\p{M}` covers harakat).
  A `grandfathered` option exists so an edit screen seeded from a pre-rule database value is not
  locked out until the user actually edits the field.
- **Relevant files:** `mobile/src/utils/validation.ts`; `mobile/app/auth/sign-up.tsx`;
  `mobile/app/(app)/setup.tsx:68`; `mobile/app/(app)/edit-profile.tsx:85`;
  `mobile/app/(app)/family/add.tsx:51`; `mobile/app/(app)/family/[id].tsx:95`.
- **Relevant commits:** `2773a98` *fix(mobile): enforce one shared person-name rule and reject blank passwords*; `f434022` *fix(input): normalize whitespace at the write boundary*.
- **Tests:** `mobile/src/utils/__tests__/personName.test.ts`, `validation.test.ts` — passing.
- **Runtime status:** NOT RUNTIME VERIFIED (post-Build-9 code).
- **Verdict:** ✅ **RESOLVED.**
- **Remaining work:** none beyond device confirmation.

## MED-002 — Password visibility toggle behaves opposite to icon state

- **Original QA finding:** open eye showed masked text and vice-versa.
- **Current implementation:** `PasswordField.tsx` now separates the two concerns explicitly and
  documents why they differ. The **icon reflects STATE** (`visible ? "eye" : "eye-off"`), the
  **accessibility label reflects ACTION** (`visible ? "Hide password" : "Show password"`).
  Masking is `secureTextEntry={!visible}`. The previous code used action semantics for both,
  which is exactly the reported inversion. The file carries a warning that "fixing" the apparent
  mismatch reintroduces MED-002.
- **Relevant files:** `mobile/src/components/ui/PasswordField.tsx:10-56`.
- **Relevant commits:** `b7d8c50` *fix(mobile): resolve QA password and profile UI issues*.
- **Tests:** `PasswordField.test.tsx` — includes an assertion that icon and masking never disagree.
- **Runtime status:** NOT RUNTIME VERIFIED.
- **Verdict:** ✅ **RESOLVED.**
- **Remaining work:** none.

## MED-003 — Password field displays masked characters before input (Sign In)

- **Original QA finding:** the empty password field appeared pre-filled.
- **Current implementation:** the placeholder was eight literal U+2022 BULLET characters, which
  rendered as fake masked input and vanished on the first keystroke. It has been **removed**;
  the label alone identifies the field. Sign-up and reset-password never had one, so all three
  password screens are now consistent.
- **Relevant files:** `mobile/app/auth/sign-in.tsx:215-227`.
- **Relevant commits:** `b7d8c50`.
- **Tests:** none specific (placeholder absence is a render detail).
- **Runtime status:** NOT RUNTIME VERIFIED.
- **Verdict:** ✅ **RESOLVED.**
- **Remaining work:** none.

## MED-004 — OTP email is not received after Send Code (Sign In)

**This is the bug most likely to be misjudged, in both directions.**

- **Original QA finding:** no 6-digit OTP email arrives.
- **Current implementation — frontend trigger:** `sign-in.tsx:59` → `repositories.auth.sendLoginOtp`
  → `authService.sendLoginOtp` → `api.auth.signInWithEmailOtp` →
  `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`. Correct, and
  enumeration-safe (an unknown-account error is swallowed; only rate-limit/network errors hard-stop).
- **Current implementation — template:** `supabase/templates/magic_link.html` renders
  `{{ .Token }}` as a 6-digit code, **not** a magic link. `config.toml` sets `otp_length = 6`,
  `otp_expiry = 3600`. Commit `fc9a712` *fix(auth): email login OTP template parity
  (magic link → {{ .Token }})* **is an ancestor of HEAD** — confirmed via `git merge-base`.
- **Critical distinction — this is NOT our Microsoft OAuth2 system.** `docs/EMAIL_ARCHITECTURE.md`
  draws a hard line: **authentication** email (signup verification, password reset, **login OTP**)
  is sent by **Supabase Auth (GoTrue)** and *never touches our code*; only **application** email
  (booking, cancellation, receipts) goes through Nodemailer → Microsoft 365.
  **Therefore the Microsoft OAuth2 work (`76c5af6`, `0f6b968`) has no effect on MED-004 whatsoever** —
  neither fixing it nor breaking it. The old Exchange 430 issue is irrelevant here.
- **What that leaves:** delivery depends entirely on the **hosted Supabase project's Auth SMTP
  settings**, configured in the Supabase dashboard. `supabase/config.toml` and
  `supabase/templates/` govern the **local** stack; they are not applied to a hosted project by
  `db push`. If no custom SMTP is configured in the dashboard, Supabase's built-in mailer applies
  a very low rate limit (a few messages per hour) and is not intended for production delivery —
  the single most likely cause of the reported symptom.
- **Relevant files:** `mobile/app/auth/sign-in.tsx`, `mobile/src/services/authService.ts:145-165`,
  `shared/src/api/auth.ts:93-99`, `supabase/templates/magic_link.html`, `supabase/config.toml`,
  `docs/EMAIL_ARCHITECTURE.md`.
- **Relevant commits:** `fc9a712`, `dc804c2` *replace custom otp_records flow with official Supabase Email OTP*.
- **Tests:** none — delivery is external.
- **Runtime status:** **NOT RUNTIME VERIFIED.** Three separate things must be distinguished and
  only the first is confirmed:
  1. **Code fixed** — ✅ trigger and template are correct in the repo.
  2. **Supabase/SMTP accepted the message** — ❓ unknown; requires the Supabase dashboard.
  3. **Recipient inbox delivery** — ❓ unknown; requires a real send.
- **Verdict:** 🔍 **NEEDS RUNTIME VERIFICATION** — no code change is indicated.
- **Remaining work:** confirm a custom SMTP provider is configured under Supabase → Authentication →
  Emails; confirm the hosted **Magic Link** template matches `supabase/templates/magic_link.html`
  (`{{ .Token }}`, not `{{ .ConfirmationURL }}`); send one real OTP and confirm inbox arrival.

## MED-005 — Password field accepts whitespace-only input (Sign In)

- **Original QA finding:** `"   "` was accepted and fired a real auth request.
- **Current implementation:** `signInSchema.password` is `min(1)` **plus**
  `.refine(v => v.trim().length > 0)`. Deliberately there is **no `.trim()` and no transform** on
  the field: a space is a legal password character, so trimming would send a different credential
  than the one registered and lock the user out with a "wrong password" error. Rejecting
  whitespace-*only* is safe because the signup policy requires upper, lower, digit and symbol, so
  no account can exist whose password is only spaces. Leading/trailing whitespace on a real
  password is preserved and transmitted unmodified — correct.
- **Relevant files:** `mobile/src/utils/validation.ts:183-206`; `shared/src/utils/normalize.ts`
  (same decision at the API boundary).
- **Relevant commits:** `2773a98`, `f434022`.
- **Tests:** `personName.test.ts:142` — `describe("signInSchema.password — MED-005")`.
- **Runtime status:** NOT RUNTIME VERIFIED.
- **Verdict:** ✅ **RESOLVED.**
- **Remaining work:** none.

## MED-006 — Terms & Privacy Policy consent text spacing

- **Original QA finding:** spacing wrong between "Terms", "&" and "Privacy Policy".
- **Current implementation:** the consent line is a **single i18n string** rendered as a
  `Checkbox` label, not a composition of separate `Text` nodes:
  - EN `en.ts:381` — `"I agree to the Terms & Privacy Policy"`
  - AR `ar.ts:367` — `"أوافق على الشروط وسياسة الخصوصية"`
  Both have correct spacing inside the string, and because it is one text node there is no
  inter-element gap to get wrong. The failure mode QA described (missing/doubled spaces around
  `&`) typically comes from concatenated nodes, which is not the current structure.
- **Relevant files:** `mobile/app/auth/sign-up.tsx:158-161`; `mobile/src/i18n/en.ts:381`;
  `mobile/src/i18n/ar.ts:367`.
- **Relevant commits:** none post-Build-9 targeting this.
- **Tests:** i18n parity is type-enforced; no visual test.
- **Runtime status:** NOT RUNTIME VERIFIED. **No change since Build 9**, so if the defect is real
  it is still present — but the current structure does not obviously produce it.
- **Verdict:** ⚠️ **PARTIALLY RESOLVED** — more precisely, *unconfirmed*. The implementation looks
  correct; I cannot reproduce or refute a spacing artifact without rendering it.
- **Remaining work:** one screenshot in EN and AR. If it renders correctly, close as
  not-reproducible; the Terms/Privacy text is also not yet a tappable link, which may be what QA
  actually saw.

## MED-007 — Phone field accepts special characters and more than 8 digits

- **Original QA finding:** `#`, `;`, `*` and 9+ digits reached the database from Complete Your Profile.
- **Current implementation:** both profile screens now use `PhoneField`, not a raw `TextField`.
  Every keystroke and paste is filtered through `omanPhoneInput`, which folds Arabic-Indic digits
  to ASCII, drops non-digits, strips a pasted `+968`, and caps at 8. Keyboard is `number-pad`
  (not `phone-pad`, which offers `+ * # ,`). The length cap is applied in JS rather than native
  `maxLength` to avoid an RN controlled-input reconciliation bug.
  Validators use `omanPhoneDigits` (**not** capped) so a 9-digit entry is *rejected* rather than
  silently truncated into a different valid-looking number. Canonical storage is E.164 via
  `omanPhoneE164`, and the conversions are idempotent in both directions.
- **Relevant files:** `mobile/src/components/ui/PhoneField.tsx:20-40`;
  `shared/src/utils/normalize.ts:149-240`; `mobile/app/(app)/setup.tsx:179-198`;
  `mobile/app/(app)/edit-profile.tsx:314-340`; `mobile/src/utils/validation.ts:115-132`.
- **Relevant commits:** `d0e4dc6` *fix(mobile): normalize and validate Oman phone numbers*.
- **Tests:** `omanPhone.test.ts` (incl. `describe("MED-007 SAVE BLOCKER — regression")`),
  `validation.test.ts:199`.
- **Runtime status:** NOT RUNTIME VERIFIED.
- **Verdict:** ✅ **RESOLVED** for the reported symptoms. **See MED-013** — the field still accepts
  `00000000`, which is a *different* rule and is still open.
- **Remaining work:** none for MED-007 itself.

## MED-008 — User initials partially clipped in profile avatar

- **Original QA finding:** initials clipped at Edit Profile (88px) and Profile (76px).
- **Current implementation:** `Avatar` scales `fontSize = round(size * 0.36)` and — the actual fix —
  **derives `lineHeight = round(fontSize * 1.2)`**. Previously only `fontSize` was overridden while
  `Text`'s `title` variant kept `lineHeight: 22`, so any avatar above ~61px drew ~32px glyphs into
  a 22px box. 1.2× is documented as the smallest multiplier clearing ascenders and descenders in
  both Manrope (Latin) and 29LT Zarid Sans (Arabic).
- **Relevant files:** `mobile/src/components/ui/Avatar.tsx:39-60`.
- **Relevant commits:** `b7d8c50`.
- **Tests:** `Avatar.test.tsx` — explicitly scoped to MED-008.
- **Runtime status:** NOT RUNTIME VERIFIED — glyph clipping is inherently visual, and the Arabic
  case in particular should be eyeballed.
- **Verdict:** ✅ **RESOLVED.**
- **Remaining work:** device confirmation at 76px and 88px, EN and AR.

## MED-009 — Profile avatar does not open photo upload/update flow

- **Original QA finding:** tapping the avatar did nothing; only the caption was interactive.
- **Current implementation:** on Edit Profile the avatar **and** the "Change photo" caption are two
  tap targets for the same `pickPhoto` handler. The avatar is wrapped in a `Pressable` with
  `accessibilityRole="button"`, an accessibility label, disabled/busy state while uploading, and
  `hitSlop={8}`, with circular press feedback. No upload logic is duplicated — both entry points
  call the existing handler that owns permissions, the picker and the `useUploadProfilePhoto`
  mutation.
  The Profile **tab** avatar (`(tabs)/profile.tsx:100-111`) is also inside a `Pressable`.
- **Relevant files:** `mobile/app/(app)/edit-profile.tsx:195-220`; `mobile/app/(app)/(tabs)/profile.tsx:100-111`.
- **Relevant commits:** `b7d8c50`.
- **Tests:** none (interaction wiring).
- **Runtime status:** NOT RUNTIME VERIFIED — needs a device to confirm the picker actually opens
  and the iOS photo-permission prompt appears.
- **Verdict:** ✅ **RESOLVED.**
- **Remaining work:** device confirmation of picker + permission prompt.

## MED-010 — User automatically logged in after fresh TestFlight installation

**This is a behaviour question, not a security defect. Classifying it as an auth bypass would be wrong.**

- **Original QA finding:** after deleting and reinstalling from TestFlight, the app opened already
  signed in.
- **Current implementation:** the Supabase client uses `SecureStoreAdapter` as its auth storage
  (`mobile/src/lib/supabase.ts:19-21`, `persistSession: true`), i.e. the **iOS Keychain**. On iOS,
  **Keychain items survive app deletion by default** — this is documented OS behaviour, not a
  MediLink bug. On next launch `AuthProvider` reads `getRememberSession()` (defaults to "remember"
  when unset) and calls `restoreSession()`, which finds the still-valid token and signs the user in.
  There is **no authentication bypass**: the session is the user's own, genuinely established on
  that device, and still within its validity window. `getSession()` reads the persisted session
  without a network round-trip, and the `(app)` route gate still governs every screen.
- **What is genuinely absent:** any first-launch-after-install detection. A grep across
  `mobile/src/lib`, `providers` and `stores` finds no `firstLaunch` / `hasLaunched` / install-id
  marker, so there is nothing that would clear Keychain state left behind by a previous install.
- **Relevant files:** `mobile/src/lib/supabase.ts`, `mobile/src/lib/secureStore.ts`,
  `mobile/src/lib/authPersistence.ts`, `mobile/src/providers/AuthProvider.tsx:22-35`.
- **Relevant commits:** none targeting this.
- **Tests:** none covering install-lifecycle behaviour.
- **Runtime status:** NOT RUNTIME VERIFIED (reproduction requires delete + reinstall on a device).
- **Verdict:** ⚠️ **PARTIALLY RESOLVED** — the *security* framing is resolved (no bypass exists;
  Remember Me is honoured on cold launch). The *product* question is open: should a reinstall
  present a signed-out app?
- **Remaining work:** **a product decision.** If "reinstall must sign out" is the requirement, the
  fix is a first-launch sentinel in `AsyncStorage` (which does *not* survive uninstall): on launch,
  if the sentinel is missing but Keychain state exists, clear the session and write the sentinel.
  ~2 hours. If the current behaviour is acceptable (many banking and health apps keep it), close
  as by-design. **Do not** "fix" this by disabling `persistSession` — that would break warm resume.

## MED-011 — Allergies field accepts invalid characters, has no limit and overflows

- **Original QA finding:** accepts anything, unbounded, breaks layout.
- **Current implementation:** the allergies/conditions/medications/surgeries inputs are a shared
  `TagEditor` in `medical-history.tsx`. Its `add()` performs **only** `draft.trim()` plus a
  duplicate check — **no length cap and no character validation**. The chips render into
  `styles.chips` (`flexDirection: row`, `flexWrap: wrap`, `gap: 8`) and the `Chip` component has
  **no `numberOfLines`, no `maxWidth`, no `flexShrink` and no ellipsization**, so a single long
  tag cannot wrap or truncate and will overflow its row.
  `edit-profile.tsx` exposes the same allergies editor.
  Neither field has a `maxLength`; the only length clamping in this area is on Civil Number.
- **Relevant files:** `mobile/app/(app)/medical-history.tsx:30-85, 183`;
  `mobile/src/components/ui/Chip.tsx`; `mobile/app/(app)/edit-profile.tsx:289`.
- **Relevant commits:** none — this bug was never addressed.
- **Tests:** none.
- **Runtime status:** NOT RUNTIME VERIFIED, but the absence of any cap or truncation is
  determinable from source with confidence.
- **Verdict:** ❌ **OPEN.**
- **Remaining work:** add a per-tag max length (≈60 chars) and a sensible charset rule in
  `TagEditor.add()`; give `Chip` `numberOfLines={1}`, `flexShrink` and a `maxWidth` so a long tag
  ellipsizes instead of overflowing; optionally cap tag count. ~3 hours. **Code change required.**

## MED-012 — Civil Number accepts `00000000`

- **Original QA finding:** an obviously invalid dummy Civil Number saves successfully.
- **Current implementation:** `CIVIL_NUMBER_RE = /^[0-9]{8}$/` and
  `isValidCivilNumber(v) = v === "" || CIVIL_NUMBER_RE.test(v)`. **`"00000000"` matches this
  regex**, so it is accepted. A repo-wide search for any repeated-digit, sequential-digit or
  dummy-value rule (`grep` for `00000000`, `repeated`, `allSame`, `dummy`, `sequential` across
  mobile, shared, backend and all 166 migrations) returns **no such rule anywhere** — not in the
  client, not in a Zod schema, not in a database CHECK constraint.
  The existing tests assert length and charset only (`validation.test.ts:15-35`).
- **Relevant files:** `mobile/src/utils/validation.ts:19-25`; `mobile/app/(app)/setup.tsx:174`;
  `mobile/app/(app)/edit-profile.tsx:272`.
- **Relevant commits:** none.
- **Tests:** `validation.test.ts` — covers length/charset, **no dummy-value case**.
- **Runtime status:** NOT RUNTIME VERIFIED, but determinable from source with certainty.
- **Verdict:** ❌ **OPEN.**
- **Remaining work:** reject all-same-digit values (and optionally trivial sequences like
  `12345678`) in `isValidCivilNumber`, with a distinct i18n message; add test cases. ~1 hour.
  **Code change required.** Consider mirroring the rule server-side, since the client is not an
  enforcement point.

## MED-013 — Mobile Number accepts `00000000`

- **Original QA finding:** an obviously invalid dummy mobile number saves successfully.
- **Current implementation:** `OMAN_PHONE = /^[0-9]{8}$/` — any 8 digits, so `00000000` passes.
  MED-007's work made the field *shape*-correct (digits only, exactly 8, E.164 storage) but added
  **no plausibility rule**. Real Omani mobile numbers begin with **7** or **9**; nothing in
  `validation.ts` or `shared/src/utils/normalize.ts` enforces a leading-digit rule, and
  `omanPhone.test.ts` has no case for it.
- **Relevant files:** `mobile/src/utils/validation.ts:15, 115-119`;
  `shared/src/utils/normalize.ts:173-240`.
- **Relevant commits:** `d0e4dc6` (shape only, not plausibility).
- **Tests:** `omanPhone.test.ts` — no `00000000` or prefix case.
- **Runtime status:** NOT RUNTIME VERIFIED, determinable from source.
- **Verdict:** ❌ **OPEN.**
- **Remaining work:** tighten to `/^[79][0-9]{7}$/` (confirm the accepted prefix set with the
  business first — Oman has used 7 and 9 for mobile) and reject all-same-digit values; add tests.
  ~1–2 hours including confirming the prefix rule. **Code change required.**
  ⚠️ Check existing production rows before enforcing, so a stricter rule does not lock out
  patients whose stored number predates it — the `grandfathered` pattern used for names applies.

## MED-014 — Splash screen UI/branding not visually optimized

- **Original QA finding:** logo/name placement, spacing, tagline readability and contrast.
- **Current implementation:** two distinct surfaces.
  1. **Native splash** (`app.json` → `expo-splash-screen`): `assets/brand/me-mark.png`,
     `imageWidth: 200`, `resizeMode: "contain"`, background `#2E1A47`.
  2. **In-app splash** (`mobile/app/splash.tsx`): `MeMark` at 54px, `MeWordmark` at 30px with
     `marginTop: 22`, then a `caption`-variant tagline in `colors.accent` with `marginTop: 10`,
     on the same `#2E1A47`.
  The two share a background colour so the handover does not flash.
  **Critically: this splash was introduced by `fd8eff5`, which is already contained in Build 9.**
  Nothing has changed since, so whatever QA observed is exactly what is still there.
  Contrast: white mark/wordmark on `#2E1A47` is strong; the tagline uses `colors.accent`
  (lavender `#DFC8E7`) on the same ground, which is lower contrast and is the most likely
  readability complaint.
- **Relevant files:** `mobile/app/splash.tsx:70-79`; `mobile/app.json:34-40`;
  `mobile/assets/brand/`.
- **Relevant commits:** `fd8eff5` — pre-Build-9.
- **Tests:** none.
- **Runtime status:** NOT RUNTIME VERIFIED.
- **Verdict:** ❌ **OPEN** — no change since QA tested it.
- **Remaining work:** a **design decision**, not an engineering one. Ask design for the intended
  splash composition; the likely actionable item is raising tagline contrast. ~2–4 hours once a
  target is agreed. There is also no Arabic wordmark on the splash despite
  `me-wordmark-ar.png` existing in `assets/brand/` — worth raising.

---

## Final Count

- ✅ **Resolved: 7** — MED-001, MED-002, MED-003, MED-005, MED-007, MED-008, MED-009
- ⚠️ **Partially resolved: 2** — MED-006, MED-010
- ❌ **Open: 4** — MED-011, MED-012, MED-013, MED-014
- 🔍 **Needs runtime verification: 1** — MED-004
- 🚫 **Not applicable: 0**

**All 14 are NOT RUNTIME VERIFIED against a device**, because no build newer than #9 exists.

---

## Production Impact

### Critical production blockers

- **MED-004 — login OTP delivery.** If Supabase Auth SMTP is not configured on the hosted project,
  passwordless sign-in is broken for every user. This is configuration, not code, but it gates a
  primary auth path. **Blocker until verified.**

### Important but non-blocking

- **MED-012 / MED-013 — dummy Civil and mobile numbers.** Clinical records keyed to `00000000`
  are unusable for contacting a patient and pollute the shared HAMS database. Not a crash, but a
  data-integrity defect that gets worse the longer it ships. Both are ~1–2 hours.
- **MED-011 — allergies field.** *Allergies are clinical safety data.* Unbounded free text that
  overflows its container can hide part of an entry from whoever reads it. The layout overflow is
  cosmetic; the missing limit on a safety-critical field is not.
- **MED-010 — reinstall stays signed in.** Not a vulnerability, but on a shared or resold device a
  reinstall exposing the previous user's health record is a privacy question worth a deliberate
  decision rather than a default.

### UI / polish

- **MED-014 — splash.** Cosmetic; needs design input.
- **MED-006 — consent spacing.** Cosmetic; may not reproduce at all.

### Device / runtime-only verification

MED-001, 002, 003, 005, 007, 008, 009 are all fixed in code and require only confirmation on a
device — which cannot happen until a build newer than #9 exists.

---

## Mobile Readiness After This Audit

**78%** — unchanged from the 2026-08-11 production-readiness audit.

This audit did not move the number, and that is the honest result. It converted *uncertainty* into
*fact* — 7 bugs are now known-fixed rather than assumed-open, and 4 are now known-open rather than
assumed-fixed — but it added no runtime evidence, which is the axis holding mobile down. The three
newly-confirmed open defects (MED-011/012/013) are small and offset the confidence gained from the
7 confirmed fixes.

---

## Direct Answers

**1. Which of MED-001–MED-014 are already fixed in the current code?**
Seven: **MED-001, MED-002, MED-003, MED-005, MED-007, MED-008, MED-009.** All were fixed *after*
Build 9 and carry explicit `QA MED-00x` annotations in source, with tests for MED-002, MED-005,
MED-007 and MED-008.

**2. Which bugs still need development?**
Four: **MED-011** (allergies validation + chip overflow, ~3h), **MED-012** (civil number dummy
rejection, ~1h), **MED-013** (mobile number plausibility, ~1–2h), **MED-014** (splash — design
decision first). Plus **MED-010** *if* product decides reinstall must sign out (~2h).
**Total: ~1 engineering day** once the two decisions are made.

**3. Which only need device/TestFlight verification?**
**MED-001, 002, 003, 005, 007, 008, 009** — code-complete, awaiting a device.
**MED-006** likely joins them (one screenshot may close it as not-reproducible).
**MED-004** needs external verification (Supabase dashboard + one real send) rather than a device.

**4. Which bugs were fixed AFTER Build 9 and are therefore NOT represented in Build 9?**
All seven resolved bugs — MED-001, 002, 003, 005, 007, 008, 009 — landed in `b7d8c50`, `2773a98`,
`d0e4dc6` and `f434022`, **every one of them after `70b60fc`**. Build 9 contains **none** of them.
MED-004's template fix (`fc9a712`) is older and *is* in Build 9.
**Re-testing this bug list against Build 9 would reproduce seven already-fixed bugs.**

**5. What should we fix next, ranked by severity?**
1. **MED-004** — verify Supabase Auth SMTP + template on the hosted project (config, blocks sign-in).
2. **MED-013** then **MED-012** — dummy phone/civil numbers (~2–3h total, data integrity).
3. **MED-011** — allergies limit + chip truncation (~3h, clinical-safety data).
4. **MED-010** — product decision, then ~2h if a reinstall reset is wanted.
5. **MED-014** / **MED-006** — design input, then cosmetic.

**6. Is another TestFlight build required before these bugs can be signed off?**
**YES — unavoidably.** Build 9 predates every one of the seven fixes, so QA cannot verify them
against any artifact that exists today. The recommended order is: land the four small fixes
(~1 day), then cut **one** build carrying all eleven code-resolved bugs plus the booking,
timezone, payment and email work, and re-run the QA workbook once. Cutting a build now would
force a second QA cycle for the four still-open items.

---

## Audit Execution Record

| Item | Value |
|---|---|
| Current branch | `development` |
| Current HEAD | `5ad4c3bef63666857d22dd49e45e897182196bf9` |
| Working tree clean before audit? | Yes for all tracked files. One pre-existing **untracked** file: `docs/PRODUCTION_READINESS_AUDIT_2026-08-11.md` |
| Files modified by this audit | **None.** This document is the only file created |
| Typecheck | `npm run typecheck` — **exit 0, 0 errors** |
| Mobile tests | `npx jest --ci` — **27 suites, 520 tests, 0 failures** |
| Backend tests | not re-run (unchanged since the production-readiness audit: 54/54) |
| Builds | **not run** — no build was requested or required for this audit |
| Migrations | **none created, none applied** |
| TestFlight | **no build cut, nothing submitted** |
| Audit document path | `Medilink/docs/QA_BUG_STATUS_AUDIT_2026-08-11.md` |

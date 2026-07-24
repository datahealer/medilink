# MediLink Mobile — QA Bug Investigation & Resolution Plan

**Date:** 2026-07-23 · **Build target:** iOS TestFlight · **Branch:** `runtime-rtl`
**Scope:** 20 issues from the first manual QA round. **Investigation only — no code changed.**
**Method:** four parallel read-only investigators, each grounding findings in exact `file:line` and cross-referencing [`TESTFLIGHT_QA_CHECKLIST.md`](./TESTFLIGHT_QA_CHECKLIST.md).

Verdict legend: 🐞 real code bug · ⚠ backend/config/deploy · ⛔ product decision · ✅ expected/working · 💡 UX improvement · 🧩 missing feature

---

## Executive summary
- **Genuine code bugs (8):** #2, #5, #8, #12 (count), #13, #16, #17, #18 (copy)
- **Backend / config / deployment, no app-code fix (6):** #4, #6, #9, #12 (test-data), #15, #19
- **Product decisions (3):** #3 (design), #7, #16 (should it exist)
- **Expected / working as designed (4):** #1 is UX-improvement (not a defect), #10, #11, #20

### ⚠️ Corrections to the previous QA audit (it was wrong on 4 rows — don't act on false premises)
| Prior audit claim | Verified reality |
|---|---|
| #4 Forgot-password **BLOCKED** (no deep link) | **Code-complete OTP recovery flow** exists; only needs a Supabase email-template setting |
| BOOK-04 Emergency toggle **✅ exists** | **Never built** in the mobile UI — only the backend field exists (see #16) |
| AI-03 Symptom checker = **static demo transcript** | It's a **live input** forwarding to the real recommendations endpoint (see #20) |
| AUTH-09 Email OTP = **✅ real backend** | Supabase-direct; **depends on SMTP + template config** (see #6) |

*(These 4 rows in `TESTFLIGHT_QA_CHECKLIST.md` should be corrected.)*

---

## Master findings table

| # | Issue | Verdict | Root cause (key file:line) | Deps | Effort | Priority |
|---|---|---|---|---|---|---|
| 9 | Past slots bookable | 🐞 backend | `get_available_slots` filters by **date only**, never time-of-day for today — `supabase/migrations/20260717000001_booking_window_guard.sql:185`; `book_appointment_atomic` write guard same (lines 83-84) | db:push | Small | **Critical** |
| 6 | Email OTP: no email | ⚠ backend-config | Supabase-direct `signInWithOtp` — `shared/src/api/auth.ts:76-82`; needs SMTP + Magic-Link template `{{ .Token }}`; `shouldCreateUser:false` sends nothing to non-users | Supabase SMTP+template | Config | **Critical** |
| 8 | Specialty filter empty | 🐞 real | case-sensitive `.eq("specialty", name)` vs freetext column — `shared/src/api/doctors.ts:25`; name passed as filter — `search/filters.tsx:68`, `search/specialties.tsx:33-36` | data hygiene | Small (ilike) / Large (FK) | **High** |
| 13 | Only 20 doctors, no paging | 🐞 real | hardcoded `limit ?? 20` — `shared/src/api/doctors.ts:28-30`; `useDoctors` is plain `useQuery` (`hooks/queries/useDoctors.ts:14-19`); no infinite scroll in `search.tsx:118`; favourites-first not implemented | none | Medium | **High** |
| 17 | Keyboard hides controls | 🐞 real | `src/components/ui/Screen.tsx:90-93` `KeyboardAvoidingView` `behavior:undefined` on Android + `edgeToEdgeEnabled` (app.json) + no `softwareKeyboardLayoutMode`; single shared wrapper (centralized fix) | none | Medium | **High** |
| 15 | Map "No clinics nearby" | ⚠ deploy/data | `facilities.location` NULL (never geocoded); RPC `get_nearby_facilities` requires `location IS NOT NULL` — `20260723000000_nearby_facilities_coords.sql:63`; code path correct (`map.tsx`, `real/index.ts:566-575`) | migrations + geocode fn + data | Backend | **High** |
| 4 | Forgot-password OTP flow | ⚠ backend-config | Flow already coded: `auth/forgot-password.tsx:36-46` → `auth/otp.tsx` (recovery) → `auth/reset-password.tsx:41`; Supabase **Reset Password** template must emit `{{ .Token }}` | Supabase template+SMTP | Small/config | **High** |
| 12 | Featured clinics count/missing | 🐞+⚠ | doctor count = `f.doctors.length` from `doctors!inner` filtered by RLS `doctors_public_read USING (is_active=TRUE)` → undercount — `real/index.ts:527`; "45test" hidden by `.eq("is_verified",true)`/`.eq("status","active")` — `facilities.ts:22-23`; "featured" is hardcoded `featured:true` (`real/index.ts:529`), not a real flag | test-data flags | Medium | Medium-High |
| 16 | Emergency toggle missing | 🐞 gap / ⛔ product | **Never built** in UI — no emergency control in `booking/[doctorId]/review.tsx` or `schedule.tsx`; payload omits it (`real/index.ts:391-399`). Backend ready: `is_emergency` col, `p_is_emergency` RPC param, `bookAppointment` supports it (`shared/src/api/appointments.ts:68,85`) | none | Small | Medium |
| 5 | Same-password → "Unexpected Error" | 🐞 real | `toMessageKey` has no branch for Supabase `same_password` (422) → falls through to `errors.unknown` — `src/services/authService.ts:77`; rendered at `reset-password.tsx:51` | none | Small | Medium |
| 14 | No clinic search | 🧩 missing | no text-search fn in `shared/src/api/facilities.ts` (only `listFacilities`/`getFacility`/geo); no clinic mode in `search.tsx` | none | Medium | Medium |
| 2 | Blood group free-text | 🐞 inconsistency | `setup.tsx:125-133` free-text; but `edit-profile.tsx:200-213` **already** a Chip selector over `BLOOD_GROUPS` — copy that pattern | none | Small | Medium |
| 1 | DOB input UX | 💡 UX gap | free-text, no picker, no date lib installed — `edit-profile.tsx:216-224`, `setup.tsx:101-109`, `family/add.tsx:108-115`, `family/[id].tsx:154-161`; validator `validation.ts:31-40` expects `YYYY-MM-DD` | none | Medium | Medium |
| 3 | Emergency contact validation | 🐞+⛔ | zero validation (no validator/keyboardType/maxLength) — `edit-profile.tsx:293-298`, `setup.tsx:156-161`; field designed as "Name · phone" freetext (placeholder `en.ts:434`) — needs product call | none | Small–Med | Medium |
| 18 | AI Assistant → "No symptom" | 🐞 copy/IA | empty AI result mislabeled `aiRecommend.needSymptomsTitle` ("No symptoms yet") — `ai/recommendations.tsx:86-87`; meHub direct entry passes no `symptoms` param — `me.tsx:71`. Nav itself is correct (`assistant.tsx:28` → recommendations) | AI route live | Small | Medium |
| 7 | Guest mode too limited | ⛔ product | Maps **already** guest-accessible (`_layout.tsx:21-33` allow-list incl. `search/map`); all AI walled. "AI once before login" needs anon backend — `apiFetch` attaches bearer only if session exists (`api.ts:46,55`) → guest = 401 | backend (for AI) | Backend | Low |
| 19 | Visit summary untestable | ⚠ backend-data | needs `generate-health-insights` edge fn to write `appointments.patient_summary` on a completed appt; client correct — `ai/insights.tsx:23`, `real/index.ts:1111-1128` | edge fn + data | Backend | Low |
| 10 | Push notifications | ✅ working | registration/upsert/tap-routing all correct — `services/push.ts:28-101`, `usePushNotifications.ts:14-62`. Minor: no token-rotation listener | device_tokens+APNs | none | Low |
| 11 | Offline reconnect lag | ✅ expected | NetInfo `isInternetReachable` probe latency, flaky in **Expo Go** — `providers/QueryProvider.tsx:30-34`; wiring correct; offline is read-only by design (mutations `retry:0`) | none | none | Low |
| 20 | Symptom checker "not working" | ⛔ by design | live input forwarding to recommendations, not a chatbot — `ai/assistant.tsx:26-29`; only intro bubble/disclaimer are static | AI route live | none | Low |

---

## Detailed root causes

### #9 — Past time slots bookable (Critical)
At 12:30 PM the app offered a 9:30 AM slot for today. `get_available_slots` (latest def, `20260717000001_booking_window_guard.sql:150-239`) clamps only by date (`p_date < CURRENT_DATE …`, line 185) and returns the whole weekly template minus booked slots — it never compares `start_time` to `CURRENT_TIME`. The write guard `book_appointment_atomic` (same file) also only checks the date range, so past-time slots are even bookable server-side. **Fix:** add `AND (p_date > CURRENT_DATE OR a.start_time > CURRENT_TIME)` (Asia/Muscat-aware) to the RPC; `db:push`. Optional client stopgap: filter when `dateId === today`.

### #6 — Email OTP login: no email (Critical, config)
`sign-in.tsx:57` → `repositories.auth.sendLoginOtp` → `authService.ts:134` → `shared/src/api/auth.ts:76-82` `db.auth.signInWithOtp({ email, options:{ shouldCreateUser:false } })` — **Supabase-direct** (does NOT use the backend `/api/auth/send-otp`, which is an unwired SMS path). No email arrives when: (1) no custom **SMTP** configured (built-in is throttled/none), (2) the **Magic Link** template lacks `{{ .Token }}` so no 6-digit code is delivered, or (3) testing with an unregistered email — `shouldCreateUser:false` sends nothing by design. **Fix:** Supabase config only (SMTP + template). No mobile code change.

### #8 — Specialty filter returns nothing (High)
`filters.tsx:68`/`specialties.tsx:33-36` set the filter to the specialty **display name**; `shared/src/api/doctors.ts:25` does `query.eq("specialty", q.specialty)` — exact, case-sensitive equality against the **uncurated freetext** `doctors.specialty` column (`20260319071603_hams_complete_schema.sql:480`). Any variant (`"cardiology"`, `"Cardiologist"`, trailing space, Arabic) never matches. The specialties seed migration documents this gap. **Fix:** interim `.ilike`/normalize on trimmed value or match a slug (Small); proper fix is a `doctors.specialty_id` FK + backfill (Backend).

### #13 — Doctor search capped at 20 (High)
`shared/src/api/doctors.ts:28-30` `const limit = q.limit ?? 20; query.range(...)`; `real/index.ts:680-683` never passes `limit/offset`; `useDoctors` is a plain `useQuery` (not `useInfiniteQuery`); `search.tsx:118` maps results with no load-more. Favourites-first isn't implemented (search never consults `api.favourites`). **Fix:** `useInfiniteQuery` + thread `limit/offset` (already supported by `searchDoctors`) + favourites ordering/merge.

### #17 — Keyboard hides lower controls (High)
Single shared wrapper `src/components/ui/Screen.tsx` used by every form screen, but `behavior={Platform.select({ ios:"padding", android: undefined })}` (`:90-93`) disables KAV on Android; combined with `edgeToEdgeEnabled:true` (app.json) and no `softwareKeyboardLayoutMode`, the IME overlays footer controls (Save/Finish/Add/Send) and lower inputs. Most affected: `ai/assistant.tsx` (input+submit in footer), `edit-profile`, `setup`, `family/add|[id]`, `booking/review`, `rate`, `medical-history`, and all auth screens. **Fix (centralized in `Screen.tsx`):** set an Android behavior + `keyboardVerticalOffset`, or adopt `react-native-keyboard-controller` (recommended for SDK 54 edge-to-edge).

### #15 — Map empty (High, deploy/data)
`map.tsx:28` uses a **fixed Muscat center** → `useNearbyClinics` → `real/index.ts:566-575` → RPC `get_nearby_facilities`, which requires `f.location IS NOT NULL` + `is_verified` + `status='active'` + `EXISTS(doctors)` (`20260723000000_nearby_facilities_coords.sql:38-74`). `facilities.location` is written only by `set_facility_geocode` via the `geocode-facility` edge function. If facilities aren't geocoded on live, zero rows → "No clinics nearby". **Not a code bug.** Chain: (1) migrations pushed, (2) edge fn deployed + facilities geocoded, (3) device GPS **not** required. Optional Small enhancement: center on device GPS via `expo-location`.

### #4 — Forgot-password OTP (High, config; ALREADY CODED)
Full flow exists: `forgot-password.tsx:36-46` (requests recovery code, routes to `/auth/otp` `flow:"recovery"`) → `otp.tsx` verifies via `verifyOtp(type:"recovery")` (`shared/src/api/auth.ts:45-56`) → `reset-password.tsx:41` `updateUser({password})`. It matches the requested "email OTP → enter code → new password" exactly, no deep link. **Only dependency:** Supabase **Reset Password** template must include `{{ .Token }}` (default ships only the magic link) + working SMTP (shared with #6). The `CLAUDE.md` "BLOCKED" note is stale.

### #12 — Featured clinics (Medium-High)
Two problems: (1) **wrong count** — `real/index.ts:527` uses `f.doctors.length` from the `doctors!inner(id)` embed, which is subject to RLS `doctors_public_read USING (is_active=TRUE)` (`20260319071603_hams_complete_schema.sql:569`), so it counts only active doctors; (2) **"45test" excluded** — `facilities.ts:22-23` filters `.eq("is_verified",true)`/`.eq("status","active")`, so an unverified/inactive clinic never appears. "Featured" isn't a real flag — `mapFacilityToClinic` hardcodes `featured:true`; it just means the first 6 active+verified facilities by rating. **Fix:** count total doctors without the `is_active` filter (aggregate/RPC); set correct verification flags on test clinics; define real curation if wanted.

### #16 — Emergency toggle (Medium; needs product call)
Grep of `mobile/` for emergency booking found **zero** UI — `review.tsx`/`schedule.tsx` have no toggle/switch; the payload omits `isEmergency` (`real/index.ts:391-399`). The tester typed "Heart Attack" into `reason` because that's the only field. Backend is fully ready (`is_emergency` column, `p_is_emergency` param, `bookAppointment` support, a `create_emergency_appointment` RPC). **Fix (if product wants it):** add toggle → `bookingStore` → pass `isEmergency` through the already-wired path (Small).

### #5 — Same-password error mapping (Medium)
`updateUser({password})` with the old password throws Supabase 422 `same_password` ("New password should be different from the old password."). `toMessageKey` (`authService.ts:47-78`) has no matching branch → returns `errors.unknown` (`:77`) → UI shows "Unexpected error." **Fix:** add a branch (e.g. `msg.includes("should be different") → "errors.samePassword"`) + a `samePassword` string in `en.ts`/`ar.ts`.

### #14 — Clinic search (Medium)
No free-text clinic search at any layer — `facilities.ts` has only `listFacilities`/`getFacility`/geo RPCs; `search.tsx` is doctor-only; the only clinic text filter is client-side over the map's already-loaded nearby set (`map.tsx:32-39`). **Fix:** add `searchFacilities(term)` (RLS-safe `ilike` on `name`) + a clinic tab/mode + repo method.

### #2 — Blood group (Medium; quick win)
Inconsistent: `edit-profile.tsx:200-213` already uses a proper `Chip` selector over `BLOOD_GROUPS`; `setup.tsx:125-133` is free-text (`maxLength:3`, cast `as BloodGroup`), allowing invalid values. **Fix:** copy the chip block into `setup.tsx`. No dropdown component exists, but Chip rows are the codebase convention for enum input.

### #1 — DOB input (Medium; UX)
Free-text `YYYY-MM-DD` across `edit-profile`, `setup`, `family/add`, `family/[id]`; no date-picker library installed. Family DOB has no validation at all. **Options:** native picker `@react-native-community/datetimepicker` + a `DateField` wrapper (best UX; formats to `YYYY-MM-DD` so validators/API unchanged), or auto-separator masked text (no new dep).

### #3 — Emergency contact validation (Medium; needs product call)
`edit-profile.tsx:293-298`/`setup.tsx:156-161`: no validator, no `keyboardType`, no `maxLength`, saved raw; not in the save gate. Contrast the real phone path: `isValidOmanPhone` = `/^[0-9]{8}$/` + `PhoneField` `phone-pad`/`maxLength:8`. Field placeholder is "Name · +968 …" — designed as combined freetext. **Decision needed:** phone-only (strict validator) vs. keep name+phone (parse strategy).

### #18 — AI Assistant nav / "No symptom" (Medium)
Nav is correct: dashboard "Me Assistant" → `/ai/assistant` (symptom input) → `/ai/recommendations?symptoms=…` (`assistant.tsx:28`, read at `recommendations.tsx:22`). Two causes of "No symptoms yet": (1) the meHub row "AI Doctor Recommendations" opens `/ai/recommendations` with **no** param → `!entered` branch renders `needSymptomsTitle` (`me.tsx:71`, `recommendations.tsx:56-68`); (2) a zero-result/error AI response is **mislabeled** as `needSymptomsTitle` even when symptoms were provided (`recommendations.tsx:86-87`). **Fix:** distinct "no matches" empty-state copy; relabel/hide the direct meHub entry.

### #7 — Guest mode (Low; product)
Allow-list (`_layout.tsx:21-33`) already grants guests: dashboard, search, doctor profiles, specialties, **maps**, filters, appearance, guest "Me" hub. All AI + booking/records/payments/etc. are walled. Enabling AI for guests is blocked by one fact: `apiFetch` attaches a bearer token only if a session exists (`api.ts:46,55`) → guest AI call = **401**. "AI once before login" therefore needs a backend change (anon-allowed, rate-limited route) or an anonymous Supabase session — not just an allow-list edit. **Recommendation:** enable Symptom Checker + Recommendations for guests (low-risk, no PHI, high conversion) behind that backend change; keep Insights (PHI) walled; surface a Maps entry for guests (already accessible).

### #19 — Visit summary (Low; needs data)
`ai/insights.tsx:23` → `latestVisitSummary()` reads `appointments.patient_summary WHERE ai_generated=true` (`real/index.ts:1111-1128`); returns null until the `generate-health-insights` edge fn processes a completed appointment. Untestable = no such data for the test patient. Client is done; the vitals-trend chart is intentionally omitted (no vitals source).

### #10 — Push (Low; working)
Verified correct: token registration + `device_tokens` upsert (`push.ts:28-74`), auth-triggered sync + cold-start tap routing (`usePushNotifications.ts:14-62`), sign-out cleanup (`push.ts:89-101`). Minor non-blocking gaps: no Expo token-rotation listener; re-hits permission API on sign-out. Deps: `device_tokens` table + APNs + physical device.

### #11 — Offline (Low; expected)
NetInfo → `onlineManager` single source (`QueryProvider.tsx:30-34`), persisted cache (24h) + `refetchOnReconnect:true`. The reconnect delay is `isInternetReachable`'s reachability probe (waits for confirmed connectivity) and is known-flaky in **Expo Go**. No implementation defect; retest on a standalone build. Offline is read-only by design (mutations `retry:0`).

### #20 — Symptom checker (Low; by design)
`ai/assistant.tsx:26-29` is a live input + example chips that forward typed symptoms to the real recommendations endpoint; it is not multi-turn chat and shows the "answer" (doctor list) on the next screen. Perceived as "not working" by a tester expecting a chatbot. Making it a true chat = Large + backend.

---

## Recommended implementation plan (grouped, ordered)

### GROUP 0 — Backend/Supabase config & deployment (do FIRST; unblocks testing)
1. **#6 + #4:** Supabase → Auth: configure **custom SMTP**; edit **Magic Link** and **Reset Password** templates to include `{{ .Token }}`. Fixes email-OTP login **and** forgot-password OTP together.
2. **#9:** Add time-of-day guard to `get_available_slots` (+ `book_appointment_atomic`), Asia/Muscat; `db:push`.
3. **#15:** Apply the 3 pending migrations, deploy `geocode-facility`, run geocoding so `facilities.location` is populated.
4. **#12 (data) / #19:** Set correct `is_verified`/`status` on test clinics; generate ≥1 AI visit summary on a completed appointment.

### GROUP 1 — Discovery & Search (one cohesive PR: `shared/api/doctors.ts`, `facilities.ts`, `search.tsx`, `real/index.ts`)
5. **#8** specialty filter → normalize (`ilike`/trim) or slug (interim); FK later.
6. **#13** doctor pagination → `useInfiniteQuery` + `limit/offset` + favourites-first.
7. **#12 (count)** → total doctor count without the `is_active` RLS filter.
8. **#14** clinic search → `searchFacilities(term)` + clinic tab/mode.

### GROUP 2 — Forms & validation (client)
9. **#17 keyboard** — single fix in `Screen.tsx` (highest impact).
10. **#2 blood group** — reuse the Chip selector in `setup.tsx` (quick win).
11. **#3 emergency contact** — after product decision: validator + `keyboardType`.
12. **#1 DOB** — `DateField` (native picker) across the 4 screens.
13. **#5 password error** — `toMessageKey` branch + `errors.samePassword` (en/ar).

### GROUP 3 — Booking & AI UX (client)
14. **#16 emergency toggle** — if product wants it: toggle → `bookingStore` → `isEmergency`.
15. **#18 AI copy/IA** — distinct "no matches" empty-state; relabel/hide direct meHub recommendations entry.

### GROUP 4 — Verify / no action
16. **#10** push (optional token-rotation hardening), **#11** offline (retest on standalone build), **#20** symptom checker (consider renaming to set expectations).

---

## ❓ Product decisions required before Group 2/3
1. **#3 Emergency contact** — phone-only (strict) or the current "Name · phone" combined field?
2. **#16 Emergency booking** — expose a patient-facing emergency toggle at all? (Backend supports it; UI was never built.)
3. **#7 Guest AI** — enable Symptom Checker + Recommendations for guests? (Requires a backend anon/rate-limited route — not just an allow-list edit.)
4. **#1 DOB** — native date picker (new dependency, best UX) vs. auto-separator masked text (no dependency)?

## Dependency summary
- **Supabase config:** SMTP + email templates (`{{ .Token }}`) → #4, #6
- **`db:push`:** slot time-guard RPC → #9; 3 pending migrations → #15
- **Edge functions + data:** `geocode-facility` + geocoding → #15; `generate-health-insights` → #19
- **Test-data/admin:** clinic `is_verified`/`status`, doctor `is_active` → #12
- **Backend route change:** anon AI route → #7 (only if pursued)

## Priority roll-up
- **Critical:** #9, #6
- **High:** #8, #13, #17, #15, #4
- **Medium:** #12, #16, #5, #14, #2, #1, #3, #18
- **Low / no-action:** #7, #19, #10, #11, #20

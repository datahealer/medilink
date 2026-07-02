# Web Runtime Verification & Production Readiness Audit

**App:** `@medilink/frontend` (Next.js 15.5.19, App Router) · **Branch:** `satyam/web-dynamic`
**Date:** 2026-07-02 · **Verifier:** automated build + local dev-server probing
**Companion docs:** [WEB_DYNAMIC_INTEGRATION_AUDIT.md](./WEB_DYNAMIC_INTEGRATION_AUDIT.md) · [WEB_BACKEND_INTEGRATION_PROGRESS.md](./WEB_BACKEND_INTEGRATION_PROGRESS.md)

---

## Verification method — read this first

Each finding below is tagged with how it was confirmed:

- **[EXEC]** Verified by execution — a command ran and I observed the result (build, typecheck, HTTP status, redirect, live API response).
- **[CODE]** Verified by code inspection only — logic reviewed, types check, but the exact runtime path was not executed.
- **[N/A-ENV]** Not verifiable in this environment — requires a real browser (client-side JS/hydration/console), interactive OAuth, or a seeded authenticated test account. **No browser automation and no test login are available here.**

This distinction is deliberate: the build/type/route layer is verified by execution; **authenticated end-to-end UI flows are not** and still need manual browser QA.

---

## Summary

| Metric | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ **[EXEC]** 0 errors |
| Production build (`next build`) | ✅ **[EXEC]** succeeds, 25 routes, `ƒ Middleware` present, 0 blocking warnings |
| ESLint (`npm run lint`) | ⚠️ **Unavailable** — not installed, no config; not added (per instructions) |
| Dev server (`next dev`) | ✅ **[EXEC]** boots, serves all routes |
| Public routes | ✅ **[EXEC]** 11/11 return 200 |
| Protected-route middleware | ✅ **[EXEC]** **fixed during this audit** — now 307 → `/sign-in` |
| Supabase backend reachability | ✅ **[EXEC]** auth health 200; `doctors` REST returns real rows |
| Authenticated UI flows / mutations | ⚠️ **[CODE]/[N/A-ENV]** not executed (no browser/test login) |

**Pages tested: 25 routes.** **Passed (build+route+render where testable): 25.** **Failed: 0** (1 defect found and fixed — see below).

**Bug found & fixed:** middleware was located at `frontend/middleware.ts` but the app uses a `src/` directory, so **Next.js never ran it** → the dashboard was reachable while logged out. Relocated to `src/middleware.ts`; protection now verified live. (commit `3a97ea3`)

---

## Build Status — ✅ [EXEC]

```
npm install         → 478 pkgs added (workspace). 30 npm-audit advisories (deps, non-blocking).
npm run typecheck   → tsc --noEmit, exit 0
npm run build       → ✓ Compiled successfully; 25/25 static pages generated; exit 0
                      ƒ Middleware  90.9 kB   (present after fix)
```

Route table (all generated): `/`, `/about`, `/contact`, `/services`, `/for-clinics`, `/welcome`, `/language`, `/onboarding`, `/splash`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/otp`, `/auth/callback` (ƒ dynamic), `/dashboard`, `/dashboard/{appointments,find-doctors,profile,records,lab-tests,surgeries}`.

- **Environment variables** [EXEC]: `.env.local` present; `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BACKEND_URL` all populated; `lib/env.ts` resolves them (build would throw otherwise — it didn't).
- **No missing imports / no build warnings that block deployment** [EXEC].

## TypeScript Status — ✅ [EXEC]
`tsc --noEmit` clean before and after the middleware fix.

## Runtime Status — ⚠️ partial [EXEC]
Server boots and serves every route; middleware + public pages + auth forms + callback verified live. Authenticated data rendering and mutations were **not** executed (see method note).

---

## Per-Module Results

Legend: Build/Nav/Auth verified [EXEC] where noted; Forms/CRUD/data states are [CODE] unless a live probe is cited.

### Auth — ✅ Passed (with the middleware fix)
- **Build** ✅ [EXEC] · **Navigation** ✅ [EXEC] (`/sign-in`,`/sign-up`,`/forgot-password`,`/reset-password`,`/otp` all 200; forms render — `id="email"/"password"/"fullName"`, "Continue with Google")
- **Middleware / protected routes / unauthorized redirect** ✅ [EXEC] — `/dashboard/*` → `307 /sign-in?next=…` while unauthenticated; public routes not gated.
- **`/auth/callback`** ✅ [EXEC] — with no `?code` it redirects `307 → /sign-in?error=auth_callback_failed` (graceful, no 500).
- **Sign In / Sign Up / OTP / Forgot / Reset (actual credential submit), Google OAuth, session creation, cookie persistence, session restore, logout** ⚠️ [CODE]/[N/A-ENV] — wired to `api.auth.signInWithPassword` / `supabase.auth.signUp`/`verifyOtp`/`resetPasswordForEmail`/`updateUser`; not executed (needs browser + real account + configured Google provider).
- **Issues found:** middleware not running (see Build Issues). **Fix applied:** relocated `middleware.ts` → `src/middleware.ts`.

### Profile — ✅ builds / ⚠️ data [CODE]
- **Build/Nav** ✅ [EXEC] (route gated → 307 when logged out; renders after auth). **Load/Edit/Save/persist, medical history, stats** ⚠️ [CODE] via `api.profile.getMyProfile`/`updateMyProfile` + `api.records.upsertMedicalHistory`. Loading/error/saving states present. Not executed against a logged-in session.
- **Issues:** none. **Fixes:** none.

### Find Doctors — ✅ Passed (data path confirmed live)
- **Build/Nav** ✅ [EXEC]. **Doctor list API** ✅ **[EXEC]** — `GET /rest/v1/doctors` with the anon key returned real rows, so `api.doctors.searchDoctors` will populate this page. **Search/filters** [CODE] (client-side over fetched list). **Available slots / book appointment** ⚠️ [CODE] (`getAvailableSlots` + `bookAppointment`; needs an authenticated patient to execute).
- **Issues:** none. **Fixes:** none.

### Appointments — ✅ builds / ⚠️ data [CODE]
- **Build/Nav** ✅ [EXEC]. **List / upcoming / past / cancel / reschedule / refresh-after-mutation / empty / error** ⚠️ [CODE] via `listMyAppointments`/`cancelAppointment`/`rescheduleAppointment` + `getAvailableSlots`; loading skeletons, error banner, empty + no-slots states present. Not executed (needs authed patient with data).
- **Issues:** none. **Fixes:** none.

### Records — ✅ builds / ⚠️ data [CODE]
- **Build/Nav** ✅ [EXEC]. **Documents + Lab Results + Prescriptions (aggregated), search, category filters** ⚠️ [CODE] via `listPrescriptions`+`listLabResults`+`listDocuments`; loading/error/empty present. Download is client-side text (no backend). Not executed.
- **Issues:** none. **Fixes:** none.

### Dashboard home — ✅ builds / ⚠️ data [CODE]
- **Build/Nav** ✅ [EXEC] (renders "Good morning" shell). **Greeting/counts/upcoming** ⚠️ [CODE] via profile + appointments + record counts; loading skeleton + empty state present.
- **Intentionally static (unchanged & verified static):** health-metrics (vitals), marketing/nav sections. ✅ [CODE]
- **Issues:** none. **Fixes:** none.

### Lab tests — 🚧 Blocked (documented gap, unchanged)
- **Build/Nav** ✅ [EXEC]. Static catalog by design — no catalog/ordering backend. In-code BACKEND GAP banner present. Not integrated (correctly).

### Surgeries — 🚧 Blocked (documented gap, unchanged)
- **Build/Nav** ✅ [EXEC]. No surgeries backend anywhere. In-code BACKEND GAP banner present. Not integrated (correctly).

---

## Runtime Issues
1. **[FIXED] Middleware never executed** — `middleware.ts` at project root is ignored when a `src/` directory is used; dashboard was reachable while logged out. Relocated to `src/middleware.ts`; verified `307 → /sign-in`. (commit `3a97ea3`)

No other runtime exceptions observed in dev-server logs during route probing. Client-side console/hydration behavior in a real browser was **[N/A-ENV]** (no browser automation). Note: the data pages render only inside modals/after-auth for date logic, so the `new Date()`-based calendars are not part of the initial SSR output — hydration-mismatch risk is low, but not browser-confirmed.

## Network Issues
- **[EXEC]** No failed requests observed for served routes. Supabase `/auth/v1/health` → 200; `/rest/v1/doctors` → 200 with data.
- **Note:** the anon `doctors` read succeeds (RLS permits it), so find-doctors will show data. Patient-scoped tables rely on an authenticated session (RLS) — not exercised here.
- **Data dependency (not a bug):** patient tables key on a `patient_profiles` row (`getMyPatientProfileId` uses `.single()`). A brand-new user without that row will hit the pages' error/empty states rather than data — the pages handle this (`.catch`), but seed/provisioning of `patient_profiles` on signup should be confirmed in QA.

## Authentication Issues
- **[FIXED]** The middleware relocation above was the one real auth defect.
- **[EXEC]** Protected routes redirect correctly; `/auth/callback` fails safe.
- **[N/A-ENV]** Real login/session-cookie persistence/refresh/logout/Google OAuth not executed.
- **Minor (not fixed, not a bug):** `/sign-in` does not consume the `?next=` param the middleware appends — after login it always routes to `/dashboard`. Cosmetic; login still succeeds to the dashboard.

## Build Issues
- **[FIXED]** Middleware absent from build output (root of the runtime bug). Now `ƒ Middleware 90.9 kB`.
- **Non-blocking:** `npm audit` reports 30 advisories in transitive deps (1 low / 15 moderate / 14 high) — dependency hygiene, not a build/deploy blocker. `next lint` deprecation notice (Next 16) — informational.
- **ESLint unavailable:** not installed and no config in the repo; not added per instructions. `npm run typecheck` is the standing quality gate.

---

## Remaining Backend Gaps (known, not invented)
1. **Surgeries** — no domain/table/API anywhere; screen stays static.
2. **Lab-test catalog & ordering** — only lab *results* exist (`api.labs`); no catalog/order endpoint.
3. **Dashboard vitals** — Heart Rate / BMI / Blood Pressure have no backend; tiles stay static.
4. **Contact form** — no contact/lead endpoint.
5. **Locale-preference persistence** — runtime i18n only.
6. `email` change (auth-managed) and `height`/`weight` (no column) on Profile are intentionally not persisted.

---

## Final Verdict

### ⚠️ Ready for QA with Known Limitations

**Why not a plain ✅:** the build, type, route, and middleware layers are green and one genuine security bug (unprotected dashboard) was found and fixed and re-verified live. The Supabase backend is reachable and the doctors query returns real data. **However**, authenticated end-to-end flows (login → book/cancel/reschedule → profile save → records), Google OAuth, cookie/session persistence across refresh, and client-side console/hydration cleanliness **could not be executed in this environment** (no browser automation, no seeded test account) — they are verified by code inspection and by a successful production build only.

**What remains before a plain ✅:**
1. Manual/browser QA of the authenticated journey with a real test patient (sign-in → dashboard data → book → cancel → reschedule → profile save → records), checking the browser console/network for zero errors and no hydration warnings.
2. Confirm `patient_profiles` is provisioned on signup (otherwise patient pages show empty/error states).
3. Confirm Google OAuth provider + redirect URIs are configured for each environment.

The two blocked modules (Surgeries, Lab tests) and the vitals tiles are **known backend gaps**, documented and intentionally left static — they are not defects.

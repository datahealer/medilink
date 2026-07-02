# Web Backend Integration — Progress Tracker

**Branch:** `satyam/web-dynamic` · **Started:** 2026-07-02
**Architecture:** shared `api.*` layer (repository) → Supabase (RLS/RPC). **No React Query** (see audit §0).
**Companion doc:** [`WEB_DYNAMIC_INTEGRATION_AUDIT.md`](./WEB_DYNAMIC_INTEGRATION_AUDIT.md)

---

## Module status

| Module | Pages | Status | APIs Connected | Remaining | Notes |
|---|---:|---|---|---|---|
| Auth | 5 | ✅ | 5/5 | 0 | sign-in→`api.auth.signInWithPassword`+Google; sign-up→`supabase.auth.signUp`→OTP; middleware routes fixed |
| Profile | 1 | ❌ | 0/1 | 1 | `api.profile`, `api.family` |
| Find Doctors | 1 | ❌ | 0/1 | 1 | `api.doctors`, `api.appointments`, `api.favourites` |
| Appointments | 1 | ❌ | 0/1 | 1 | `api.appointments.*` |
| Records | 1 | ❌ | 0/1 | 1 | `api.records`, `api.prescriptions`, `api.labs` |
| Dashboard home | 1 | ❌ | 0/1 | 1 | health-metrics = backend gap |
| Lab tests | 1 | ❌ | 0/1 | 1 | catalog/order backend missing |
| Surgeries | 1 | ❌ | 0/1 | 1 | **no backend** — deferred |
| Marketing (public) | 9 | 🟦 | n/a | 0 | static-by-design, out of scope |

**Backlog (data-bearing): 9 pages. Done: 3 (auth reset flows) + OAuth callback.**

---

## Per-module checklist (filled in as each module is completed)

Template per module: ☐ Correct API · ☐ Payload · ☐ Response mapping · ☐ Permissions · ☐ Loading · ☐ Error · ☐ Empty · ☐ Success · ☐ Cache/refresh after mutation · ☐ Search · ☐ Filters · ☐ Pagination · ☐ CRUD · ☐ `typecheck` · ☐ `lint` · ☐ UI unchanged

### 1. Auth — ✅ done (2026-07-02)
- **sign-in** → `api.auth.signInWithPassword(supabase, {email,password})`; Google via existing `signInWithGoogle()`; `router.refresh()` so middleware/SSR see the new session. Added loading + inline error box (styling copied from forgot-password — no layout change).
- **sign-up** → `supabase.auth.signUp({email,password,options:{data:{full_name,phone}}})` (shared api omits signUp by design; metadata feeds the `patient_profiles` provisioning trigger) → redirects to `/otp?email=`. Added loading + error box.
- **middleware** → fixed route mismatch: protects `/dashboard`, redirects to `/sign-in`; public prefixes now match the real `(auth)` routes.
- Checklist: ✅ API ✅ payload ✅ mapping ✅ loading ✅ error ✅ success ✅ UI unchanged ✅ typecheck. (search/filter/pagination/CRUD/empty = N/A for auth.)
- **Note:** ESLint is not installed/configured in this repo; `next lint` only offers interactive setup. Validation gate = `npm run typecheck` (green). Not adding ESLint (would be new tooling).
### 2. Profile — _not started_
### 3. Find Doctors — _not started_
### 4. Appointments — _not started_
### 5. Records — _not started_
### 6. Dashboard home — _not started_
### 7. Lab tests — _not started (blocked: catalog backend)_
### 8. Surgeries — _not started (blocked: no backend)_

---

## Documented backend gaps (not to be mocked)

- Surgeries domain (no schema/API)
- Lab-test catalog & ordering (only results retrieval exists)
- Dashboard vitals (heart rate / BMI / BP)
- Contact form endpoint
- Locale preference persistence

## Commit log

_(appended as modules land — format: `feat(web): integrate <module> module`)_

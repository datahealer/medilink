# MediLink API Audit Report

_Audit date: 2026-06-22 · Target: `http://localhost:3001` (Next.js API) + Supabase REST/RPC._
_Account used: existing test patient `testpatient1@example.com` (role `patient`). No service-role key was used; no secrets are printed in this report._

> **Architecture note.** MediLink has two API surfaces: (1) **Next.js backend routes** under `backend/src/app/api` (37 routes — privileged/heavy ops); (2) the **direct-Supabase data layer** in `shared/src/api/*` used by the web/mobile clients (doctors, facilities, profile, family, records, prescriptions, notifications, appointments, reviews). The clients call Supabase under RLS, **not** the backend routes — a `/api/` grep of `frontend/`, `mobile/`, `shared/` returns **zero** matches. Discovery/patient-data testing therefore targets Supabase REST directly; only privileged ops target `:3001`.

## Summary

| Category                           | Count |
| ---------------------------------- | ----: |
| Total discovered backend routes    |    37 |
| Tested successfully (executed)     |     8 backend routes + 17 Supabase REST data-layer reads |
| Tested and failed                  |     1 (data-layer feature: `notification_preferences`) |
| Missing routes                     |     3 backend routes (+2 missing DB objects) |
| Blocked / intentionally not tested |    29 |
| Potential bugs / security findings |     7 |

## Phase 1 — Route inventory (37 backend routes)

Legend — Safe: ✅ executed safely · 🔒 authz-only (no write) · ⛔ not executed (external/destructive/no test data). Result: ✅ pass · ⛔ blocked · — n/a.

| Method | Route | Auth | Role | Body/Query | External dep | Safe | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | /api/auth/signup | none | — | `{email,password,full_name?,phone?,role?}` | Supabase admin | ✅ validation only | ✅ 400/403 paths |
| POST | /api/auth/send-otp | session | patient | `{phone?}` | (SMS stubbed) | ⛔ writes otp_records | ⛔ |
| POST | /api/auth/resend-otp | session | any | `{phone}` | — | ⛔ writes + leaks OTP | ⛔ |
| POST | /api/auth/verify-otp | session | patient | `{code,phone?}` | — | ⛔ writes profiles | ⛔ |
| POST | /api/auth/set-password | token/session | — | `{password,token?,type?}` | INVITE_SECRET | ⛔ changes password | ⛔ |
| POST | /api/auth/session-log | session | any | none | — | code-inspected | ⛔ (writes audit) |
| POST | /api/auth/2fa/setup | session | **staff** | none | — | 🔒 | ✅ 403 for patient |
| POST | /api/auth/2fa/challenge | session | any | `{factorId}` | — | ⛔ MFA flow | ⛔ |
| POST | /api/auth/2fa/verify | session | any | `{factorId,challengeId,code}` | — | ⛔ MFA flow | ⛔ |
| POST | /api/auth/2fa/disable | session | any | `{code}` | — | ⛔ MFA flow | ⛔ |
| POST | /api/auth/2fa/recovery/generate | session | 2FA-on | none | — | ⛔ MFA flow | ⛔ |
| POST | /api/auth/2fa/recovery/use | session | any | `{recoveryCode}` | — | ⛔ MFA flow | ⛔ |
| GET | /api/auth/google | none | — | — | **Google OAuth** | ⛔ external | ⛔ |
| GET | /api/auth/google/callback | session | — | `?code` | **Google OAuth** | ⛔ external | ⛔ |
| POST | /api/appointments/[id]/google | AAL2 | patient | path `id` | **Google Calendar** | ⛔ external | ⛔ |
| POST | /api/notifications/push | header secret | — | `{userId,title,body,data?}` | **Expo push**, INVITE_SECRET | ⛔ external | ⛔ |
| GET | /api/patients/[id]/medical-history/pdf | AAL2 | patient+ | path `id` | Supabase storage | ✅ own data | ✅ 200 (url) / 403 others |
| POST | /api/patients/me/profile-photo | AAL2 | patient | multipart `file` | storage write | ⛔ writes storage | ⛔ |
| GET | /api/payments | AAL2 | patient | `?status` | — | ✅ | ✅ 200 `[]` |
| GET | /api/payments/unpaid | AAL2 | patient | — | — | ✅ | ✅ 200 `{appointments:[]}` |
| GET | /api/payments/get-appointment/[id] | AAL2 | patient | path `id` | — | ✅ | ✅ 404 (random id) |
| POST | /api/payments/checkout | AAL2 | patient | `{appointment_id,amount}` | **Thawani** | ⛔ payment | ⛔ |
| GET | /api/payments/[id]/invoice | **none** | — | path `id` | — | ⛔ (IDOR risk) | ⛔ inspected |
| POST | /api/payments/[id]/refund | AAL2 | patient | path `id` | **Thawani** | ⛔ refund | ⛔ |
| POST | /api/payments/webhook | none | gateway | Thawani payload | **Thawani signature** | ⛔ webhook | ⛔ |
| GET | /api/prescriptions/[id]/download | AAL2 | owner | path `id` | storage | ⛔ no test data | ⛔ |
| POST | /api/prescriptions/[id]/generate-pdf | AAL2 | **doctor** | path `id` | storage write | 🔒 | ✅ 403 for patient |
| GET | /api/prescriptions/[id]/share-link | AAL2 | owner | path `id` | — | ⛔ writes token on GET | ⛔ |
| DELETE | /api/users/me/account | AAL2 | patient | `{confirmation:"DELETE"}` | — | ⛔ destructive | ⛔ |
| POST | /api/users/me/account/cancel-deletion | AAL2 | patient | none | — | ⛔ needs pending state | ⛔ |
| GET | /api/users/me/data-export | AAL2 | patient | — | — | ✅ | ✅ 200 `{exports:[]}` |
| POST | /api/users/me/data-export | AAL2 | patient | none | Edge fn | ⛔ creates export | ⛔ |
| GET | /api/users/me/data-export/[id] | AAL2 | patient | path `id` | — | ⛔ no test data | ⛔ |
| POST | /api/ai/suggest-doctor | session | any | `{symptoms}` | **Groq** | ⛔ external | ⛔ |
| POST | /api/ai/symptom-check | **none** | — | `{symptoms,...}` | **Groq** | ⛔ external + no-auth | ⛔ |
| POST | /api/ai/schedule-assist | session | any | `{query,...}` | **Groq** | ⛔ external | ⛔ |
| POST | /api/ai/scan-prescription | session | any | multipart `image` | **Groq** | ⛔ external | ⛔ |

### Client → backend cross-reference
No `/api/...` calls exist in `frontend/src`, `mobile/src`, or `shared/src` (clients use the Supabase data layer). Backend-internal references to non-existent routes are reported under **Missing Routes**.

## Working APIs

| Method | Route | Test performed | Status | Notes |
| --- | --- | --- | --- | --- |
| POST | (Supabase) `/auth/v1/token?grant_type=password` | Patient login | 200 | Token acquired (anon key only) |
| POST | /api/auth/signup | Duplicate email | 400 | `Email already registered.` — no user created |
| POST | /api/auth/signup | Weak password | 400 | `At least 8 characters` — validation before write |
| POST | /api/auth/signup | `role:"doctor"` | 403 | `Only patients can register` — role guard |
| GET | /api/payments | No token / invalid token / valid | 401 / 401 / 200 | `[]`; auth mapping correct |
| GET | /api/payments/unpaid | Valid token | 200 | `{"appointments":[]}` |
| GET | /api/users/me/data-export | Valid token (list only) | 200 | `{"exports":[]}` |
| GET | /api/payments/get-appointment/{random} | Valid token | 404 | `Appointment not found` |
| GET | /api/patients/{ownProfileId}/medical-history/pdf | Own data | 200 | Returns `{url: …public report…}` |
| POST | /api/auth/2fa/setup | Patient token | 403 | Staff-only guard fires before any enroll |
| POST | /api/prescriptions/{id}/generate-pdf | Patient token | 403 | Doctor-only guard fires before any write |
| GET | (REST) doctors list / detail / availability | `doctors`, `doctor_availability` | 200 | 89 doctors visible (public read) |
| GET | (REST) facilities list / detail | `facilities` | 200 | active+verified rows |
| GET | (REST) reviews (doctor, visible) | `reviews` | 200 | `[]` |
| GET | (REST) my `profiles` / `patient_profiles` | self | 200 | own rows only |
| GET | (REST) family_members / medical_histories / patient_documents / lab_results / prescriptions / appointments / in_app_notifications | self | 200 | all `[]` for fresh account |
| PATCH | (REST) profiles `full_name` (update + restore) | own row | 200 | reversible write verified, restored |

## Failed APIs

| Method | Route | Expected | Actual | HTTP | Root cause evidence | Severity |
| --- | --- | --- | --- | --: | --- | --- |
| GET | (REST) `notification_preferences` | 200 row/empty | PGRST205 "Could not find the table" | 404 | Table absent; referenced by [shared/src/api/notifications.ts](../shared/src/api/notifications.ts) `getPreferences/updatePreferences`. Prefs actually stored in `profiles.notification_prefs` (jsonb) | P2 |
| RPC | (REST) `get_nearby_facilities` / `get_nearby_branches` | function result | function does not exist | 404 | [shared/src/api/facilities.ts:54,68](../shared/src/api/facilities.ts) call these names; schema defines `nearby_facilities`/`nearby_branches` ([full_schema.sql:1864,3197](reference/full_schema.sql)) | P2 |

_No backend `:3001` route returned an incorrect failure during testing. (The earlier 500-instead-of-401 issue and the two `params` typing build errors were fixed in prior tasks; re-verified 401/403 here.)_

## Missing Routes

| Referenced from file | Expected route | Evidence | Impact |
| --- | --- | --- | --- |
| [backend/src/lib/supabase/browser.ts:50](../backend/src/lib/supabase/browser.ts), [client.ts:55](../backend/src/lib/supabase/client.ts) | `POST /api/auth/signout` | `fetch("/api/auth/signout", {method:"POST"})` in `signOut()` | Server-side session invalidation silently 404s (best-effort `try/catch`, browser still clears) |
| [backend/src/app/api/auth/set-password/route.ts:280](../backend/src/app/api/auth/set-password/route.ts) | `POST /api/notifications/admin-password-set` | runtime `fetch(${origin}/api/notifications/admin-password-set)` | Super-admin "password set" notification never delivered (fire-and-forget `.catch`) |
| [backend/src/app/api/auth/set-password/route.ts:84,152](../backend/src/app/api/auth/set-password/route.ts) | `POST /api/invitations/accept` | invite flow comments + `accept_doctor_invite` RPC dependency | Staff/doctor/technician invite-accept flow has no implemented route |
| (DB object) | table `public.notification_preferences` | PGRST205 at runtime | Notification settings read/write broken |
| (DB object) | RPC `get_nearby_facilities` / `get_nearby_branches` | 404 | Geo proximity search broken |

## Blocked / Not Tested

| Route | Reason | What is needed to test safely |
| --- | --- | --- |
| /api/payments/checkout, /api/payments/[id]/refund | Requires real Thawani credentials + would create payment/refund | Thawani sandbox keys + a disposable appointment in a sandbox project |
| /api/payments/webhook | Requires gateway webhook signature/payload | Thawani webhook simulator |
| /api/auth/google, /google/callback, /api/appointments/[id]/google | Google OAuth/Calendar | Google OAuth client + a connected calendar test account |
| /api/ai/suggest-doctor, /symptom-check, /schedule-assist, /scan-prescription | Groq provider (key empty; cost/abuse) | `GROQ_API_KEY` or a mock; symptom-check also lacks auth |
| /api/auth/send-otp, /resend-otp, /verify-otp | Modifies `otp_records`; resend leaks OTP | Run only in a sandbox; treat as security-sensitive |
| /api/notifications/push | Internal shared-secret + Expo push | `INVITE_SECRET` + Expo device token; server-to-server |
| /api/patients/me/profile-photo | Writes to storage bucket | Acceptable only with cleanup of uploaded object |
| /api/prescriptions/[id]/download, /share-link | Requires a test-owned prescription (none exist) | A prescription created by a doctor account for this patient |
| /api/prescriptions/[id]/generate-pdf | Doctor-only (authz verified 403); would persist a PDF | Doctor account + test prescription |
| /api/users/me/account (DELETE), /cancel-deletion | Destructive (soft-deletes account, cancels appts) | Disposable account; not the shared test patient |
| /api/users/me/data-export (POST), /data-export/[id] | Creates export request + invokes Edge function | Sandbox; accept generated artifact |
| /api/auth/2fa/* (challenge/verify/disable/recovery) | Would change MFA state | Explicit intent to enroll/disable 2FA |
| /api/auth/set-password | Changes a password / needs invite token | Disposable account or valid invite token + `INVITE_SECRET` |
| /api/auth/session-log | Writes audit log (harmless) | Could be enabled; left code-inspected |
| Appointment booking/cancel (RPC `book_appointment_atomic`/`cancel_appointment_safe`) | Writes real `appointments`, consumes a doctor slot; cancel has refund/notification side-effects (not cleanly reversible) | Sandbox project with disposable doctor/slot |

## Security / Authorization Findings

1. **P0 — Privilege escalation via `profiles.role` (RLS column gap).** Authenticated as the patient, a direct `PATCH /rest/v1/profiles?id=eq.<self>` with `{"role":"facility_admin"}` returned **200** and the role changed (verified by re-read, then restored to `patient`). Evidence: policy `profiles_update_own` uses `USING (id = auth.uid()) WITH CHECK (id = auth.uid())` with **no column restriction** ([full_schema.sql:169-172](reference/full_schema.sql)). A patient can self-assign `facility_admin`/`super_admin`, and likely `status`, `facility_id`. The signup route ([auth/signup/route.ts](../backend/src/app/api/auth/signup/route.ts)) and the `hams_handle_new_user` trigger force `role='patient'`, but RLS lets the client overwrite it afterwards. **This bypasses the entire role model.**
2. **P0/P1 — OTP disclosure & plaintext storage.** [auth/resend-otp/route.ts](../backend/src/app/api/auth/resend-otp/route.ts) returns `otp: code` in the JSON response; both send/resend store the raw code in `otp_records.hash` (no hashing). Code-inspected (not executed, to avoid writes).
3. **P1 — Unauthenticated invoice (IDOR).** [payments/[id]/invoice/route.ts](../backend/src/app/api/payments/[id]/invoice/route.ts) has no auth; any valid payment id → redirect to its `invoice_url`. Code-inspected.
4. **P1 — Unauthenticated AI endpoint.** [ai/symptom-check/route.ts](../backend/src/app/api/ai/symptom-check/route.ts) has no `getUser()` and no rate limit; also writes `symptom_check_logs` for anonymous callers. Code-inspected.
5. **P1 — OAuth tokens logged.** [auth/google/callback/route.ts](../backend/src/app/api/auth/google/callback/route.ts) `console.log("TOKEN DATA:", tokenData)` prints access/refresh tokens to server logs. Code-inspected.
6. **P2 — GET with side-effects.** [prescriptions/[id]/share-link/route.ts](../backend/src/app/api/prescriptions/[id]/share-link/route.ts) is a `GET` that writes `share_token` (CSRF/prefetch concern). Code-inspected.
7. **Positive: RLS isolation holds for patient data.** Cross-patient `patient_profiles` query returned `[]`; unfiltered `patient_profiles` returned only the caller's 1 row. `profiles`/`patient_profiles`/clinical tables are correctly self-scoped for SELECT. The break is specifically the **UPDATE** column gap in finding #1.

_Status codes observed were correct: 401 (no/invalid token), 403 (patient on staff/doctor route), 400 (validation), 404 (missing resource). No improper 500s were observed on tested routes._

## Test Data Created

| Record | ID | Action | Cleaned up? |
| --- | --- | --- | --- |
| `profiles.full_name` of test patient | `0ca03602-…` | Changed `Test Patient` → `Test Patient QA` | ✅ Restored to `Test Patient` (verified) |
| `profiles.role` of test patient | `0ca03602-…` | Changed `patient` → `facility_admin` (P0 probe) | ✅ Restored to `patient` (verified) |

No users were created. No appointments, payments, exports, prescriptions, uploads, OTPs, or notifications were created. No records belonging to other users were touched.

## Recommended Fix Priority

### P0 — Security / data exposure
- **Lock down `profiles` UPDATE RLS.** Prevent clients from updating privileged columns (`role`, `status`, `facility_id`). Either revoke column `UPDATE` privileges for `authenticated` on those columns, or add a `WITH CHECK` that pins `role`/`status` to their current values (enforce role changes only via service-role server routes). Re-test the escalation probe afterwards.
- **OTP handling:** stop returning the OTP in `resend-otp`; hash stored OTPs.

### P1 — Broken core patient flow / sensitive
- Add auth (+ rate limit) to `ai/symptom-check`; add auth to `payments/[id]/invoice`.
- Remove token `console.log` in `google/callback`.

### P2 — Missing route / frontend-backend / DB mismatch
- Implement or remove references to `/api/auth/signout`, `/api/notifications/admin-password-set`, `/api/invitations/accept`.
- Create the `notification_preferences` table (or repoint the data layer to `profiles.notification_prefs`).
- Fix RPC names in [shared/src/api/facilities.ts](../shared/src/api/facilities.ts): `get_nearby_facilities`→`nearby_facilities`, `get_nearby_branches`→`nearby_branches`.
- Convert `prescriptions/[id]/share-link` from GET to POST.

### P3 — Validation / status-code / DX
- AI routes (`symptom-check`, `scan-prescription`, `schedule-assist`) construct the Groq client at module load and throw on empty `GROQ_API_KEY` during `next build`; make construction lazy or honor `MOCK_AI`.
- Standardize response body shape (`{error}` vs `{success,error}`) across routes.

## Final Console Summary

```
WORKING: 8 backend routes + 17 Supabase REST reads
FAILED: 1 (notification_preferences data-layer feature; +1 nearby RPC mismatch)
MISSING: 3 routes (+2 missing DB objects)
BLOCKED: 29
SECURITY FINDINGS: 6 (1 P0 confirmed live, 5 code-inspected) + 1 positive
```

_Claims of "working" above were each executed against the running server or Supabase REST. Items marked “code-inspected” were not executed and are labeled as such._

# MediLink — Backend Modules Reference

Every functional module, where it lives, what it depends on, and the env vars it needs. "Module" spans two execution tiers:
- **Shared (direct Supabase)** — `shared/src/api/*`, run from web/mobile under RLS. No secrets.
- **Backend (Next.js API)** — `backend/src/app/api/**`, run server-side with secrets/service role.

> Source legend: **HAMS Reused** = migrated verbatim from the HAMS project; **MediLink Specific** = new to MediLink. Env vars are defined in [`.env.example`](../.env.example).

Common env vars (used by virtually everything):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (web) / `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (mobile) — public.
- `SUPABASE_SERVICE_ROLE_KEY` — **SECRET**, backend only (service-role client).

---

## 1. Auth
- **Purpose:** Sign-in/out, session, password reset (shared); signup, OTP, 2FA, Google OAuth, session logging (backend).
- **Source:** HAMS Reused.
- **Location:**
  - Shared: `shared/src/api/auth.ts` (`signInWithPassword`, `signOut`, `getSession`, `getUser`, `resetPasswordForEmail`, `updatePassword`, `onAuthStateChange`).
  - Backend: `backend/src/app/api/auth/*` — `signup`, `send-otp`, `resend-otp`, `verify-otp`, `set-password`, `session-log`, `google`, `google/callback`, `2fa/{setup,verify,challenge,disable,recovery/generate,recovery/use}`.
  - Libs: `backend/src/lib/auth/*`, `backend/src/lib/sms/sendOtp.ts`, `backend/src/lib/supabase/{server,service,adminClient}.ts`.
- **Dependencies:** `@supabase/ssr`, `@supabase/supabase-js`, `bcryptjs` (2FA recovery codes), SMS provider (OTP).
- **Env:** Supabase keys; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`; `INVITE_SECRET`.

## 2. Profile
- **Purpose:** Read/update patient profile across `profiles` (account) + `patient_profiles` (clinical); profile photo upload.
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/profile.ts` (`getMyProfile`, `updateMyProfile`); Backend `backend/src/app/api/patients/me/profile-photo/route.ts` (image upload via `sharp`).
- **Dependencies:** `@supabase/supabase-js`; `sharp` (photo route, backend).
- **Env:** Supabase keys (`SUPABASE_SERVICE_ROLE_KEY` for photo upload).

## 3. Family
- **Purpose:** Manage family members for booking on behalf of dependents.
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/family.ts` (`listFamily`, `addFamilyMember`, `updateFamilyMember`, `deleteFamilyMember`). Table `family_members`.
- **Dependencies:** `@supabase/supabase-js`. No backend route.
- **Env:** Supabase public keys only.

## 4. Doctors
- **Purpose:** Doctor search + detail (with availability); favourites toggle.
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/doctors.ts` (`searchDoctors`, `getDoctor`), `shared/src/api/favourites.ts` (`listFavourites`, `isFavourite`, `toggleFavourite`). Tables `doctors`, `doctor_availability`, `favourites`.
- **Dependencies:** `@supabase/supabase-js`.
- **Env:** Supabase public keys only.

## 5. Facilities
- **Purpose:** Facility list/detail; geo "nearby" search for facilities & branches.
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/facilities.ts` (`listFacilities`, `getFacility`, `nearbyFacilities`, `nearbyBranches`). Tables `facilities`, `branches`; RPCs `get_nearby_facilities`, `get_nearby_branches`.
- **Dependencies:** `@supabase/supabase-js`; PostGIS-backed RPCs.
- **Env:** Supabase public keys only.

## 6. Appointments
- **Purpose:** List/book/cancel/reschedule/rebook appointments, waitlist claim, available slots.
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/appointments.ts` (`listMyAppointments`, `bookAppointment`, `cancelAppointment`, `rescheduleAppointment`, `rebookAppointment`, `claimWaitlistAppointment`, `getAvailableSlots`). Backend: `appointments/[id]/google` (add to Google Calendar). RPCs `book_appointment_atomic`, `cancel_appointment_safe`, `reschedule_appointment_atomic`, `rebook_appointment`, `claim_waitlist_appointment`; tables `appointments`, `doctor_availability`.
- **Dependencies:** `@supabase/supabase-js`; `googleapis` (calendar route, backend).
- **Env:** Supabase keys; Google OAuth vars (calendar route).

## 7. Records (Medical History + Documents)
- **Purpose:** Structured medical history (allergies/conditions/meds/surgeries) + uploaded documents with signed URLs; medical-history PDF (backend).
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/records.ts` (`getMedicalHistory`, `upsertMedicalHistory`, `listDocuments`, `addDocument`, `deleteDocument`, `getDocumentSignedUrl`). Backend `patients/[id]/medical-history/pdf` (PDF). Tables `medical_histories`, `patient_documents`; storage `patient-docs`.
- **Dependencies:** `@supabase/supabase-js`; `pdfkit` (PDF route, backend).
- **Env:** Supabase keys (`SUPABASE_SERVICE_ROLE_KEY` for PDF/signed URLs server-side).

## 8. Labs
- **Purpose:** List lab results, mark viewed, signed URLs for files.
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/labs.ts` (`listLabResults`, `markLabResultViewed`, `getLabResultSignedUrl`). Table `lab_results`; storage `lab-results`. Async patient alerting via Edge Function `notify-lab-result`.
- **Dependencies:** `@supabase/supabase-js`.
- **Env:** Supabase keys.

## 9. Prescriptions
- **Purpose:** List/read prescriptions (shared); generate/download/share PDF (backend).
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/prescriptions.ts` (`listPrescriptions`, `getPrescription`). Backend `prescriptions/[id]/{generate-pdf,download,share-link}`. Table `prescriptions`.
- **Dependencies:** `@supabase/supabase-js`; `pdfkit` (backend).
- **Env:** Supabase keys; `SUPABASE_SERVICE_ROLE_KEY` (signed PDF storage).

## 10. Notifications
- **Purpose:** In-app notifications (list/read/delete/unread-count) + channel/category preferences.
- **Source:** HAMS Reused (in-app); **MediLink Specific** (`notification_preferences` table + push dispatch).
- **Location:** Shared `shared/src/api/notifications.ts` (`listNotifications`, `unreadCount`, `markAllRead`, `markRead`, `deleteNotification`, `getPreferences`, `updatePreferences`). Backend dispatch `notifications/push`. Tables `in_app_notifications`, `notification_preferences`, `device_tokens`.
- **Dependencies:** `@supabase/supabase-js`.
- **Env:** Supabase keys; `INVITE_SECRET` (guards the push dispatch route).

## 11. Reviews
- **Purpose:** List the patient's own reviews (enriched with target name); create a review for a doctor/facility.
- **Source:** HAMS Reused.
- **Location:** Shared `shared/src/api/reviews.ts` (`listMyReviews`, `createReview`). Tables `reviews`, `facilities`, `doctors`; enum `review_target`.
- **Dependencies:** `@supabase/supabase-js`.
- **Env:** Supabase public keys only.

## 12. Payments
- **Purpose:** Checkout (Thawani primary, Stripe secondary), invoices, refunds, unpaid list, webhook (confirms payment → enqueues emergency appointments via RPC).
- **Source:** HAMS Reused.
- **Location:** Backend `backend/src/app/api/payments/*` — `checkout`, `[id]/invoice`, `[id]/refund`, `get-appointment/[id]`, `unpaid`, `webhook`, `payments` (list). RPC `enqueue_appointment`; Edge Functions `generate-invoice`, `poll-refund-status`. Tables `payments`, `refunds`, `appointments`.
- **Dependencies:** `stripe`; Thawani via `fetch`; `@supabase/supabase-js` (service role).
- **Env:** `THAWANI_BASE_URL`, `THAWANI_API`, `THAWANI_API_KEY`, `THAWANI_SECRET_KEY`, `THAWANI_PUBLISHABLE_KEY`; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; `SUPABASE_SERVICE_ROLE_KEY`.

## 13. AI Services
- **Purpose:** Symptom check, doctor suggestion, prescription scan (OCR/parse), schedule assist (NLP date parsing).
- **Source:** HAMS Reused.
- **Location:** Backend `backend/src/app/api/ai/{symptom-check,suggest-doctor,scan-prescription,schedule-assist}`. Edge Function `generate-health-insights`. Logs to `ai_request_logs`, `symptom_check_logs`.
- **Dependencies:** `@google/generative-ai` (Gemini), `groq-sdk` (Groq), `chrono-node` (schedule-assist).
- **Env:** `GEMINI_API_KEY`, `GROQ_API_KEY`, `MOCK_AI` (stub when `true`).

## 14. PDF Services
- **Purpose:** Generate prescription PDFs and medical-history PDFs.
- **Source:** HAMS Reused.
- **Location:** Backend `prescriptions/[id]/{generate-pdf,download,share-link}`, `patients/[id]/medical-history/pdf`. Edge Functions `generate-invoice`, `generate-patient-report`, `generate-report`, `generate-revenue-report`, `generate-facility-patients-report`.
- **Dependencies:** `pdfkit` (kept in `serverExternalPackages`).
- **Env:** `SUPABASE_SERVICE_ROLE_KEY` (store/sign generated files).

## 15. Push Notifications
- **Purpose:** Register device tokens (mobile), persist them, dispatch push from backend.
- **Source:** **MediLink Specific** (transport is new; HAMS had only in-app + web push).
- **Location:**
  - Mobile client: `mobile/src/services/push.ts` (`registerForPushNotifications`, `saveDeviceToken`, `syncPushToken`).
  - Backend dispatch: `backend/src/app/api/notifications/push/route.ts` (service role → Expo push, opt-in aware).
  - Storage: tables `device_tokens`, `notification_preferences`; legacy `web_push_subscriptions`.
- **Dependencies:** `expo-notifications`, `expo-device`, `expo-constants` (mobile); `@supabase/supabase-js` service role (backend).
- **Env:** `INVITE_SECRET` (guards dispatch); Supabase keys; EAS `projectId` in `mobile/app.json`.

---

### Module → tier → env quick matrix
| Module | Shared (RLS) | Backend (secrets) | Notable env beyond Supabase |
|---|---|---|---|
| Auth | ✓ | ✓ | Google OAuth, INVITE_SECRET |
| Profile | ✓ | photo | — |
| Family | ✓ | — | — |
| Doctors | ✓ | — | — |
| Facilities | ✓ | — | — |
| Appointments | ✓ | calendar | Google OAuth |
| Records | ✓ | PDF | — |
| Labs | ✓ | — | — |
| Prescriptions | ✓ | PDF | — |
| Notifications | ✓ | push | INVITE_SECRET |
| Reviews | ✓ | — | — |
| Payments | — | ✓ | Thawani*, Stripe* |
| AI | — | ✓ | GEMINI/GROQ, MOCK_AI |
| PDF | — | ✓ | — |
| Push | mobile | ✓ | INVITE_SECRET |

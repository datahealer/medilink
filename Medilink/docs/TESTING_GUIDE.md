# MediLink — Testing Guide

How to smoke-test every major backend module. Two kinds of tests:
- **Direct Supabase (shared API)** — exercise `shared/src/api/*` from a Node/Deno script or the app (RLS enforced).
- **Backend routes** — HTTP calls to `http://localhost:3001/api/*` (Postman/curl).

> No automated test suite ships yet (see [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md)). These are **manual smoke tests** + the recommended structure for the future suite. Set `MOCK_AI=true` for AI tests without real keys.

## 0. Prerequisites for testing
```bash
npm run dev:backend        # backend on :3001
# Obtain a patient access token for Bearer-authenticated routes:
```
Get a token quickly with the anon key (Node REPL or a scratch script):
```js
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data } = await sb.auth.signInWithPassword({ email: "patient@test.com", password: "..." });
console.log(data.session.access_token);   // → use as Bearer token below
```
Set Postman/curl variables: `{{baseUrl}} = http://localhost:3001`, `{{token}} = <access_token>`.

## 1. Health checks
There is no dedicated `/health` route; use these as liveness probes:
```bash
# Backend process up? (any GET that returns 401 proves the server + auth layer run)
curl -i http://localhost:3001/api/payments            # expect 401 Unauthorized without token
# Web up?
curl -i http://localhost:3000                          # expect 200 + HTML ("Foundation ready")
# Supabase reachable + types current?
npm run typecheck                                      # exit 0
supabase migration list                                # remote reachable
```
**Pass:** backend returns 401 (not connection-refused); web returns 200; typecheck is clean.

## 2. Backend smoke tests (per route group)
Run each and confirm the documented status. Without a token, protected routes must return **401** (proves the auth guard works). With a valid token, they return 200/expected payloads.
```bash
# Auth-guarded GETs (expect 401 without token, 200 with)
for p in payments payments/unpaid users/me/data-export; do
  curl -s -o /dev/null -w "%{http_code} $p\n" http://localhost:3001/api/$p
done
```

## 3. Authentication testing — module: Auth
**Signup (public):**
```bash
curl -X POST {{baseUrl}}/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"newpatient@test.com","password":"StrongP@ss1","full_name":"Test Patient","phone":"+96890000000"}'
```
Postman:
```
POST {{baseUrl}}/api/auth/signup
Body (JSON): { "email": "newpatient@test.com", "password": "StrongP@ss1", "full_name": "Test Patient", "phone": "+96890000000" }
Expect: 200/201 { user ... }  (role=patient)
```
**Send / verify OTP (session required):**
```
POST {{baseUrl}}/api/auth/send-otp      Headers: Authorization: Bearer {{token}}   Body: { "phone": "+96890000000" }
POST {{baseUrl}}/api/auth/verify-otp    Headers: Authorization: Bearer {{token}}   Body: { "phone": "+96890000000", "code": "123456" }
Expect: 200 { success: true }; verify sets phone_verified.
```
**Direct (shared) auth:**
```js
import { api } from "@medilink/shared";
const { session } = await api.auth.signInWithPassword(db, { email, password });
await api.auth.updatePassword(db, "NewP@ss123");
await api.auth.signOut(db);
```
**Pass:** signup creates a patient; OTP round-trip succeeds; sign-in returns a session; protected route now returns 200 with the token.

## 4. Appointment testing — module: Appointments
**Direct (shared) flow:**
```js
import { api } from "@medilink/shared";          // mobile: "@medilink/shared/mobile"
const slots = await api.appointments.getAvailableSlots(db, { doctorId, date: "2026-07-01" });
const booked = await api.appointments.bookAppointment(db, {
  doctorId, facilityId, slotDate: "2026-07-01", slotStart: slots[0].start, type: "consultation",
});
const upcoming = await api.appointments.listMyAppointments(db, "upcoming");
await api.appointments.cancelAppointment(db, booked.appointment_id, { reason: "test" });
```
**Backend calendar route:**
```
POST {{baseUrl}}/api/appointments/{{appointmentId}}/google
Headers: Authorization: Bearer {{token}}
Expect: 200 { eventId ... } (requires Google OAuth configured), else 400/409 with reason.
```
**Pass:** slots returns a non-empty list for an available day; booking returns an `appointment_id`; the appointment appears in `listMyAppointments("upcoming")`; cancel succeeds and it moves out of upcoming. Double-booking the same slot must fail (RPC guard).

## 5. Payment testing — module: Payments
**Checkout (Thawani primary):**
```
POST {{baseUrl}}/api/payments/checkout
Headers: Authorization: Bearer {{token}}
Body (JSON): { "appointment_id": "{{appointmentId}}" }
Expect: 200 { checkoutUrl | sessionId }  → open checkoutUrl to complete a sandbox payment.
```
**Webhook (provider → backend, no user auth; provider signature):**
```
POST {{baseUrl}}/api/payments/webhook
Headers: Content-Type: application/json   (+ provider signature header in real use)
Body: <provider event payload>
Expect: 200; on success the payment row flips to paid and emergency appts are enqueued (enqueue_appointment).
```
**Invoice / refund:**
```
GET  {{baseUrl}}/api/payments/{{paymentId}}/invoice   Authorization: Bearer {{token}}   → 200 invoice
POST {{baseUrl}}/api/payments/{{paymentId}}/refund    Authorization: Bearer {{token}}   Body: { "reason": "test" }  → 200; poll-refund-status edge fn tracks state
```
**Pass:** checkout returns a usable URL/session; a completed sandbox payment marks the appointment paid; invoice fetch returns a document; refund request is accepted. Use Thawani **sandbox** credentials.

## 6. AI testing — module: AI Services (`MOCK_AI=true` for keyless runs)
```
POST {{baseUrl}}/api/ai/symptom-check     Authorization: Bearer {{token}}   Body: { "symptoms": "fever, sore throat, 2 days" }
POST {{baseUrl}}/api/ai/suggest-doctor    Authorization: Bearer {{token}}   Body: { "symptoms": "chest pain" }
POST {{baseUrl}}/api/ai/scan-prescription Authorization: Bearer {{token}}   Body: { "imageBase64": "<...>" }
POST {{baseUrl}}/api/ai/schedule-assist   Authorization: Bearer {{token}}   Body: { "text": "next monday morning with Dr Khan", "doctorId": "{{doctorId}}" }
```
**Pass:** each returns 200 with structured JSON (triage/specialty/parsed-meds/parsed-date+slots). With `MOCK_AI=true` responses are deterministic stubs. Requests are logged to `ai_request_logs` / `symptom_check_logs`.

## 7. Notification testing — module: Notifications / Push
**Direct (shared) in-app notifications:**
```js
import { api } from "@medilink/shared";
const list   = await api.notifications.listNotifications(db, { page: 1, limit: 20 });
const unread = await api.notifications.unreadCount(db);
await api.notifications.markAllRead(db);
await api.notifications.updatePreferences(db, { push: true, sms: false });
```
**Push dispatch (server-to-server; secret-guarded):**
```
POST {{baseUrl}}/api/notifications/push
Headers: Content-Type: application/json, x-internal-secret: {{INVITE_SECRET}}
Body: { "userId": "{{userId}}", "title": "Test", "body": "Hello from MediLink" }
Expect: 200 { sent: N } if the user has device tokens & push enabled; { sent: 0 } / { skipped } otherwise.
401 if the secret header is wrong (verifies the guard).
```
**Mobile token registration (on device):** call `syncPushToken()` after sign-in → a row appears in `device_tokens` for the user.
**Pass:** list/unread/markAllRead behave; preferences upsert; push dispatch returns 200 with a real token and 401 without the secret.

## 8. File upload testing — modules: Records, Labs, Profile, Prescriptions
**Profile photo (backend, multipart):**
```
POST {{baseUrl}}/api/patients/me/profile-photo
Headers: Authorization: Bearer {{token}}
Body: form-data → file=<image>
Expect: 200 { url } ; resized via sharp.
```
**Documents (direct + storage signed URL):**
```js
import { api } from "@medilink/shared";
// 1) upload the file to the 'patient-docs' bucket (db.storage.from('patient-docs').upload(path, file))
// 2) register the row:
const doc = await api.records.addDocument(db, { name: "Report.pdf", type: "report", file_url: path, file_type: "application/pdf" });
const docs = await api.records.listDocuments(db);
const url  = await api.records.getDocumentSignedUrl(db, path);     // short-lived signed URL
```
**Lab results (read + signed URL):**
```js
const results = await api.labs.listLabResults(db);
const fileUrl = await api.labs.getLabResultSignedUrl(db, results[0].file_url);   // 5-min URL
await api.labs.markLabResultViewed(db, results[0].id);
```
**Prescription PDF (backend):**
```
POST {{baseUrl}}/api/prescriptions/{{rxId}}/generate-pdf   Authorization: Bearer {{token}}   → 200 { pdf_url }
GET  {{baseUrl}}/api/prescriptions/{{rxId}}/download        Authorization: Bearer {{token}}   → application/pdf
```
**Pass:** photo upload returns a URL; document row + signed URL resolve; lab signed URL downloads the file and `markViewed` flips `is_viewed`; prescription PDF generates and downloads.

---

## Postman collection skeleton
Create a collection **MediLink Backend** with:
- **Variables:** `baseUrl=http://localhost:3001`, `token`, `INVITE_SECRET`, `appointmentId`, `paymentId`, `rxId`, `userId`, `doctorId`, `facilityId`.
- **Pre-request (collection level):** none required; set `Authorization: Bearer {{token}}` at collection level so every request inherits it (override to "No Auth" for `signup`, `webhook`, `push`).
- **Folders:** Auth · Payments · AI · Records · Prescriptions · Notifications · Appointments — each containing the requests above.

Example raw request (Auth → signup):
```
POST {{baseUrl}}/api/auth/signup
Headers: Content-Type: application/json
Body (raw JSON):
{ "email": "newpatient@test.com", "password": "StrongP@ss1", "full_name": "Test Patient", "phone": "+96890000000" }
```

## Suggested automated-test layout (future)
```
shared/   → vitest unit tests for api/* (mock DB client)
backend/  → route handler tests (next test runner / supertest against a test Supabase project)
e2e/      → Playwright (web) + Detox/Maestro (mobile) happy-path flows
```

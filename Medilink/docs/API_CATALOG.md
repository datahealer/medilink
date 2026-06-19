# MediLink — API Catalog

Every API surface in MediLink, in four sections:
- **A. Direct Supabase APIs** — shared functions in `shared/src/api/*` (run from web/mobile, RLS).
- **B. Backend Route APIs** — Next.js handlers in `backend/src/app/api/**` (privileged).
- **C. Edge Functions** — `supabase/functions/*` (async/scheduled).
- **D. RPC Functions** — Postgres functions invoked via `supabase.rpc(...)`.

**Auth conventions:**
- Direct Supabase calls require an **authenticated Supabase session** (web cookie / mobile bearer). Authorization is enforced by **RLS**.
- Backend routes: web sends the session cookie; mobile sends `Authorization: Bearer <access_token>`. A few are differently gated (noted).

---

## A. Direct Supabase APIs (`shared/src/api/*`)
All take a typed `DB` client as the first arg: `api.<module>.<fn>(db, …)`. Auth = authenticated patient (RLS) unless noted.

### auth — `shared/src/api/auth.ts`
| Function | Signature | Notes |
|---|---|---|
| signInWithPassword | `(db, {email,password}) → {user,session}` | public (no session needed) |
| signOut | `(db) → void` | |
| getSession | `(db) → Session\|null` | |
| getUser | `(db) → User\|null` | |
| resetPasswordForEmail | `(db, email, redirectTo?) → void` | public |
| updatePassword | `(db, newPassword) → void` | authenticated |
| onAuthStateChange | `(db, cb) → unsubscribe` | |

### profile — `shared/src/api/profile.ts`
| Function | Signature | Tables |
|---|---|---|
| getMyProfile | `(db) → {account, patient}` | `profiles`, `patient_profiles` |
| updateMyProfile | `(db, patch) → MyProfile` | `profiles`, `patient_profiles` |

### family — `shared/src/api/family.ts` (table `family_members`)
| Function | Signature |
|---|---|
| listFamily | `(db) → FamilyMember[]` |
| addFamilyMember | `(db, {full_name,relation,date_of_birth?,gender?}) → FamilyMember` |
| updateFamilyMember | `(db, id, patch) → FamilyMember` |
| deleteFamilyMember | `(db, id) → void` |

### doctors — `shared/src/api/doctors.ts` & favourites — `favourites.ts`
| Function | Signature | Tables / RPC |
|---|---|---|
| searchDoctors | `(db, {facilityId?,branchId?,specialty?,term?,limit?,offset?}) → rows[]` | `doctors`+`facilities` |
| getDoctor | `(db, id) → {doctor, availability[]}` | `doctors`,`doctor_availability` |
| listFavourites | `(db, targetType?) → Favourite[]` | `favourites` |
| isFavourite | `(db, {targetId,targetType}) → boolean` | `favourites` |
| toggleFavourite | `(db, {targetId,targetType}) → boolean` | `favourites` |

### facilities — `shared/src/api/facilities.ts`
| Function | Signature | Tables / RPC |
|---|---|---|
| listFacilities | `(db, {service?,limit?,offset?}) → rows[]` | `facilities` (active+verified, inner-join doctors) |
| getFacility | `(db, id) → row` | `facilities` |
| nearbyFacilities | `(db, {lat,lng,radiusM?}) → rows[]` | RPC `get_nearby_facilities` |
| nearbyBranches | `(db, {lat,lng,radius}) → rows[]` | RPC `get_nearby_branches` |

### appointments — `shared/src/api/appointments.ts`
| Function | Signature | Tables / RPC |
|---|---|---|
| listMyAppointments | `(db, tab="all"\|"upcoming"\|"past") → rows[]` | `appointments` (+doctor/facility/family/payments joins) |
| bookAppointment | `(db, {doctorId,facilityId,slotDate,slotStart,type,forFamilyMemberId?,isEmergency?}) → Json` | RPC `book_appointment_atomic` |
| cancelAppointment | `(db, id, {reason?,skipCutoff?}) → Json` | RPC `cancel_appointment_safe` |
| rescheduleAppointment | `(db, id, {date,start,end,skipCutoff?}) → Json` | RPC `reschedule_appointment_atomic` |
| rebookAppointment | `(db, originalId) → Json` | RPC `rebook_appointment` |
| claimWaitlistAppointment | `(db, entryId) → Json` | RPC `claim_waitlist_appointment` |
| getAvailableSlots | `(db, {doctorId,date,branchId?}) → AvailableSlot[]` | `doctor_availability` − booked `appointments` |

### records — `shared/src/api/records.ts`
| Function | Signature | Tables / Storage |
|---|---|---|
| getMedicalHistory | `(db) → MedicalHistory\|null` | `medical_histories` |
| upsertMedicalHistory | `(db, patch) → MedicalHistory` | `medical_histories` |
| listDocuments | `(db) → rows[]` | `patient_documents` (+appointment join) |
| addDocument | `(db, {name,type,file_url,file_type,linked_appointment_id?}) → row` | `patient_documents` |
| deleteDocument | `(db, id) → void` | soft-delete (`deleted_at`) |
| getDocumentSignedUrl | `(db, path, expiresIn=3600) → string` | storage `patient-docs` |

### labs — `shared/src/api/labs.ts` (table `lab_results`, storage `lab-results`)
| Function | Signature |
|---|---|
| listLabResults | `(db) → LabResult[]` |
| markLabResultViewed | `(db, id) → void` |
| getLabResultSignedUrl | `(db, path, expiresIn=300) → string` |

### prescriptions — `shared/src/api/prescriptions.ts` (table `prescriptions`)
| Function | Signature |
|---|---|
| listPrescriptions | `(db) → rows[]` (joins doctor + appointment) |
| getPrescription | `(db, id) → row\|null` |

### notifications — `shared/src/api/notifications.ts`
| Function | Signature | Tables |
|---|---|---|
| listNotifications | `(db, {page?,limit?}) → rows[]` | `in_app_notifications` |
| unreadCount | `(db) → number` | `in_app_notifications` |
| markAllRead | `(db) → void` | `in_app_notifications` |
| markRead | `(db, id) → void` | `in_app_notifications` |
| deleteNotification | `(db, id) → void` | `in_app_notifications` |
| getPreferences | `(db) → NotificationPreferences\|null` | `notification_preferences` |
| updatePreferences | `(db, {push?,email?,sms?,categories?}) → row` | `notification_preferences` |

### reviews — `shared/src/api/reviews.ts` (tables `reviews`,`facilities`,`doctors`)
| Function | Signature |
|---|---|
| listMyReviews | `(db) → ReviewWithTarget[]` |
| createReview | `(db, {targetType,targetId,rating,reviewText,comment?,appointmentId?}) → Review` |

---

## B. Backend Route APIs (`backend/src/app/api/**`)
Base URL = `NEXT_PUBLIC_BACKEND_URL` / `EXPO_PUBLIC_BACKEND_URL` (dev: `http://localhost:3001`). All paths prefixed `/api`.

### Auth — module: Auth
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | public | Create patient (admin createUser, role=patient) |
| POST | `/api/auth/send-otp` | session | Send phone OTP (writes `otp_records`) |
| POST | `/api/auth/resend-otp` | session | Resend OTP |
| POST | `/api/auth/verify-otp` | session | Verify OTP, set `phone_verified` |
| POST | `/api/auth/set-password` | session/recovery | Set/update password |
| POST | `/api/auth/session-log` | session | Record a session/device login |
| GET | `/api/auth/google` | public | Begin Google OAuth |
| GET | `/api/auth/google/callback` | public | OAuth redirect handler |
| POST | `/api/auth/2fa/setup` | session | Begin TOTP enrolment |
| POST | `/api/auth/2fa/verify` | session | Verify TOTP code |
| POST | `/api/auth/2fa/challenge` | session | Issue 2FA challenge |
| POST | `/api/auth/2fa/disable` | session | Disable 2FA |
| POST | `/api/auth/2fa/recovery/generate` | session | Generate recovery codes (`bcryptjs`) |
| POST | `/api/auth/2fa/recovery/use` | session | Redeem a recovery code |

### Payments — module: Payments
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/payments/checkout` | session | Create Thawani/Stripe checkout session |
| GET | `/api/payments` | session | List payments |
| GET | `/api/payments/unpaid` | session | List unpaid appointments |
| GET | `/api/payments/get-appointment/[id]` | session | Payment context for an appointment |
| GET | `/api/payments/[id]/invoice` | session | Fetch/generate invoice |
| POST | `/api/payments/[id]/refund` | session | Request refund |
| POST | `/api/payments/webhook` | provider signature | Confirm payment → `enqueue_appointment` (service role) |

### AI — module: AI Services
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/ai/symptom-check` | session | Symptom triage (Groq/Gemini) |
| POST | `/api/ai/suggest-doctor` | session | Recommend doctor/specialty |
| POST | `/api/ai/scan-prescription` | session | OCR/parse a prescription image |
| POST | `/api/ai/schedule-assist` | session | NLP date parsing (`chrono-node`) + `get_available_slots` |

### PDF / Records / Prescriptions — modules: PDF, Records, Prescriptions
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/prescriptions/[id]/generate-pdf` | session | Generate prescription PDF (`pdfkit`) |
| GET | `/api/prescriptions/[id]/download` | session | Download prescription PDF |
| GET | `/api/prescriptions/[id]/share-link` | session | Signed share link |
| GET | `/api/patients/[id]/medical-history/pdf` | session | Medical-history PDF |
| POST | `/api/patients/me/profile-photo` | session | Upload/resize profile photo (`sharp`) |

### Appointments (calendar) — module: Appointments
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/appointments/[id]/google` | session + Google | Add appointment to Google Calendar (`googleapis`) |

### Notifications (push) — module: Push
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/notifications/push` | `x-internal-secret: INVITE_SECRET` | Server-to-server push dispatch (Expo→FCM/APNs) |

### GDPR / Account — module: Auth/Account
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/users/me/data-export` | session | List export requests |
| POST | `/api/users/me/data-export` | session | Request a data export (→ Edge `export-user-data`) |
| GET | `/api/users/me/data-export/[id]` | session | Export status/download |
| DELETE | `/api/users/me/account` | session | Request account deletion (→ Edge `purge-user-auth`) |
| POST | `/api/users/me/account/cancel-deletion` | session | Cancel pending deletion |

---

## C. Edge Functions (`supabase/functions/*`)
Invoked via `supabase.functions.invoke(name, …)`, DB triggers, or schedules. Run on Supabase infra with their own secrets.

| Function | Purpose | Trigger |
|---|---|---|
| `send-booking-confirmation` | Email/notify on new booking | after booking |
| `generate-invoice` | Build invoice document | on payment success |
| `generate-health-insights` | AI-derived patient health insights | on demand / scheduled |
| `notify-lab-result` | Notify patient when a lab result is uploaded | on `lab_results` insert |
| `notify-waitlist` | Offer freed slots to waitlist | on cancellation |
| `poll-refund-status` | Poll gateway for refund state | scheduled |
| `export-user-data` | Assemble GDPR data export | on export request |
| `purge-user-auth` | Delete auth user on account deletion | on deletion request |
| `generate-patient-report` | Patient report (PDF) | on demand |
| `generate-report` | Generic report generator | on demand |
| `generate-revenue-report` | Facility revenue report | scheduled/on demand |
| `generate-facility-patients-report` | Facility patient list report | on demand |
| `broadcast-announcement` | Fan-out an announcement | on demand |

> Patient app primarily benefits from `send-booking-confirmation`, `notify-lab-result`, `notify-waitlist`, `generate-invoice`, `generate-health-insights`, `export-user-data`, `purge-user-auth`. The `generate-*-report` / `broadcast-announcement` functions are facility/admin-oriented and reused as-is.

---

## D. RPC Functions (Postgres, `supabase.rpc`)
Patient-facing RPCs the data layer calls (SECURITY DEFINER, guarded internally):

| RPC | Args | Returns | Caller |
|---|---|---|---|
| `book_appointment_atomic` | `p_patient_id, p_doctor_id, p_facility_id, p_slot_date, p_slot_start, p_type?, p_is_emergency?, p_for_family_member_id?` | Json | `appointments.bookAppointment` |
| `cancel_appointment_safe` | `p_id, p_user_id, p_reason?, p_skip_cutoff?` | Json | `appointments.cancelAppointment` |
| `reschedule_appointment_atomic` | `p_id, p_user_id, p_new_date, p_new_start, p_new_end, p_skip_cutoff?` | Json | `appointments.rescheduleAppointment` |
| `rebook_appointment` | `p_original_id` | Json | `appointments.rebookAppointment` |
| `claim_waitlist_appointment` | `p_entry_id` | Json | `appointments.claimWaitlistAppointment` |
| `get_available_slots` | `p_date, p_doctor_id, p_include_walkin?` | `{slot_start,slot_end,slot_type}[]` | backend `ai/schedule-assist` |
| `get_nearby_facilities` | `p_lat, p_lng, p_radius_m?` | facility rows + `distance_km` | `facilities.nearbyFacilities` |
| `get_nearby_branches` | `lat, lng, radius` | branch rows + `distance` | `facilities.nearbyBranches` |
| `enqueue_appointment` | `p_appointment_id, p_facility_id, p_doctor_id, p_patient_name, p_patient_phone, p_is_walkin, p_is_online, p_created_by_staff_id` | Json | backend `payments/webhook` |

> The schema also defines many staff/admin and PostGIS RPCs (`get_earnings_dashboard`, `revenue_report`, `nearby_*`, `st_*`, …) that the patient app does not call. See `shared/src/types/supabase.ts` → `public.Functions` for the full list.

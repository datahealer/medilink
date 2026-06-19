# MediLink — Data Layer (shared/src/api) Completion Report

The re-home data layer is **complete**. Every patient domain is implemented as a typed, direct-Supabase module in `shared/src/api/*`, shared verbatim by web and mobile. Query bodies were extracted from the **real HAMS route handlers** and validated against the **generated `Database` types** — `npm run typecheck` passes for all four workspaces, which (because supabase-js type-checks `.select()` strings, column filters, and RPC args against the schema) confirms every table, column, join alias, and RPC signature used here is schema-valid.

## Result at a glance
| | |
|---|---|
| Modules implemented | **11 / 11 priority domains** (+ `favourites`, + helpers) |
| Exported functions | **49** across 13 module files |
| Typecheck | **PASS** (shared ✓ backend ✓ frontend ✓ mobile ✓), under `strict` + `noUncheckedIndexedAccess` |
| Source of truth | HAMS patient route handlers + generated Supabase types |
| Shared by | web (SSR/cookie `DB`) **and** mobile (bearer `DB`) — identical RLS |

---

## Completed modules
| # | Domain | File | Functions | HAMS source | Tables / RPCs |
|---|---|---|---|---|---|
| 1 | Authentication | `auth.ts` | `signInWithPassword`, `signOut`, `getSession`, `getUser`, `resetPasswordForEmail`, `updatePassword`, `onAuthStateChange` | `auth/*`, `signout` | `supabase.auth.*` |
| 2 | Profile | `profile.ts` | `getMyProfile`, `updateMyProfile` | `patients/me`, `me` | `profiles`, `patient_profiles` |
| 3 | Family | `family.ts` | `listFamily`, `addFamilyMember`, `updateFamilyMember`, `deleteFamilyMember` | `patients/me/family[/[id]]` | `family_members` |
| 4 | Doctors | `doctors.ts` | `searchDoctors`, `getDoctor` | `doctors[/[id]]` | `doctors`, `doctor_availability`, `facilities` |
| — | Favourites | `favourites.ts` | `listFavourites`, `isFavourite`, `toggleFavourite` | `patients/me/favourites` | `favourites` |
| 5 | Facilities | `facilities.ts` | `listFacilities`, `getFacility`, `nearbyFacilities`, `nearbyBranches` | `facilities[/[id]]`, `facilities/nearby` | `facilities`; RPC `get_nearby_facilities`, `get_nearby_branches` |
| 6 | Appointments | `appointments.ts` | `listMyAppointments`, `bookAppointment`, `cancelAppointment`, `rescheduleAppointment`, `rebookAppointment`, `claimWaitlistAppointment`, `getAvailableSlots` | `patients/me/appointments`, `appointments/book`, `appointments/[id]`, `slots` | `appointments`, `doctor_availability`; RPC `book_appointment_atomic`, `cancel_appointment_safe`, `reschedule_appointment_atomic`, `rebook_appointment`, `claim_waitlist_appointment` |
| 7 | Medical Records | `records.ts` | `getMedicalHistory`, `upsertMedicalHistory`, `listDocuments`, `addDocument`, `deleteDocument`, `getDocumentSignedUrl` | `patients/me/medical-history`, `patients/me/documents` | `medical_histories`, `patient_documents`, storage `patient-docs` |
| 8 | Labs | `labs.ts` | `listLabResults`, `markLabResultViewed`, `getLabResultSignedUrl` | `patients/me/results` | `lab_results`, storage `lab-results` |
| 9 | Prescriptions | `prescriptions.ts` | `listPrescriptions`, `getPrescription` | `prescriptions` (patient role) | `prescriptions`, `doctors`, `appointments` |
| 10 | Notifications | `notifications.ts` | `listNotifications`, `unreadCount`, `markAllRead`, `markRead`, `deleteNotification`, `getPreferences`, `updatePreferences` | `notifications/{me,unread-count,read-all}` | `in_app_notifications`, `notification_preferences` (additive) |
| 11 | Reviews | `reviews.ts` | `listMyReviews`, `createReview` | `reviews/me`, `reviews` POST | `reviews`, `facilities`, `doctors` |

**Shared helpers** (`client.ts`): `getCurrentUserId`, `getMyPatientProfileId` (resolves the `patient_profiles.id` FK that most tables key on), `today`, plus `DB`/`Row`/`Insert`/`Update`/`Enums`/`Json` type aliases.

## API coverage
**Patient direct-Supabase surface: ~100% of the in-scope HAMS patient endpoints.** All 11 requested domains implemented; the only patient endpoints intentionally *not* in this layer are the **privileged/heavy ops** that stay in `backend/` by design (not part of the direct-Supabase data layer):

| Reached via backend (not here) | Why |
|---|---|
| Prescription PDF generate / download / share-link | `pdfkit`, signed assets, service role |
| Payments checkout / invoice / refund / webhook (Thawani·Stripe) | secret keys |
| AI symptom-check / suggest-doctor / scan-prescription | server SDK keys (Gemini/Groq) |
| Profile-photo upload, medical-history PDF | `sharp`, storage writes via service role |
| OTP / signup / 2FA / data-export / account-delete | secrets, admin auth (decision #1) |
| Push **dispatch** | service-role fan-out (`backend/api/notifications/push`) |

These are covered by `mobile/src/services/api.ts` (bearer) and same-origin fetch on web; their contracts are sketched in `shared/src/api/contracts.ts` (`BackendApi`).

### Remaining / deferred (non-blocking)
- `patient_insurance` table exists but has **no patient-facing HAMS route** — deliberately not invented; add when a real flow is defined.
- Signed-URL helpers (`getDocumentSignedUrl`, `getLabResultSignedUrl`) call `storage.createSignedUrl` directly; HAMS used the service role for these. They work if the storage bucket's RLS allows owner reads — otherwise route via backend. Flagged, not silently assumed.

## Example usage

### Web (Next.js — SSR/cookie client)
```ts
// e.g. an RSC, route handler, or server action
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { api } from "@medilink/shared";

export async function getDashboardData() {
  const db = await createServerSupabaseClient();        // typed DB, cookie session → RLS

  const [profile, upcoming, unread] = await Promise.all([
    api.profile.getMyProfile(db),
    api.appointments.listMyAppointments(db, "upcoming"),
    api.notifications.unreadCount(db),
  ]);
  return { profile, upcoming, unread };
}

// Booking from a client component:
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
const db = createBrowserSupabaseClient();
await api.appointments.bookAppointment(db, {
  doctorId, facilityId, slotDate: "2026-07-01", slotStart: "09:30", type: "consultation",
});
```

### Mobile (Expo — bearer client)
```ts
import { supabase } from "@/lib/supabase";          // SecureStore-persisted session
import { api } from "@medilink/shared/mobile";       // RN-safe entry, same modules

// Search + favourite a doctor
const doctors = await api.doctors.searchDoctors(supabase, { specialty: "Cardiology", term: "khan" });
await api.favourites.toggleFavourite(supabase, { targetId: doctors[0].id, targetType: "doctor" });

// Available slots → book for a family member
const slots = await api.appointments.getAvailableSlots(supabase, { doctorId, date: "2026-07-01" });
await api.appointments.bookAppointment(supabase, {
  doctorId, facilityId, slotDate: "2026-07-01", slotStart: slots[0].start,
  type: "consultation", forFamilyMemberId,
});

// Notification preferences
await api.notifications.updatePreferences(supabase, { push: true, sms: false });
```

> Identical call sites on both platforms — the only difference is which `DB` you pass (cookie-backed vs bearer-backed). RLS is identical, so the modules never branch on platform.

## Verification
```
npm run typecheck   → exit 0  (shared ✓  backend ✓  frontend ✓  mobile ✓)
```
Runtime verification (live queries) requires a linked Supabase project + `db:push` of the two additive migrations; the type layer guarantees schema-correctness ahead of that.

---
**Status: data layer complete.** Ready to begin UI screens — they consume these modules and never write raw queries.

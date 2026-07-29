# MediLink Mobile — Feature Implementation Plan

**Status:** F1 (Civil Number) + F2 (Arabic names) **implemented & committed** (`1784fec`, 2026-07-16); **F3 — Booking & Payment is next.** The design below remains the source of truth.
**Branch:** `ios-production-backend`
**Scope:** Technical design for four deferred/blocked mobile features.

Features covered:
1. Arabic doctor / clinic / specialty names
2. Civil Number
3. Guest Mode
4. Login Simplification

> Architectural ground rules (from `CLAUDE.md` / `supabase/README.md`) that constrain every design below:
> - Supabase project is **reused from HAMS** — schema changes are **additive only, never fork**.
> - Mobile screens consume **`repositories` + domain types** only (`mobile/src/data/*`); they never call Supabase/HAMS row shapes directly.
> - RLS-safe patient CRUD lives in `shared/src/api/*`; privileged/secret ops live in `backend/src/app/api/**`.
> - i18n: EN is canonical (`src/i18n/en.ts`); AR (`ar.ts`) is typed against it (`Leaves<Messages>`), a missing key falls back to the raw key string. RTL flips via `I18nManager` and applies on next launch.

---

## Implementation Status (updated 2026-07-16)

Implementation has begun on `ios-production-backend`. Commit `1784fec` contains F1 + F2.

| # | Feature | Status |
|---|---------|--------|
| **F1** | Civil Number | ✅ **Completed** — 2026-07-16 (`1784fec`) |
| **F2** | Arabic doctor / clinic / specialty **+ patient** names | ✅ **Completed** — 2026-07-16 (`1784fec`) |
| **F3** | Booking & Payment Improvements | ⏳ **NEXT — not started** |
| — | Guest Mode | ⛔ Deferred (approved; roadmapped after F3) |
| — | Login Simplification | ⛔ Deferred (email-only ready; phone blocked on SMS provider) |

**Shipped in F1:** optional 8-digit `patient_profiles.civil_number` (+ `CHECK`); Edit Profile field + masked Profile display (tap-to-reveal); mandatory **mobile onboarding/profile-setup gate** (DOB completion signal, existing users unaffected); web setup field. Migration `20260716000000` applied.

**Shipped in F2:** Arabic specialty localization; Arabic **doctor / clinic / patient** names via the shared `localizedName()` helper — **verified/admin-entered Arabic → else English fallback, no in-app machine translation** (HAMS owns authoring). Migrations `20260716000001` (doctors/facilities `*_ar` + `*_ar_status`) and `20260716000002` (profiles `full_name_ar` + status) applied. Shared reads + mobile mappers + all name surfaces wired.

**Housekeeping:** all three migrations applied to the linked DB; `supabase.ts` regenerated; temporary type overlay removed (generated types only). `npm run typecheck` (all workspaces) + mobile `expo lint` clean.

### ▶ Resume tomorrow: Feature 3 — Booking & Payment Improvements

Start here. Implement the phases below **exactly** as defined in "Booking & Payment Product Decisions" §8, respecting the round-2 engineering decisions **R1–R7** and the resolved Architecture-Review items:

- **BP-1 — Available Today (slot-based).** Discovery reflects real bookable slots **today**; ignore `doctors.status`. Add a set-based `doctors_available_today(date)` RPC/view; mobile stops deriving availability from `status`.
- **BP-2 — Booking window constant + guard.** `BOOKING_WINDOW_DAYS = 7` (today + 6, inclusive) in `shared/src/config`; server-side `OUTSIDE_BOOKING_WINDOW` guard in `book_appointment_atomic` (non-emergency only); UI renders exactly the window.
- **BP-3 — Pending-hold TTL + release-on-failure.** `hold_expires_at` (**10 min**) on appointments; dedicated `release_unpaid_hold` (void reservation → free slot, no cutoff/refund); **Scheduled Edge Function** sweeper (R7, not pg_cron); availability RPCs exclude expired holds in real time.
- **BP-4 — Amount integrity + Thawani host/config.** Server-derive the payment amount (drop the client-sent total); env-driven Thawani host/keys; shared VAT/rounding helper.
- **BP-5 — In-app WebView checkout.** Add `react-native-webview`; open Thawani hosted checkout **inside an in-app WebView** with success/cancel interception; release the hold on cancel/close. (No external browser.)
- **BP-6 — Webhook hardening (HMAC).** Verify the Thawani signature in addition to the existing re-query + idempotent claim.

**Phase dependencies:** BP-3 before BP-5 (WebView cancel must free the held slot); BP-4 before/with BP-5 (correct amount at checkout); BP-1/BP-2 independent (can go first); BP-6 independent. All booking/payment product + engineering decisions (window today+6, 10-min hold, no auto-refund/manual reconciliation, MFA not required, emergency bypass, backend-authoritative availability, anon-execute grants for guest availability) are locked in the sections below.

---

## Product Decisions — Locked (2026-07-16)

These decisions from the product owner supersede the "pending approval" notes in the feature sections below.

| Feature | Decision |
|---|---|
| **F1 Arabic names** | Recommendation requested for the **onboarding sourcing workflow** (how Arabic names are created at scale) — see the new **§1a** under Feature 1. Not yet approved for implementation; ship the recommendation first. |
| **F2 Civil Number** | **APPROVED.** Add to patient profile, store in DB, patient-editable, format-validated, **optional** (may become mandatory later). Engineering to **recommend + implement best practice** for uniqueness and masking (see updated F2 §1/§6/§10). |
| **F3 Guest Mode** | **APPROVED** with an explicit allow/deny capability list (see updated F3 §1). Friendly "create account / sign in" wall on every restricted action. Minimize friction; keep patient data fully protected. |
| **F4 Login Simplification** | **APPROVED.** Login offers a **choice of ONE identifier — Email OR Mobile** (not both). Email = email OTP (live). Phone = SMS OTP (**pending SMS provider** — see F4 §5 for the exact outstanding infra). |

**Engineering recommendations locked into best practice below:**
- **Civil Number → masking: YES; hard DB uniqueness: NO for v1** (deferred partial unique index). Rationale in F2 §6/§11.
- **Arabic names → source-of-truth capture in HAMS onboarding + transliteration-assisted pre-fill + status-gated display.** Full workflow in F1 §1a.

**See also:** a separate locked decision set for booking & payments — **"Booking & Payment Product Decisions (Locked – 2026-07-16)"** at the end of this document. (Note: F3 Guest Mode's deny-list already forbids booking/payments for guests — consistent with those decisions.)

---

# Feature 1 — Arabic Doctor / Clinic / Specialty Names

## 1. Feature Overview
- **Business requirement:** In the Arabic UI, doctor names, clinic/facility names, and specialty labels should display in Arabic rather than English.
- **Current implementation:**
  - **Specialties** are *already* localizable: `mobile/src/utils/specialties.ts` maps a specialty slug → an i18n key (`specialtyNames.<slug>`), and `src/i18n/en.ts` / `ar.ts` both contain a `specialtyNames` catalog. The specialty **catalog** itself comes from the `specialties` table (`shared/src/api/specialties.ts`, `{ slug, name, icon }`).
  - **Doctor names & clinic names** come straight from `doctors.full_name` and `facilities.name` — **English free-text authored in HAMS**, with no Arabic equivalent. Mobile renders them verbatim in both locales.
- **Existing limitations:**
  - Doctor/clinic names have no Arabic source of truth anywhere (DB, shared, or mobile).
  - The specialty i18n map only covers slugs hard-coded in `src/utils/specialties.ts`; a new catalog slug with no map entry falls back to the English DB `name`.
  - The freetext `doctors.specialty` column is matched loosely against the catalog; it is not a normalized FK, so specialty localization is best-effort.
- **Expected UX:** With Arabic selected, a doctor card shows the Arabic name/clinic/specialty when available; when an Arabic value is missing it **gracefully falls back to the English value** (never blank).

## 1a. RECOMMENDED Arabic-name sourcing workflow (answering the product questions)

> The hard constraint: developers cannot hand-translate every onboarded doctor/clinic, and **proper nouns are the worst case for machine translation** — a wrong Arabic name is worse than showing the English one. The recommendation below removes developers from the loop entirely while guaranteeing that only *correct* Arabic names are ever displayed.

**Recommended architecture — a 3-tier "capture → assist → gate" model:**

1. **Tier 1 — Authoritative capture at the source (PRIMARY, highest quality).**
   Add an **Arabic name field to the HAMS onboarding form** for doctors and for clinics/facilities. The person onboarding almost always knows the correct Arabic spelling (it is the entity's real name). This is the gold-standard source and should carry the strongest UI encouragement (optional field, but prompted). *This is a HAMS-side change — outside this repo.*

2. **Tier 2 — Auto-transliteration as an assist, never as truth (FALLBACK / pre-fill).**
   When the Arabic field is left blank, generate a **draft Arabic rendering** using **transliteration** (script conversion of the name), **not semantic machine translation**. This can be a transliteration service/library or an LLM prompted specifically to transliterate a *personal/clinic name* into Arabic script. The draft is stored with a status of `machine`/`unverified` and is used **only to pre-fill the reviewer's field** — it speeds up a human, it does not go live on its own.

3. **Tier 3 — Status-gated display + lightweight review (CORRECTNESS GUARANTEE).**
   Store, alongside each Arabic value, a **status/source flag**: `admin_entered` | `machine_unverified` | `verified`. The MediLink app **displays the Arabic name only when status ∈ {admin_entered, verified}**; `machine_unverified` and absent both **fall back to English**. Unverified drafts surface in a **HAMS admin review queue** (or a doctor self-confirm screen); an approve/edit action flips them to `verified`. This means an auto-generated guess is *never shown to patients* until a human has confirmed it.

**Direct answers to the product questions:**
- **When a new doctor is onboarded, how is the Arabic name created?** Primarily **entered by the HAMS admin/doctor at onboarding** (Tier 1). If left blank, an **auto-transliteration draft** is generated (Tier 2) and queued for review (Tier 3).
- **When a new clinic is onboarded?** Same model — the facility's Arabic name is entered by the admin at onboarding; blank → transliteration draft → review.
- **Should HAMS admins enter both English and Arabic during onboarding?** **Yes — recommended.** Make Arabic an optional-but-prompted field at onboarding. This is the single most scalable, highest-quality lever and requires zero developer effort per entity.
- **Should Arabic values be auto-generated using AI/MT?** **Only as a transliteration *assist*, and only as an unverified draft** — never auto-published. Use **transliteration** (name → Arabic script), not translation (translating a name changes its meaning). LLMs/transliteration libraries handle common Gulf/Arabic names well but still err, so the output must be treated as a suggestion.
- **If automatic translation is used, how is it reviewed?** Via the **status flag + admin review queue**: `machine_unverified` values are hidden from patients (English fallback) and listed for an admin/doctor to approve or correct → `verified`. Optionally, a periodic report lists `machine_unverified`/absent entities so ops can backfill.
- **Most scalable production solution?** The **hybrid**: (Tier 1) onboarding capture covers the majority at top quality with no dev work; (Tier 2) transliteration pre-fill reduces admin typing for the rest; (Tier 3) status-gated display + a small review queue guarantees only correct Arabic is shown and never blocks display (English fallback). Developers are never in the per-entity loop.

**Data-model implication:** the schema in §6 should carry, per localized name, a **`*_ar_status`** (or a `status`/`source` column on the `translations` table) so the app's fallback rule keys on verification status, not merely presence. **HAMS owns the onboarding UI + review queue + (optional) transliteration job; MediLink mobile only reads `verified`/`admin_entered` Arabic with English fallback.**

## 2. Current Architecture
- **Mobile files:** `src/utils/specialties.ts` (slug→i18n key), `src/i18n/en.ts` + `ar.ts` (`specialtyNames`), `src/components/ui/DoctorCard.tsx`, `RecentlyVisitedCard.tsx`, `SpecialtyTile.tsx`, `app/(app)/doctors/[id]/index.tsx`, `app/(app)/search/*`, `src/data/real/index.ts` (`mapDoctorRow`/`mapDoctorDetail`/`mapFacilityToClinic`/`discovery.listSpecialties`).
- **Shared files:** `shared/src/api/doctors.ts` (`searchDoctors`/`getDoctor` — selects `full_name`, `specialty`, `facilities(name)`), `facilities.ts` (`name`), `specialties.ts` (`slug/name/icon`).
- **Backend files:** none directly (these are RLS-safe reads).
- **Database tables:** `doctors` (`full_name`, `specialty` freetext), `facilities` (`name`), `specialties` (`slug`, `name`, `icon`, `sort_order`, `is_active`).
- **API endpoints:** none (Supabase-direct via shared API under RLS public/relevant read policies).
- **Navigation:** unaffected.
- **State management:** React Query hooks (`useDoctors`, `useDiscovery`, etc.); no store changes.

## 3. Required Mobile Changes
- `src/utils/specialties.ts` — ensure the slug→key map covers **all** active catalog slugs; add a resolver that, given a specialty slug/name, returns `t("specialtyNames.<slug>")` and falls back to the raw DB `name`.
- `src/i18n/en.ts` + `ar.ts` — extend `specialtyNames` to the full catalog (any missing slugs).
- **Doctor/clinic names (phase 2):** the domain models (`Doctor`, `Clinic` in `src/data/types.ts`) and mappers in `src/data/real/index.ts` must carry an optional localized name (e.g. `full_name_ar`, `facility_name_ar`) once the data layer exposes it. UI components (`DoctorCard`, `RecentlyVisitedCard`, doctor detail, search results, map callouts) select the localized field when `isRTL`, else English.
- No new screens; no navigation changes.

## 4. Required Shared Layer Changes
- **Specialties (phase 1):** none required (already `{ slug, name, icon }`); mobile localizes by slug.
- **Doctor/clinic names (phase 2):** `shared/src/api/doctors.ts` and `facilities.ts` must **select** the new localized columns (or join the translations table) and return them on the row; the returned types flow through generated `shared/src/types/supabase.ts` (regenerated after migration) or the manual augmentation in `shared/src/types/index.ts`.
- New shared helper (optional): a `localizedName(row, locale)` utility so web and mobile share the fallback rule.

## 5. Required Backend Changes
- **None for specialties.**
- **Doctor/clinic names:** no new API routes required on the MediLink backend if names are exposed via the same RLS-safe reads. Per §1a, the **owning system for Arabic-name capture, the optional transliteration job, and the review queue is HAMS** (out of this repo's scope). MediLink mobile only *reads* Arabic values whose status is `verified`/`admin_entered`. No services/jobs/storage changes on the MediLink backend.

## 6. Required Database Changes
- **Specialties:** *optional* — if we prefer DB-driven specialty localization over app i18n, add a nullable `name_ar` to `specialties`. Recommended: **keep app i18n** (no migration) since the catalog is small and controlled.
- **Doctor/clinic names — two candidate migrations (choose one; see §11). Each MUST include the status flag from §1a so the app only shows verified Arabic:**
  - **Option A (per-table columns):** add nullable `full_name_ar` + `full_name_ar_status` to `doctors`, and `name_ar` + `name_ar_status` to `facilities` (status enum: `machine_unverified | admin_entered | verified`).
    - Tables affected: `doctors`, `facilities`. New columns: 4 (2 value + 2 status). No new FKs. No constraints beyond nullable text + a status default. RLS: existing read policies already expose these tables — new columns inherit them; confirm the select policies don't column-restrict.
  - **Option B (central translation table):** new `translations(entity_type, entity_id, field, locale, value, status)` with a composite unique index `(entity_type, entity_id, field, locale)` and a covering lookup index; no FK (entity_id is polymorphic → app-enforced); RLS **public/authenticated read** policy mirroring the underlying entity's visibility.
- **Migration strategy (no SQL here):** additive-only, reversible. (1) Create the column(s)/table with nullable values + status and read RLS; deploy — zero behavioral change (all null/unverified → English fallback). (2) HAMS captures/verifies Arabic values over time (see §1a). (3) Mobile/shared start reading the new field **gated on status** behind the fallback. Regenerate `shared/src/types/supabase.ts` (`npm run db:types`) after the migration and delete any temporary type augmentation. No destructive operations; existing rows unaffected.

## 7. API Design
- No new REST endpoints. Reads remain Supabase-direct via shared API.
- **Contract change (phase 2):** `searchDoctors`/`getDoctor`/`listFacilities` response rows gain optional `full_name_ar` / `name_ar` (Option A) or the resolver joins `translations` (Option B). Validation: none (read path). Error cases: unchanged; missing Arabic → English fallback (never an error).

## 8. UI Changes
- **Specialties:** no visible structural change; chips/tiles already localize by slug — only broader coverage.
- **Doctor/clinic (phase 2):** `DoctorCard`, `RecentlyVisitedCard`, doctor detail header, search results, and map callouts render the localized name in AR. Wireframe-level: identical layout; only the string source changes — the fallback keys on the §1a status: `isRTL && nameArStatus ∈ {verified, admin_entered} ? nameAr : nameEn`. RTL alignment already handled by the `Text` primitive.

## 9. Localization
- EN canonical, AR mirror — enforced by the `Messages` type.
- **Keys to add:** extend `specialtyNames.*` to cover every active `specialties.slug` not already present. Doctor/clinic names are **data**, not translation keys — they live in the DB (Option A/B), not `en.ts`/`ar.ts`.

## 10. Security
- Authentication/authorization: no impact (public/relevant read data).
- Privacy: doctor/clinic names are already public catalog data — no new sensitive data.
- RLS: new columns/table must be readable under the same policy as the parent entity; verify the `translations` policy cannot leak values for entities the user can't see (scope by entity visibility if Option B).

## 11. Risks
- **Technical:** Option B adds a join/lookup + caching concern; Option A widens two tables but is simplest. Freetext `doctors.specialty` means specialty localization stays best-effort.
- **Product:** transliteration-vs-official-name policy is **resolved by §1a** (transliteration is an unverified assist only; only `verified`/`admin_entered` values display). Residual risk: reliance on HAMS to actually capture/verify — mitigated by the review queue + backfill report and the always-safe English fallback.
- **Migration:** additive/reversible — low risk. Regenerating types must not clobber manual augmentations.
- **Backward compatibility:** full — null Arabic → English fallback; old clients ignore the new fields.
- **Deployment:** specialties ship anytime (mobile-only). Doctor/clinic names ship the migration first (inert), then reads, then backfill.

## 12. Estimated Complexity
- Mobile: **Low** (specialties) / **Low–Medium** (doctor-clinic display wiring).
- Backend: **None** (specialties) / **Low** (select changes).
- Database: **None** (specialties) / **Low** (Option A) or **Medium** (Option B).
- Overall: **Low** for specialties; **Medium** for full doctor/clinic (dominated by the HAMS data-authoring dependency, not code).

## 13. Implementation Order
1. **Specialties i18n coverage** (mobile-only, no deps) — immediate.
2. **DB migration** for doctor/clinic Arabic + status (Option A recommended) — inert on deploy.
3. **HAMS-side workflow** (§1a): onboarding Arabic field + optional transliteration pre-fill + review queue → writes `verified`/`admin_entered` values.
4. **Shared/mobile read + status-gated fallback** wiring.
- Dependency: 4 depends on 2; the *visible value* of 4 depends on 3 (data). 1 is independent. 3 is a **HAMS** deliverable, not this repo.

## 14. Testing Strategy
- Unit: specialty resolver fallback (slug present/absent); `localizedName` fallback.
- Integration: shared read returns localized field; mobile mapper carries it.
- Manual QA: AR locale — specialties localized; doctor/clinic show Arabic when present, English when null.
- Regression: EN locale unchanged; no layout/RTL regressions; missing-key fallback intact.

**Per-feature answers:**
- Mobile-only? **Specialties: yes. Doctor/clinic names: no.**
- Backend work? Specialties: no. Doctor/clinic: minor (select) — no new routes.
- DB migration? Specialties: no. Doctor/clinic: **yes**.
- Product approval? Specialties: no. Doctor/clinic: **sourcing workflow recommended in §1a — awaiting go-ahead before implementation** (feature approved in principle; the *how* is the open item).
- HAMS changes? **Yes** — onboarding Arabic field + optional transliteration + review queue (§1a). None for specialties.
- Deploy independently? **Yes** (specialties immediately; doctor/clinic in inert-migration-first stages; Arabic values appear as HAMS verifies them).

---

# Feature 2 — Civil Number

## 1. Feature Overview
- **Status: ✅ APPROVED (2026-07-16).** Patient-editable, stored in DB, **optional** (may become mandatory later), format-validated.
- **Business requirement:** Capture and display the patient's Civil Number (Oman national ID, typically 8 digits) in the profile.
- **Current implementation:** **Does not exist.** No civil-number field in mobile domain types, shared profile API, or the DB. (`national_id` exists only as a *doctor document-type enum value* — unrelated.)
- **Existing limitations:** There is no column to store it, no field to edit it, no display row.
- **Expected UX:** A "Civil Number" field on the profile display (`(tabs)/profile.tsx`) and an editable input on `edit-profile.tsx`, localized EN/AR, RTL-aware, **masked after save** (see recommendation).

### Engineering recommendation — uniqueness & masking (locked to best practice)
- **Masking: YES (implement).** Civil number is sensitive national-ID PII. After save, display it **masked** (e.g. `••••••12`, last 2–4 digits) with an optional tap-to-reveal. Rationale: reduces shoulder-surfing/screenshot exposure; standard for national-ID handling. The full value remains editable in `edit-profile`.
- **Hard DB uniqueness: NO for v1 (recommended); enforce a *deferred* partial unique index later.** Rationale:
  1. Adding a `UNIQUE` constraint in the initial migration can **fail to create** if any existing/HAMS-side rows already hold duplicate or dirty values (the schema is shared with HAMS).
  2. A live "civil number already in use" error is an **enumeration leak** (reveals that an ID is registered).
  3. Civil number *is* semantically unique per person, so we keep the door open: once data is verified clean, add a **partial unique index over non-null values** in a follow-up hardening migration, and surface any violation as a **generic** "couldn't save, please check your details" message (never "already in use").
  - **v1 therefore:** nullable, strict client+`CHECK` format validation, masked display, **no hard unique constraint**. Uniqueness handled as a later, low-risk hardening step.

## 2. Current Architecture
- **Mobile files:** `app/(app)/(tabs)/profile.tsx` (display), `app/(app)/edit-profile.tsx` (edit form), `src/data/types.ts` (`ProfilePatient`, `ProfilePatch`), `src/data/repositories.ts` (`PatientRepository`), `src/data/mock/index.ts` + `real/index.ts` (`toDomainProfile`, `updateProfile`), `src/utils/validation.ts`.
- **Shared files:** `shared/src/api/profile.ts` — `MyProfile { account: profiles, patient: patient_profiles }`, `ProfilePatch`, `getMyProfile`/`updateMyProfile`.
- **Backend files:** none (profile CRUD is RLS-safe, patient-owned).
- **Database tables:** `patient_profiles` (clinical identity: dob/gender/blood_group/address/emergency_contact/profile_photo_url, keyed by `user_id`). Civil number belongs here.
- **API endpoints:** none (Supabase-direct).
- **Navigation / state:** no changes; React Query `useProfile`/`useUpdateProfile`.

## 3. Required Mobile Changes
- `src/data/types.ts` — add `civil_number: string | null` to `ProfilePatient`; add `civil_number?: string | null` to `ProfilePatch`.
- `src/data/real/index.ts` — `toDomainProfile` reads `p.patient.civil_number`; `updateProfile` passes it through.
- `src/data/mock/index.ts` — add a mock value + patch handling.
- `app/(app)/edit-profile.tsx` — add a `TextField` (numeric keyboard, `maxLength`, validation), wired into the existing form + save payload.
- `app/(app)/(tabs)/profile.tsx` — add a **masked** display row (e.g. `••••••12`) with an optional tap-to-reveal (per §1 recommendation).
- `src/utils/validation.ts` — add a civil-number rule (digits-only, expected length; **empty allowed** — optional per the approved decision).

## 4. Required Shared Layer Changes
- `shared/src/api/profile.ts` — add `civil_number` to `ProfilePatch`; map it into `patientPatch`. `MyProfile.patient` is `Row<"patient_profiles">`, so it surfaces automatically once the column exists and types are regenerated.
- `shared/src/types/supabase.ts` — regenerate after migration (or temporarily augment `types/index.ts`).
- Optional shared validation constant (length/format) shared by web + mobile.

## 5. Required Backend Changes
- **None** (no new route/service/job/storage). Civil number is patient-owned data updatable under the existing `patient_profiles` self-update RLS.
- RLS consideration: confirm the existing `patient_profiles` update policy scopes to `user_id = auth.uid()` and that the new column is not restricted by any column-level policy.

## 6. Required Database Changes
- **Migration 1 (v1 — required):** Table `patient_profiles`. **New column:** `civil_number text NULL`. **Constraints:** a `CHECK` enforcing the digit format (e.g. 8 digits) — allow NULL. **Index:** none in v1. **Policies/RLS:** inherits existing `patient_profiles` self-scoped policies; verify no column restriction. Deploy is inert (all null). Reversible (drop column). No backfill.
- **Migration 2 (deferred hardening — optional, later):** add a **partial unique index** on `civil_number WHERE civil_number IS NOT NULL`, only **after** verifying existing/HAMS data has no duplicates. Violations surfaced generically (no enumeration). Reversible (drop index). See §1 recommendation and §11.
- **Migration strategy:** additive-only, reversible; regenerate `shared/src/types/supabase.ts` (`npm run db:types`) after Migration 1.

## 7. API Design
- No REST endpoint. Contract change: `updateMyProfile` accepts `civil_number`; `getMyProfile().patient` returns it.
- Validation (client + optional DB CHECK): digits only, expected length (confirm 8 for Oman). Error cases: invalid format → client validation message; DB rejects only if a CHECK/uniqueness constraint is added.

## 8. UI Changes
- `edit-profile.tsx`: one new labeled `TextField` (numeric), placed with the identity fields; RTL-aware; validation error inline.
- `profile.tsx`: one new display row under identity (optionally masked with a reveal affordance).
- No navigation changes.

## 9. Localization
- Keys to add (EN + AR): `profile.civilNumber` (label), `edit.civilNumber`/placeholder, `validation.civilNumber` (format message). Numerals follow the app-wide Western-digit rule already in place.

## 10. Security
- Authentication: none.
- Authorization: patient self-update only (RLS).
- **Privacy:** civil number is **sensitive PII** — requires product/compliance sign-off to collect and store; consider masking in the UI, excluding it from logs/analytics, and confirming it is not shared to third parties. Data at rest is protected by Supabase; ensure no plaintext logging.
- RLS: must be readable/writable only by the owning patient (and existing HAMS roles as already policied).

## 11. Risks
- **Technical:** low — one column + straightforward wiring.
- **Product:** **RESOLVED** — optional; format-validated; masked; no hard uniqueness in v1 (deferred partial index). Confirm the exact digit length for the `CHECK` (assumed 8 for Oman).
- **Migration:** additive/reversible — low risk. The deferred unique index (Migration 2) must run only against verified-clean data to avoid a failed index build.
- **Backward compatibility:** full — nullable column; older clients ignore it.
- **Deployment:** independent; Migration 1 first (inert), then mobile.
- **Compliance:** national-ID collection **approved**; still ensure no plaintext logging/analytics and no third-party sharing.

## 12. Estimated Complexity
- Mobile: **Low.** Backend: **None.** Database: **Low** (1 column). Overall: **Low–Medium** (dominated by the compliance decision, not code).

## 13. Implementation Order
1. ~~Product/compliance approval~~ — **DONE** (optional, masked, no hard uniqueness, confirm digit length).
2. Migration 1 (nullable column + format `CHECK`) → regenerate types.
3. Shared `ProfilePatch` + shared validation constant.
4. Mobile types/repos/edit(field)/display(masked) + i18n.
5. *(Deferred, optional)* Migration 2 — partial unique index once data verified clean.
- Dependency: 3–4 depend on 2; 5 is a later hardening step.

## 14. Testing Strategy
- Unit: validation rule (valid/invalid/empty); mapper round-trip.
- Integration: `updateMyProfile({civil_number})` persists; `getMyProfile` returns it.
- Manual QA: enter/edit/clear; masked display; EN/AR + RTL.
- Regression: existing profile fields unaffected; empty civil number doesn't break save.

**Per-feature answers:**
- Mobile-only? **No** (needs DB + shared).
- Backend work? **No** (no new routes; RLS only).
- DB migration? **Yes** (Migration 1 nullable column + `CHECK`; optional deferred Migration 2 partial unique index).
- Product approval? **✅ Done** (optional, masked, no hard uniqueness in v1).
- HAMS changes? **No code change**; confirm no conflict with HAMS-side civil-number storage before enabling the deferred unique index.
- Deploy independently? **Yes.**

---

# Feature 3 — Guest Mode

## 1. Feature Overview
- **Status: ✅ APPROVED (2026-07-16)** with the explicit capability list below. Minimize friction; keep patient data fully protected. Every restricted action shows a friendly "create an account / sign in to continue" message.
- **Business requirement:** Let a user browse discovery surfaces without signing in, with a clear sign-in wall on anything patient-specific.
- **Guests CAN (allow-list — read-only discovery + device-local prefs):**
  - Browse doctors · browse clinics · search doctors · search clinics
  - View doctor profiles · view clinic details · view doctor availability · view clinic locations/maps
  - Browse services & specialties
  - Change language · change appearance/theme · access **general** settings that contain **no** personal data
- **Guests must NOT (deny-list — every patient-scoped action → sign-in wall):**
  - Book appointments · make payments · view appointments · Medical Records · Document Vault · Lab Reports · Prescriptions · Profile · Family · Notifications · Payment History · upload personal documents · any other patient-specific action
- **Current implementation:** The `authStore` status `"guest"` today means **"no session → redirect to sign-in"** (`app/(app)/_layout.tsx`). Every launch path funnels to auth. Mock mode is *not* guest mode. There is **no browse-as-guest**.
- **Existing limitations:** No unauthenticated browsing; the entire `(app)` group is gated.
- **Expected UX:** A "Continue as guest" CTA (welcome/sign-in). Guests land on discovery; the allow-listed routes render; every deny-listed entry point triggers a friendly sign-in wall. A guest can upgrade to authed at any point; if they were mid-booking, the **resume-after-signup flow (R6)** restores their selection after onboarding.

## 2. Current Architecture
- **Mobile files:** `src/stores/authStore.ts` (`status: loading|authed|guest`), `app/(app)/_layout.tsx` (gate → redirect guests), `app/index.tsx`, `splash.tsx`, `welcome.tsx`, `onboarding.tsx`, `src/providers/AuthProvider.tsx`, all patient screens under `(app)/`.
- **Shared files:** `shared/src/api/*` reads run under the caller's session; anon access depends on each table's RLS.
- **Backend files:** none directly; anon reads are governed by Supabase RLS.
- **Database tables / RLS:** `specialties` has a public-read policy; `doctors`/`facilities`/`reviews` read policies must be checked for **anon** role access. Patient tables (`patient_profiles`, `appointments`, `family_members`, `payments`, `prescriptions`, `lab_results`, `favourites`, `in_app_notifications`) are `auth.uid()`-scoped → unavailable to guests by design.
- **Navigation / state:** the single `(app)` gate; `authStore` drives routing.

## 3. Required Mobile Changes
- `src/stores/authStore.ts` — introduce a distinct guest-browsing state (e.g. add `"guest-browsing"` or a `guestMode` boolean) separate from "no session → must log in".
- `app/(app)/_layout.tsx` — allow guest-browsing into an allowlist of read-only routes; keep redirecting for everything else.
- `welcome.tsx` / `sign-in.tsx` — add a "Continue as guest" CTA that sets guest-browsing and routes into the app.
- Patient-action entry points (book button, records/profile/family/payments tabs, favourite toggles) — gate behind a reusable "sign in to continue" prompt when in guest mode.
- `src/data/index.ts` — ensure discovery/doctor/specialty reads work without a session (they already call Supabase with the anon key); patient repos must not be invoked in guest mode.
- Supabase client already uses the anon key, so unauthenticated reads work **iff** RLS permits.

## 4. Required Shared Layer Changes
- Likely none functionally — the shared reads already accept any `DB`. Add (optional) a documented list of "guest-safe" read functions.
- Possibly a helper to detect "no session" cleanly for guest flows.

## 5. Required Backend Changes
- No new routes. The **real work is RLS validation/relaxation** (DB) so the anon role can read discovery data. Authorization: ensure guests cannot reach any privileged backend route (they have no bearer token → those already 401).

## 6. Required Database Changes
- **RLS + grants (no schema changes):** add **anon read** policies for `doctors`, `facilities`, and (if shown) `reviews` — mirroring the existing `specialties_public_read` — **plus anon `EXECUTE` grants on the read-only availability RPCs** (`get_available_slots`, `doctors_available_today`) per **R1**. Booking/payment RPCs get **no** anon grant. **No** new tables/columns/indexes/FKs.
- **Migration strategy:** one additive migration granting `anon` SELECT (read-only discovery tables) + `EXECUTE` (availability RPCs only). Reversible (`REVOKE`/drop policy). Scoped narrowly. If product later decides guests get *zero* live data, **no DB change at all**.

## 7. API Design
- No new endpoints. Behavior change: discovery reads succeed for anon (if RLS allows); patient reads remain denied (surfaced as a sign-in wall, not an error).

## 8. UI Changes
- New "Continue as guest" CTA on welcome/sign-in.
- Guest variant of tabs: discovery/search + settings (language/appearance/general) visible; patient tabs (profile/records/family/notifications/payments) show a sign-in wall.
- Reusable "Sign in to continue" sheet/prompt for every deny-listed action (book, pay, favourite, upload, and each patient tab).
- Navigation: `(app)` gate allows the allow-listed read-only subset for guests; deep links to patient routes redirect to the wall.
- **Dependency note — "view clinic locations/maps":** the allow-list includes maps, but `search/map.tsx` is currently a **fake shell** (per `docs/MOBILE_IOS_RELEASE_PLAN.md` M3 / `PRODUCTION_READINESS_AUDIT.md`). Guest map access is only meaningful once that screen shows real clinic locations; until then, either wire it or keep it hidden for guests too (it is not a guest-specific blocker).
- **Settings caveat:** expose only the no-personal-data rows to guests (language, appearance, general/about). Hide/gate account rows (medical history, notifications prefs, sign-out, delete/export) behind the wall.

## 9. Localization
- Keys to add (EN + AR): `guest.continueAsGuest`, `guest.signInToContinueTitle/Body`, `guest.signInCta`, and any guest-empty-state copy. RTL-aware.

## 10. Security
- **Authentication:** introduces an explicitly unauthenticated app state — must be clearly bounded.
- **Authorization/RLS:** the crux — anon must read **only** intended discovery data; every patient-scoped table must remain `auth.uid()`-gated. Audit each read path.
- **Privacy:** guests must never see another user's data; ensure no cached patient data persists into guest mode (reuse `queryClient.clear()` semantics).
- Sensitive data: none exposed to guests by design.

## 11. Risks
- **Technical:** large surface — every patient action needs gating; risk of a screen assuming a session. RLS misconfiguration could over-expose data (**highest risk** — mandatory staging RLS test that anon is denied on every patient table).
- **Product:** **RESOLVED** — capability allow/deny lists are locked (§1). Residual: keep the two lists authoritative as new screens are added.
- **Migration:** RLS-only, reversible, but security-sensitive — needs review + staging verification before enabling live guest reads.
- **Backward compatibility:** authed flows unchanged; the new state is additive.
- **Deployment:** can ship behind a flag; RLS change (if any) deploys first and must be verified in staging.

## 12. Estimated Complexity
- Mobile: **High** (state + gate + per-action walls). Backend: **Low** (no routes). Database: **Low–Medium** (RLS audit/policies, security-critical). Overall: **High.**

## 13. Implementation Order
1. ~~Product spec~~ — **DONE** (allow/deny lists locked in §1).
2. RLS audit (and any anon-read policy migration for `doctors`/`facilities`/`reviews`) — verify in staging that anon is **allowed** on discovery tables and **denied** on every patient table.
3. `authStore` guest-browsing state + `(app)` gate allowlist.
4. Guest CTA + per-action sign-in walls + guest empty states + settings gating + i18n.
- Dependency: 3–4 depend on the §1 lists (done); 2 must be validated before enabling live guest reads. **Sequence the auth-screen edits after F4's email/phone work** to avoid conflicts on `sign-in`/`welcome`.

## 14. Testing Strategy
- Unit: gate logic (guest vs authed route access); action-wall triggers.
- Integration: anon reads succeed for allowlisted tables and are **denied** for patient tables (RLS tests).
- Manual QA: full guest walkthrough — browse, hit each wall, sign in mid-flow (state upgrades cleanly), sign out returns to guest/auth.
- Regression: authed experience unchanged; no cached patient data leaks into guest mode.

**Per-feature answers:**
- Mobile-only? **Mostly**, *if* discovery RLS already allows anon; otherwise **no** (needs RLS change).
- Backend work? **No new routes**; RLS work only.
- DB migration? **Possibly** (anon-read RLS policies) — or none if guests get no live data.
- Product approval? **✅ Done** (allow/deny lists locked in §1).
- HAMS changes? **No.**
- Deploy independently? **Yes** (behind a flag; RLS validated first).

---

# Feature 4 — Login Simplification

## 1. Feature Overview
- **Status: ✅ APPROVED (2026-07-16).** The login screen offers a **choice of ONE identifier — Email OR Mobile Number** (not both). Both are **passwordless OTP** flows.
- **Business requirement:** Reduce login to a single identifier the user picks:
  - **Email flow:** enter email → receive email OTP → verify → signed in.
  - **Phone flow:** enter phone → receive **SMS OTP** → verify → signed in.
- **Current implementation:** Sign-in is **email + password** (`app/auth/sign-in.tsx`). Auth runs entirely through **official Supabase Auth** (`shared/src/api/auth.ts`): `signInWithPassword`, `signUp`, `verifyEmailOtp` (types `signup|recovery|email`), `resendSignupOtp`, `resetPasswordForEmail`, `updatePassword`. **Email OTP is already live** for signup confirmation + recovery. Google/Apple are honest-disabled. There is **no `signInWithOtp`** wrapper yet. Backend `send-otp`/`verify-otp` are a **legacy phone-verification** flow whose **SMS delivery is not wired** ("deferred task T5").
- **Existing limitations:** No passwordless login; **no working phone login (no SMS provider)** → the phone flow is **blocked on infra** (see §5).
- **Readiness split:** **Email flow = ✅ ready to build now** (reuses live email OTP). **Phone flow = 🔴 blocked** until an SMS provider is provisioned; ship the email option first and light up phone when SMS is ready.
- **Expected UX:** Sign-in shows a segmented **Email / Mobile** toggle; the user fills exactly one, taps "Send code", enters the 6-digit code on the OTP screen (`flow="login"`), and is signed in. Password login can remain as an optional path during transition (see §11).

## 2. Current Architecture
- **Mobile files:** `app/auth/sign-in.tsx`, `sign-up.tsx`, `otp.tsx` (6-digit, `flow` = `signup|recovery`), `forgot-password.tsx`, `reset-password.tsx`; `src/services/authService.ts`; `src/data/real/index.ts` (`authRepo`); `src/hooks/queries/useAuth.ts`.
- **Shared files:** `shared/src/api/auth.ts` (Supabase Auth wrappers).
- **Backend files:** `backend/src/app/api/auth/{send-otp,verify-otp,resend-otp,signup,set-password,session-log,2fa,google}` — legacy `otp_records`/phone flow, **retired for login**, SMS not wired.
- **Database tables:** Supabase Auth (`auth.users`) + `profiles`. Legacy `otp_records` (unused by mobile).
- **API endpoints:** Supabase Auth (direct) for the live flow; backend auth routes largely legacy.
- **Navigation / state:** auth stack (`app/auth/*`), `authStore` via `AuthProvider`.

## 3. Required Mobile Changes (Email OR Phone toggle)
- `app/auth/sign-in.tsx` — add an **Email / Mobile segmented toggle**; render an email field or a `PhoneField` (E.164, `+968` default — the component already exists in sign-up) based on the choice; a single "Send code" button. Keep password login available during transition (secondary path).
- `app/auth/otp.tsx` — add a `flow="login"` branch carrying the identifier + channel (`email` | `sms`); on success land authed.
- `src/services/authService.ts` — add `sendLoginOtp({ email })` / `sendLoginOtp({ phone })` and `verifyLoginOtp(code, identifier, channel)` (reusing `verifyEmailOtp` for email, `verifyOtp({type:"sms"})` for phone).
- `src/data/real/index.ts` + `repositories.ts` + `mock/index.ts` — add the two methods to the `AuthRepository` interface with mock + real implementations.
- `src/hooks/queries/useAuth.ts` — hooks for the new mutations.
- `src/utils/validation.ts` — a schema that requires **exactly one** of email/phone for the chosen channel.
- **Phone path** additionally depends on the SMS provider (see §5) — build the UI now, gate the phone option behind a feature flag until SMS is live.

## 4. Required Shared Layer Changes
- `shared/src/api/auth.ts` — add **`signInWithEmailOtp(db, email)`** → `supabase.auth.signInWithOtp({ email, options:{ shouldCreateUser:false } })`, and **`signInWithPhoneOtp(db, phoneE164)`** → `supabase.auth.signInWithOtp({ phone, options:{ shouldCreateUser:false } })`. Verification reuses `verifyEmailOtp` (`type:"email"`) and adds a phone verify (`verifyOtp({ phone, token, type:"sms" })`).
- Validation constant shared by web+mobile: exactly one identifier per channel; E.164 phone format.

## 5. Required Backend Changes
- **Email flow:** **none** — Supabase sends the email OTP directly; no MediLink backend route needed. **Ready now.**
- **Phone flow — BLOCKED. Outstanding infra/provider work required before it can be enabled:**
  1. **Choose & contract an SMS provider** supported by Supabase Auth (Twilio, Twilio Verify, MessageBird, Vonage, or a custom SMS hook) — with **Oman (+968) deliverability** confirmed.
  2. **Provision credentials** (account SID/API key, sender ID or number; for KSA/Gulf, sender-ID registration may be required).
  3. **Enable Phone auth in Supabase** and configure the SMS provider + message template in Auth settings.
  4. **Cost/ops sign-off** — per-SMS pricing, monthly budget, and abuse controls.
  5. **Rate-limiting / anti-abuse** for OTP issuance (Supabase throttles, but confirm limits; consider per-number cooldowns to prevent SMS-bombing) and **429 handling** in the app.
  6. (Optional) Decommission the legacy `otp_records` `send-otp`/`verify-otp` routes to avoid confusion — they do not deliver SMS and are unused by the new flow.
  - No MediLink **custom** backend route is needed if Supabase-native phone OTP is used — this is **configuration + provider**, not code.

## 6. Required Database Changes
- **Email-only:** none (Supabase Auth manages OTPs).
- **Mobile-only:** none schema-wise in MediLink; provider config lives in Supabase Auth settings. (Legacy `otp_records` remains unused.)

## 7. API Design
- No custom endpoints (Supabase-direct).
- **Email flow:** `signInWithOtp({ email, shouldCreateUser:false })` → email code → `verifyOtp({ email, token, type:"email" })` → session.
- **Phone flow:** `signInWithOtp({ phone, shouldCreateUser:false })` → SMS code → `verifyOtp({ phone, token, type:"sms" })` → session. *(Requires the §5 SMS provider.)*
- Validation: exactly one identifier (valid email **or** E.164 phone); 6-digit code. Error cases: unknown identifier (with `shouldCreateUser:false`, show a **neutral** "if an account exists, a code was sent" to avoid enumeration), expired/invalid code, rate-limited (429 → `errors.otpTooMany`), SMS-undeliverable (phone).

## 8. UI Changes
- `sign-in.tsx`: **Email / Mobile segmented toggle** + the matching input + a single "Send code" button. Phone option is feature-flagged off until SMS is live. Password path may remain as a secondary option during transition.
- `otp.tsx`: `flow="login"` copy/behavior (channel-aware: "check your email" vs "check your messages"); on verify → dashboard.
- Navigation: sign-in → otp(login) → dashboard. No new screens.

## 9. Localization
- Keys to add (EN + AR): `signIn.identifierEmail`, `signIn.identifierPhone`, `signIn.sendCode`, `otp.loginTitle/Body`, `otp.checkEmail`, `otp.checkSms`, plus reuse existing `errors.otp*`. RTL-aware; phone field keeps LTR entry.

## 10. Security
- **Authentication:** shifts a factor from password to email possession (email-only). Consider keeping password as an option for account recovery.
- **Authorization:** unchanged post-login.
- **Privacy:** avoid email enumeration (neutral messaging; `shouldCreateUser:false`).
- Rate-limiting: rely on Supabase OTP throttling; surface 429 clearly. Phone OTP adds SMS-bomb/abuse considerations and cost.
- Sensitive data: OTP codes never logged (already the rule in `authService`).

## 11. Risks
- **Technical (email-only):** low — reuses live email-OTP + existing OTP screen.
- **Technical (phone):** high + **blocked** on provider.
- **Product:** replacing password entirely affects existing users/recovery — prefer **adding** email-code login alongside password initially, then deprecating.
- **Migration:** none (email-only).
- **Backward compatibility:** keep password path during transition to avoid locking out users.
- **Deployment:** email-only ships independently; phone-only cannot ship until SMS is provisioned.

## 12. Estimated Complexity
- Mobile: **Medium** (email-only) / **Medium–High** (phone). Backend: **None** (email) / **High + blocked** (phone provisioning). Database: **None.** Overall: **Medium** (email-only) / **High + blocked** (phone).

## 13. Implementation Order
1. ~~Product decision~~ — **DONE** (Email OR Phone, choose one; passwordless OTP; keep password during transition).
2. **Email flow (now):** shared `signInWithEmailOtp` → authService/repo → sign-in toggle + otp(login) → i18n. Ship with the phone option flagged off.
3. **Phone flow (blocked):** complete the §5 SMS-provider checklist → add `signInWithPhoneOtp` + sms verify → flip the phone flag on.
- Dependency: 2 has no external deps; 3 is blocked purely on the SMS provider/config (no code blocker). **Coordinate the `sign-in`/`welcome` edits with F3's guest CTA.**

## 14. Testing Strategy
- Unit: OTP flow state; validation (email format, code length); enumeration-safe messaging.
- Integration: `signInWithOtp` → `verifyOtp(type:"email")` establishes a session (staging Supabase).
- Manual QA: happy path, wrong/expired code, rate-limit, unknown email; ensure existing password login still works during transition.
- Regression: signup + recovery OTP flows unaffected (shared screen); session persistence + Remember Me still hold.

**Per-feature answers:**
- Mobile-only? **Email flow: yes** (mobile + shared, no backend). **Phone flow: no** (needs SMS provider config, not code).
- Backend work? Email: **no.** Phone: **provider/config only** (no custom route).
- DB migration? **No** (either channel).
- Product approval? **✅ Done** (Email OR Phone, choose one; keep password during transition).
- HAMS changes? **No.**
- Deploy independently? **Email now; phone once SMS provisioned.**

---

# Cross-Feature Analysis

## Dependency Graph
```
                         ┌─────────────────────────────────────────┐
                         │        Shared infra / conventions         │
                         │  additive migrations · shared/api · i18n  │
                         └─────────────────────────────────────────┘
                                  │            │            │
        ┌─────────────────────────┘            │            └───────────────────────┐
        ▼                                       ▼                                    ▼
┌───────────────────┐           ┌───────────────────────────┐          ┌────────────────────────┐
│ F1 Arabic names   │           │ F2 Civil Number           │          │ F4 Login Simplification│
│ • specialties     │           │ • patient_profiles column │          │ • email-only (now)     │
│   (mobile-only)   │           │ • shared + mobile + PII    │          │ • phone (BLOCKED: SMS) │
│ • doctor/clinic   │           └───────────────────────────┘          └────────────────────────┘
│   (DB + HAMS data)│                                                            │
└───────────────────┘                                                            │ shares the
        (independent)                                                            │ auth stack with
                                                                                 ▼
                                                             ┌────────────────────────────────────┐
                                                             │ F3 Guest Mode                        │
                                                             │ • authStore + (app) gate + RLS audit │
                                                             │ • coordinate with F4 (auth entry)    │
                                                             └────────────────────────────────────┘
```
- **F1, F2, F4 are mutually independent.**
- **F3 and F4 both touch the auth entry/routing** (`sign-in`/`welcome`/`authStore`/gate) → sequence them so the "Continue as guest" CTA and any new "email code" CTA are designed together and don't conflict on the same screens.
- Everything shares the **additive-migration + shared-API + i18n** conventions but has no hard code dependency across features.

## Recommended Implementation Order (post-approval)
1. **F1 — Specialties i18n** (mobile-only, ~hours, no deps, immediate AR UX win).
2. **F4 — Email login (OTP)** — approved; reuses live email OTP; ship with the phone option flagged off, password kept during transition.
3. **F2 — Civil Number** — approved; Migration 1 (inert) → shared → mobile (masked, optional). Defer Migration 2 (unique index).
4. **F3 — Guest Mode** — approved; do the RLS audit first, then state/gate/walls. **Do F4's sign-in edits before F3's guest CTA** (same screens).
5. **F1 — Doctor/clinic Arabic names** — land the inert migration (+ status flag) anytime; display wiring lights up as HAMS verifies data (see §1a).
6. **F4 — Phone login** — **blocked** on the §5 SMS-provider checklist; enable once provisioned.

## Which features should be completed before production
- **F1 specialties** — recommended (cheap, visible AR quality improvement).
- **F4 email login** — recommended if reduced login friction is a launch goal (low risk, reuses live infra).
- **F2 Civil Number** — include at launch **only if** the business needs national ID captured on day one (approved, but low urgency otherwise).
- **F3 Guest Mode** & **F4 phone login** are **not** launch blockers.

## Which features can safely be postponed
- **F3 Guest Mode** — approved but highest effort + RLS-security-critical; postpone unless guest onboarding is a launch goal.
- **F4 phone login** — **blocked** on SMS provider; enable post-provisioning.
- **F1 doctor/clinic Arabic display** — gated on ongoing HAMS Arabic-data verification (§1a); ship the inert migration whenever, defer the visible wiring until enough `verified` data exists.

---

## Global "gotchas" the implementer must respect
- **Never fork the Supabase schema** — all DB work is additive migrations under `supabase/migrations/`, then `npm run db:types` to regenerate `shared/src/types/supabase.ts` (delete the temporary augmentation in `shared/src/types/index.ts` once real).
- **Mobile screens go through `repositories` + domain types only** — thread new fields through `types.ts` → `repositories.ts` → mock → real → `data/index.ts`.
- **i18n parity is type-enforced** — every new EN key needs an AR mirror; keep the app-wide **Western-numeral** rule and **RTL** behavior intact.
- **Keep `typecheck` + (mobile) `lint` green** and preserve the Phase 3 fixes already on this branch (auth navigation, Remember Me, PDF sharing, gear icon, family title, Arabic typography, English numerals).

---

# Booking & Payment Product Decisions (Locked – 2026-07-16)

Product owner: Vikas. These decisions are the **single source of truth** for the booking & payment engine. No code in this section — design only.

**Current-state anchors (verified in code on `ios-production-backend`):**
- Booking is a 4-step mobile stack under `mobile/app/(app)/booking/` (schedule → review → payment → payment-success). The appointment is created **as `pending` before payment** via RPC `book_appointment_atomic`, which **holds the slot** through the partial unique index `uq_appointment_slot (doctor_id, slot_date, slot_start) WHERE status IN ('pending','confirmed','checked_in') AND is_emergency=false` (`supabase/migrations/20260330084012_overbooking_schema.sql`).
- Slots come from `doctor_availability.slots` (weekly template per weekday) minus taken slots — computed both by the `get_available_slots` RPC and re-implemented client-side in `shared/src/api/appointments.ts` `getAvailableSlots`.
- "Available Today" today = `doctors.status === "available"` (runtime live-status enum `available|with_patient|on_break|unavailable`), filtered client-side in `mobile/src/data/real/index.ts` `doctorRepo.search`.
- Payment: `mobile/app/(app)/booking/payment.tsx` computes `total = fee + 5% VAT` **client-side**, sends it to `backend/.../payments/checkout` (**amount trusted from client**), then opens Thawani via **`Linking.openURL` (external browser)**; `payment-success.tsx` polls `/payments/verify`. The **webhook** (`payments/webhook/route.ts`) is the source of truth — idempotent atomic claim (`UPDATE payments SET status='paid' WHERE id=? AND status<>'paid'`), re-queries Thawani (no HMAC), sets appointment `status='confirmed'`.
- **There is NO pending-hold TTL** — an unpaid `pending` appointment holds its slot indefinitely. This is the central gap the payment policy below must close.
- No `react-native-webview` dependency exists. No central booking-window constant exists (`schedule.tsx` hardcodes a 5-day window; VAT/rounding duplicated across `payment.tsx`/`success.tsx`/`bookingStore.ts`).

---

## 1. Available Today — **Option 2 (slot-based), locked**

**Decision:** "Available Today" is based **solely on whether the doctor has bookable appointment slots today**. The runtime `doctors.status` (`available` / `with_patient` / `on_break` / `unavailable`) **must NOT** affect discovery. Those statuses stay in the schema for future features but are ignored here.

- **Current implementation:** `available_today = doctors.status === "available"` (`mobile/src/data/real/index.ts` `mapDoctorRow`, ~line 570); `doctorRepo.search` filters on it client-side. Purely runtime status — not calendar/slot based.
- **Required backend changes:** provide a **set-based** "has a free slot today" signal so we don't do N+1 slot lookups per doctor. Recommended: a new **`doctors_available_today(p_date)` RPC** (or a SQL view) that returns doctor IDs having (a) a `doctor_availability` row for today's weekday with ≥1 template slot, and (b) at least one such slot **not** taken by a `pending|confirmed|checked_in` non-emergency appointment for that date — reusing the exact set-difference logic already in `get_available_slots`. `searchDoctors` can then LEFT JOIN / flag `available_today`, or the app calls the RPC and intersects.
- **Required mobile changes:** stop deriving `available_today` from `status`. Drive it from the new backend signal (RPC flag on the doctor row, or an availability set). The "Available today" filter in `doctorRepo.search` then filters on slot-availability, not status.
- **Required shared-layer changes:** `shared/src/api/doctors.ts` — expose the `available_today` flag from the new RPC/view (or add a `listDoctorsAvailableToday(date)` helper). `getAvailableSlots` becomes a thin pass-through to the `get_available_slots` RPC (backend is authoritative — see R3).
- **API changes:** new read RPC `doctors_available_today(date)` (or extend the doctor list select). No new REST route. Read-only, RLS/public-read consistent with existing doctor reads.
- **Database impact:** **no schema change** — it reads existing `doctor_availability` + `appointments`. One **additive** RPC/view migration (function only, reversible). `doctors.status` columns are left untouched (kept for future).
- **Testing strategy:** doctor with free slots today → appears; doctor with `status='available'` but **no** slots today (or fully booked) → does **NOT** appear; doctor with `status='on_break'/'unavailable'` but free slots today → **appears**; timezone/day-boundary correctness for "today"; performance test that the list query is set-based (no per-doctor N+1).

## 2. Leave Management — **NOT implemented (explicit)**

**Decision:** Do **NOT** build leave management. The booking engine uses **only** the doctor's configured availability calendar (`doctor_availability`). 

- **Do NOT add:** an `on_leave` doctor status, leave requests, leave date ranges, or a leave approval workflow.
- **Rationale/mechanism:** a doctor being away is represented by **absence of availability** (no `doctor_availability` slots for those weekdays, or the facility removing the template) — not a leave entity. `get_available_slots` naturally returns nothing when there is no template.
- **Note for future developers:** this is a deliberate scope exclusion. Do not introduce leave tables/statuses/workflows unless a new, separate product decision reverses this. If date-specific (rather than weekly) unavailability is later required, design it then — it is out of scope now.
- No mobile / shared / backend / database work. Documented here to prevent unnecessary implementation.

## 3. Booking Window — **7 days, single central constant**

**Decision:** Patients may book only within the next **7 days**. The limit must live in **one place** and be trivially changeable (7 → 10) without hunting through the codebase.

- **Where the constant should live:**
  - **Canonical for TS layers:** add `export const BOOKING_WINDOW_DAYS = 7;` to **`shared/src/config/index.ts`** (already the shared non-secret config; re-exported to mobile via `@medilink/shared/mobile`, to web/backend via `@medilink/shared`). This removes the hardcoded 5-day literal in `schedule.tsx`.
  - **Authoritative for the DB guard:** Postgres cannot import the TS constant. To keep a **true single source** and avoid drift, store the window in a settings row the RPC reads — recommended `facility_settings.booking_window_days` (that table already drives consult/buffer/cutoff values), or a small `app_settings` row. The RPC reads this value; the shared TS constant mirrors it for UX. *(Alternative for v1: the shared client passes the window as an RPC parameter with a server-side hard cap to prevent abuse — simpler but two places. The settings-row approach is preferred for one-location changeability.)*
  - **Semantics — CONFIRMED (2026-07-16):** the window is **today through today + 6** (7 calendar days total, inclusive). This is final. **Emergency appointments bypass the window** (valid emergency reason + the existing emergency workflow only); the window rule applies **only** to normal `is_emergency=false` bookings.
- **Backend validation (authoritative):** `book_appointment_atomic` must reject `p_slot_date` outside `[today, today + window)` → return `{ success:false, error:'OUTSIDE_BOOKING_WINDOW' }` — **applied only when `is_emergency=false`; emergency bookings skip the window guard.** `get_available_slots` / `doctors_available_today` should also not return normal-booking dates beyond the window.
- **Frontend validation:** `schedule.tsx` renders exactly `BOOKING_WINDOW_DAYS` day chips starting today; the UI cannot select beyond the window (defense-in-depth — the server guard is authoritative).
- **API behavior:** the RPC gains the window guard + error code; the slots RPC clamps to the window. No new REST route.
- **Testing:** date within window books; date = today+window (day 8) rejected with `OUTSIDE_BOOKING_WINDOW`; boundary (day 7) allowed; changing the settings value (e.g., to 10) widens both the UI and the guard from the one location; timezone correctness.

## 4. Payment Policy — **Online payment only; confirm only after payment**

**Decision & lifecycle:**
1. Patient selects a slot.
2. Thawani payment begins.
3. The appointment is **confirmed ONLY after successful payment**.
4. Failed / cancelled / expired / abandoned payment **must NOT** keep the slot reserved.
5. The slot must **immediately** become available again.

**The core change: bound the pending hold.** Today the appointment is created `pending` (holding the slot) before payment, with **no expiry** → an abandoned payment holds the slot forever. Two design approaches:

- **Approach A (recommended, least disruption): expiring pending hold.**
  - Add a nullable **`hold_expires_at`** to `appointments`, set by `book_appointment_atomic` for online-payment bookings to **now + 10 minutes** (**product-confirmed hold duration, 2026-07-16**).
  - **Availability + the unique index must treat an expired-unpaid `pending` as free.** Since a partial unique index can't reference `now()`, implement release via (i) a **Scheduled Edge Function** (R7 — **not pg_cron**) that runs `release_unpaid_hold` (R2) to **void** expired unpaid `pending` reservations every ~1 min, and (ii) `get_available_slots` / `doctors_available_today` excluding expired-unpaid holds in **real time** (so a slot reads free the instant the hold lapses, before cleanup). The unique index still prevents *live* double-booking.
  - On explicit **payment cancel/fail** (WebView return or a failure signal), call **`release_unpaid_hold`** immediately (R2) — don't wait for the Edge Function — so the slot frees at once.
- **Approach B (cleaner, larger change): pay-before-create hold.** Don't insert the appointment until payment succeeds; instead create a short-lived reservation (or an appointment in a new `payment_pending` status with `hold_expires_at`), promoted to `confirmed` by the webhook; expired holds auto-release. More invasive to the atomic RPC + index; defer unless product wants zero orphan `pending` rows.

**Late-payment / expired-hold handling — CONFIRMED (2026-07-16):**
- Hold = **10 minutes**. Payment succeeding **within** 10 min → confirm the appointment normally.
- Payment succeeding **after** the hold expired → the appointment is **NOT confirmed**; the released slot **remains available** to other patients; show the patient: *"Your payment was received after the reservation expired. Your appointment could not be confirmed. Please choose another available appointment."*
- **Do NOT auto-refund** (refund policy is undecided — see §Refund / review I6). **Record every late / paid-but-unconfirmed payment for manual reconciliation** — a durable flag/log the ops team can action — until a refund policy is approved.
- **Implication for webhook/`verify`:** before confirming, they must check the appointment is still a **live** (`pending`, non-expired, non-cancelled) hold. If it is not, they must **skip confirmation**, write the **reconciliation record**, and surface the message above. This **supersedes** the review's earlier "auto-refund or re-confirm" idea — product has chosen manual reconciliation with no auto-refund.

**Also fold in the amount-integrity fix (required for "confirm only after *correct* payment"):** checkout must **derive the amount server-side** from the doctor's fee (the `payments/get-appointment/[id]` route already computes `fees.in_person`), not trust the client-sent `total`. VAT/rounding should move to a shared helper (currently duplicated).

**Booking lifecycle (sequence):**
```text
Patient        Mobile app            Supabase RPC            Backend (Thawani)        Thawani
  |  pick slot     |                      |                        |                     |
  |--------------->| book_appointment_atomic (pending + hold_expires_at)                 |
  |                |--------------------->| INSERT pending (unique index holds slot)     |
  |                |<---------------------| {success, appointment_id}                    |
  |                | createCheckout(appointment_id)  [amount derived SERVER-side]        |
  |                |------------------------------------------------>| create session    |
  |                |<------------------------------------------------| {checkoutUrl}     |
  |  pay (WebView) |  open checkoutUrl in in-app WebView ----------------------------->  |
  |                |                                                 |   (card entry)     |
  | success/cancel |  WebView intercepts success_url / cancel_url                        |
  |                |                                                 |                     |
  |  == SUCCESS ==  webhook (authoritative): verify w/ Thawani, idempotent claim,        |
  |                 set appointment=confirmed, notify, invoice                            |
  |                | payment-success screen -> verify() re-query -> "confirmed"           |
  |                |                                                                      |
  |  == FAIL/CANCEL/ABANDON ==                                                            |
  |                | release_unpaid_hold now (WebView cancel) OR Edge Function on TTL     |
  |                | -> reservation voided, slot free again                               |
```

## 5. Race Condition Handling — **mandatory production requirement**

Two users must never both succeed on the same slot. The existing architecture already provides the backbone; document and extend it:

- **Concurrency strategy — optimistic, DB-arbitrated.** The partial unique index `uq_appointment_slot` is the single arbiter. Two concurrent `book_appointment_atomic` calls for the same `(doctor_id, slot_date, slot_start)` both pass the availability check, but only **one INSERT commits**; the other raises `unique_violation` → the RPC returns `{ success:false, error:'SLOT_ALREADY_BOOKED' }`. No app-level mutex needed.
- **Transaction strategy.** The RPC body (validate → compute slot_end → INSERT) runs in a single implicit transaction; the unique index makes the check-to-insert race-safe even though validation is not itself locking (a stale "slot free" read cannot produce a duplicate — the index rejects it).
- **Locking strategy.** Inserts rely on the unique index (no explicit lock). `cancel_appointment_safe` / `reschedule_appointment_atomic` already take `SELECT … FOR UPDATE` on the row before mutating — preserve that.
- **RPC changes.** Add `hold_expires_at` (Policy §4) and the `OUTSIDE_BOOKING_WINDOW` guard (§3, non-emergency only) to `book_appointment_atomic`. Keep the `unique_violation → SLOT_ALREADY_BOOKED` mapping. `release_unpaid_hold` (R2) **voids** an expired-unpaid reservation (row deleted → drops out of the partial index), and the availability RPCs exclude expired holds in real time so a reclaimed slot re-books cleanly.
- **Database constraints.** Keep `uq_appointment_slot`; keep `check_valid_slot` (`slot_end > slot_start`); `payments.appointment_id` stays `UNIQUE` (one payment per appointment).
- **Atomic reservation flow.** Single INSERT under the unique index = the reservation. The slot is held the instant the pending row commits.
- **Timeout handling.** `hold_expires_at` + sweep (Approach A) bounds the hold; expired unpaid holds are cancelled and the slot returns to availability.
- **Payment callback behavior.** The **webhook is authoritative** and re-queries Thawani before confirming (never trusts the POST body). `verify` (on app return) is a secondary confirm using the same Thawani re-query.
- **Duplicate callback handling / idempotency.** Already idempotent: `UPDATE payments SET status='paid' … WHERE id=? AND status<>'paid'` — a second (duplicate) webhook finds it already paid and performs **no** side-effects. `client_reference_id = appointment_id` + unique `payments.appointment_id` give a stable idempotency key. **Recommended addition:** verify a **Thawani HMAC/signature** on the webhook (currently absent) per Thawani docs, in addition to the re-query.
- **Rollback behavior.** If checkout-session creation fails after the pending insert, call **`release_unpaid_hold`** (R2) to void the reservation (free the slot). If payment ultimately fails/cancels/expires, the reservation is released via `release_unpaid_hold` (immediately on WebView cancel, or by the Edge Function on TTL) — the booking is only ever *confirmed* by a verified-paid webhook/verify, so a failed payment can never leave a confirmed appointment.

## 6. Payment Integration — **Thawani Hosted Checkout inside an in-app WebView**

**Decision:** Keep Thawani **hosted checkout** (no native card processing). Open the hosted page **inside the app's WebView**, not an external browser. Follow Thawani's official docs. Never collect/store card data (PCI: the hosted page handles all card entry).

- **Mobile changes:**
  - Add **`react-native-webview`** (via `npx expo install react-native-webview`) — new native dep → requires a rebuild (EAS).
  - New screen (e.g. `app/(app)/booking/checkout.tsx`) that renders `<WebView source={{ uri: checkoutUrl }}>`. Replace the `Linking.openURL(checkoutUrl)` call in `payment.tsx` with navigation to this screen.
  - **WebView lifecycle:** `onNavigationStateChange` (or `onShouldStartLoadWithRequest`) watches the URL. When it matches the **success return URL** → close WebView → route to `payment-success` (runs `verify`). When it matches the **cancel return URL** (or the user taps the header back/close) → treat as cancellation → cancel the pending appointment → return to the summary/doctor. Restrict navigation to the Thawani domain; block off-domain loads.
  - Loading + error states; a visible "cancel payment" affordance that triggers the cancel flow.
- **Backend changes:**
  - `checkout/route.ts`: set `success_url` / `cancel_url` to values the WebView can reliably detect (a dedicated return path or an app scheme such as `medilink://payment-return?...`), rather than only the web `NEXT_PUBLIC_APP_URL`. Confirm the **Thawani production host** (code currently hardcodes the `uatcheckout.thawani.om` UAT host + publishable key — must be environment-driven for production).
  - Server-derive the amount (Policy §4). 
  - `webhook/route.ts`: add **HMAC/signature verification** (B4) alongside the existing re-query + idempotent claim.
- **Deep-link / return URL flow:** because checkout runs **in-app**, no OS deep link is required for the happy path — the WebView intercepts the redirect to `success_url`/`cancel_url`. (If Thawani bounces through the OS browser for any step, the existing app scheme in `app.json` can catch the return, but the WebView-intercept path is primary.)
- **Payment success flow:** WebView hits `success_url` → close → `payment-success` → `verify` re-queries Thawani → shows confirmed. The webhook confirms independently and authoritatively.
- **Payment cancellation flow:** WebView hits `cancel_url` or user closes the WebView → cancel the pending appointment → slot frees immediately → back to summary.
- **Payment timeout flow:** Thawani session/checkout expires or the user lingers → on return, `verify` returns not-paid; the pending hold's TTL sweep cancels it and frees the slot; the app offers "try again" (which re-books/re-checks the slot, subject to availability).
- **Webhook responsibilities:** the **only** authority that flips `confirmed` + `paid`; idempotent; verifies with Thawani (+ HMAC); triggers notifications, invoice generation, emergency enqueue. A failed/expired payment webhook must **not** confirm and should leave the pending to be released.
- **Testing strategy:** WebView loads Thawani; success redirect intercepted → confirmed; cancel redirect intercepted → slot freed; hard-close mid-payment → slot freed (immediately or via sweep); duplicate webhook → no double side-effects; verify-fallback when webhook is delayed; production vs UAT host switching; RTL/Arabic within the WebView chrome (Thawani page is its own locale).
- **Security considerations:** PCI — no card data ever touches the app or our servers (Thawani hosted). Restrict the WebView to the Thawani domain; validate return URLs; add webhook HMAC; server-derive amount (prevents pay-0.001 manipulation); enforce HTTPS-only; never log card/session secrets.

## 7. Gap Analysis

| Area | Already exists | Partially exists | Needs to change / add |
|---|---|---|---|
| Atomic booking | `book_appointment_atomic` + `uq_appointment_slot` (race-safe insert) | — | add `hold_expires_at` + `OUTSIDE_BOOKING_WINDOW` guard |
| Slots | `get_available_slots` RPC; `doctor_availability` | shared `getAvailableSlots` re-implements it client-side (no buffer/end) | slot queries must exclude expired holds + clamp to window |
| Available Today | — | status-based flag only | **new** `doctors_available_today(date)` RPC/view; mobile stops using `status` |
| Booking window | — | hardcoded 5-day literal in `schedule.tsx` | central `BOOKING_WINDOW_DAYS` (shared) + DB settings value + RPC guard |
| Payment gateway | Thawani hosted checkout; webhook idempotent + re-query; `verify`; `get-appointment` fee derivation | amount **client-sent**; UAT host hardcoded | server-derive amount; env-driven host; **WebView** open; webhook **HMAC** |
| Pending hold | slot held via `pending` in the unique index | — | **no TTL today** → add `hold_expires_at` + sweep + cancel-on-failure |
| Leave mgmt | availability calendar covers it | — | **explicitly none** |

- **Reuse as-is:** `book_appointment_atomic`, `uq_appointment_slot`, `get_available_slots`, webhook idempotency/re-query, `verify`, `payments/get-appointment` fee derivation, `payment-success` polling, `bookingStore`, the 4-step booking stack.
- **Needs DB migrations (all additive):** (a) `hold_expires_at` on `appointments`; (b) `booking_window_days` settings value + RPC window guard (function migration); (c) `doctors_available_today` RPC/view; (d) **`release_unpaid_hold`** RPC (R2, function migration); (e) **anon `EXECUTE` grants** on the read-only availability RPCs (R1); (f) **`timezone`** column on `patient_profiles`/`profiles`, default `Asia/Muscat` (R5). No destructive changes; `doctors.status` untouched. *(Identity linking (R4) needs no migration — Supabase-managed auth identities.)*
- **Requires backend work:** checkout amount server-derivation + env-driven Thawani host + mobile-friendly return URLs; webhook HMAC; **`release_unpaid_hold`** logic (R2); **Scheduled Edge Function** sweeper (R7); availability RPCs made backend-authoritative incl. timezone (R3/R5); email/phone identity-link wrappers (R4); (optional) a config read for the window.
- **Requires mobile work:** WebView checkout screen (+ dep); available-today + slots **from backend only** (R3, drop client slot math); `BOOKING_WINDOW_DAYS` in `schedule.tsx`; **release-on-failure** wiring (R2); drop client amount; shared VAT/rounding helper; **identity-linking** screen (R4); **timezone** picker (R5); **guest resume** intent + dialog (R6).

## 8. Implementation Phases

> All migrations additive/reversible; keep `typecheck`/`lint` green; per repo rules regenerate `shared/src/types/supabase.ts` after each migration. Effort is engineering-days, excludes device/QA time.

- **Phase BP-1 — Available Today (slot-based).**
  - *Objective:* discovery reflects real bookable slots today, ignoring `doctors.status`.
  - *Files:* `mobile/src/data/real/index.ts` (`mapDoctorRow`, `doctorRepo.search`), `shared/src/api/doctors.ts`; new RPC/view migration.
  - *Backend:* `doctors_available_today(date)` RPC/view. *Shared:* expose the flag/helper. *Mobile:* drive `available_today` from it. *DB:* additive RPC/view. *Migration:* **Yes** (function/view). *Effort:* **~1–1.5 d.** *Testing:* §1 matrix; no N+1.
- **Phase BP-2 — Booking window constant + guard.**
  - *Objective:* 7-day limit from one location, enforced server-side.
  - *Files:* `shared/src/config/index.ts` (`BOOKING_WINDOW_DAYS`), `mobile/app/(app)/booking/[doctorId]/schedule.tsx`; `book_appointment_atomic` + slots RPC (window clamp) migration; settings value.
  - *Backend:* window guard in the RPC (`OUTSIDE_BOOKING_WINDOW`). *Shared:* constant. *Mobile:* render window days from the constant. *DB:* `booking_window_days` settings value + function update. *Migration:* **Yes.** *Effort:* **~1 d.** *Testing:* §3.
- **Phase BP-3 — Pending-hold TTL + release-on-failure (payment policy backbone).**
  - *Objective:* an unpaid booking never holds a slot beyond a short window; slot frees on fail/cancel/expire/abandon.
  - *Files:* `appointments` migration (`hold_expires_at`), **`release_unpaid_hold`** RPC/route (R2), **Scheduled Edge Function** (R7 — not pg_cron), `get_available_slots` / `doctors_available_today` (exclude expired holds in real time), `book_appointment_atomic` (set hold), mobile release-on-failure wiring.
  - *Backend/DB:* column + sweep + RPC updates. *Shared:* none beyond types. *Mobile:* trigger cancel on payment failure/cancel. *Migration:* **Yes** (column + functions + schedule). *Effort:* **~2–3 d.** *Testing:* abandon → slot frees on TTL; explicit cancel → frees immediately; confirmed bookings never swept.
- **Phase BP-4 — Amount integrity + Thawani host/config.**
  - *Objective:* server-derived amount; production-ready Thawani config.
  - *Files:* `backend/.../payments/checkout/route.ts` (derive amount, env host/keys), shared VAT/rounding helper, `mobile/app/(app)/booking/payment.tsx` (stop sending amount), `bookingStore`/`success.tsx` (use shared helper).
  - *Backend:* amount from doctor fee; env-driven host. *Shared:* fee/VAT helper. *Mobile:* remove client amount. *DB:* none. *Migration:* **No.** *Effort:* **~0.5–1 d.** *Testing:* tampered client amount ignored; VAT/total correct EN/AR.
- **Phase BP-5 — In-app WebView checkout.**
  - *Objective:* Thawani hosted page inside a WebView, with success/cancel interception.
  - *Files:* add `react-native-webview`; new `app/(app)/booking/checkout.tsx`; `payment.tsx` (navigate to WebView instead of `Linking.openURL`); `payment-success.tsx` (unchanged verify); backend `checkout` return URLs.
  - *Backend:* WebView-friendly `success_url`/`cancel_url`. *Shared:* none. *Mobile:* WebView screen + lifecycle. *DB:* none. *Migration:* **No** (native dep → rebuild). *Effort:* **~2–3 d.** *Testing:* §6 (success/cancel/close/timeout), iOS+Android device.
- **Phase BP-6 — Webhook hardening (HMAC).**
  - *Objective:* verify Thawani signature in addition to re-query + idempotency.
  - *Files:* `backend/.../payments/webhook/route.ts`.
  - *Backend:* HMAC verification per Thawani docs. *DB/Shared/Mobile:* none. *Migration:* **No.** *Effort:* **~0.5 d.** *Testing:* valid/invalid signature; duplicate delivery no-op.
  - *Dependencies:* BP-3 before BP-5 (WebView cancel must free the held slot); BP-4 before/with BP-5 (correct amount at checkout); BP-1/BP-2 independent and can go first. BP-6 independent (harden anytime).

---

# Architecture Review — Findings & Open Items (2026-07-16)

Final staff-engineer pass over the whole spec before it becomes the implementation baseline. The four features (F1–F4) are internally consistent among themselves; the issues below are **cross-feature gaps and booking/payment edge cases** that must be resolved (or explicitly de-scoped) before coding. No code/migrations written — these are spec corrections.

> **Update 1 — product decisions applied (2026-07-16):** **C1, I4, I6, N1 RESOLVED.** Booking window (today+6), 10-minute hold + late-payment behavior, "no auto-refund / manual reconciliation," "MFA not required," and "emergency bypasses the window" are locked (§3, §4).
>
> **Update 2 — round-2 engineering decisions (2026-07-16):** **C2, I1, I2, I3, I5, I7, I8 are now ALL RESOLVED** by decisions **R1–R7** (see "Engineering Decisions — Round 2"). **No Critical or Important items remain open.** Remaining are nice-to-haves (N2–N4) and three product confirmations (civil-number format, phone-identity linking rollout, password-retirement timeline).

## 🔴 Critical

- **C1 — Sweep-vs-late-payment race — ✅ RESOLVED by product decision (2026-07-16).** The behavior is now defined (Payment Policy §4 "Late-payment / expired-hold handling"): hold = **10 min**; a payment landing after expiry does **not** confirm the appointment, the slot **stays free**, the patient sees the "received after the reservation expired" message, and there is **no auto-refund** — the payment is **recorded for manual reconciliation**. Remaining work is now well-defined (not a blocker): webhook/`verify` must verify the hold is still live before confirming, else write the reconciliation record + surface the message. The earlier "auto-refund or re-confirm" options are **superseded**.

- **C2 — Guest availability anon EXECUTE grants — ✅ RESOLVED (2026-07-16, see R1).** Anon `EXECUTE` is granted **only** on the read-only availability RPCs (`get_available_slots`, `doctors_available_today`); all booking/payment RPCs stay authenticated-only. Grants migration + staging test matrix specified in R1.

## 🟠 Important (should fix before coding)

- **I1 — Dedicated unpaid-hold release — ✅ RESOLVED (2026-07-16, see R2).** A dedicated **`release_unpaid_hold`** flow (void reservation → free slot, no cutoff/refund) replaces any reuse of `cancel_appointment_safe`; used on payment fail/cancel/expire/timeout/abandon and by the Edge Function (R7).

- **I2 — Client-side availability duplication — ✅ RESOLVED (2026-07-16, see R3).** The backend is the **single source of truth**; the client-side slot math in `getAvailableSlots` is removed and becomes a thin pass-through to the `get_available_slots` RPC, which owns expired-hold exclusion, window clamp, walk-in reserved, and emergency rules.

- **I3 — Phone auth-identity linking — ✅ RESOLVED (2026-07-16, see R4).** New **email ⇄ phone identity-linking** flow (Settings → Security → verify OTP → `auth.users.phone` attached via `updateUser`), after which either identifier logs in. Email linking works now; phone linking is gated on the SMS provider (F4 §5).

- **I4 — Checkout AAL2 vs OTP — ✅ RESOLVED (2026-07-16): MFA is NOT required; OTP is sufficient.** Concrete change: relax `payments/checkout` and `verify` from `getAal2UserOrThrow` to an **AAL1/authenticated** check (e.g. `getUserOrThrow`) so OTP-logged-in users can pay. No MFA-enrolment gate on checkout.

- **I5 — Authoritative timezone — ✅ RESOLVED (2026-07-16, see R5).** Default **Asia/Muscat**, user-selectable in Settings; stored server-readable and applied server-side to scheduling/window/availability/"Today." Mobile renders server-provided dates (no client date math).

- **I6 — Refund / cancellation of paid appointments — ✅ RESOLVED (2026-07-16): OUT OF SCOPE.** Refund policy is **not decided**; **no automatic refunds** are implemented now. Keep the architecture **refund-flexible** (payments retain `gateway_ref`/status; late/expired-paid cases are logged for manual reconciliation per §4) so a refund workstream can be added later without rework. (The release-audit B3 refund defect remains tracked separately.)

- **I7 — Guest resume-after-sign-in — ✅ RESOLVED (2026-07-16, see R6).** After auth + mandatory onboarding, a "Continue where you left off?" dialog offers **Resume Booking / Go to Dashboard**; a persisted pending-booking intent restores the selection, and the slot is **re-validated against the backend** on resume (guests never held it).

- **I8 — Sweep scheduling — ✅ RESOLVED (2026-07-16, see R7): Scheduled Edge Function (not pg_cron)**, ~1-min cadence, idempotent, monitored (dead-man's switch); a failed run is non-critical because availability RPCs exclude expired holds in real time.

## 🟢 Nice to have

- **N1 — Emergency appointments — ✅ RESOLVED (2026-07-16): emergency appointments MAY bypass the booking window** (valid emergency reason + the existing emergency workflow only). Normal (`is_emergency=false`) bookings always follow the window; the `book_appointment_atomic` window guard applies only when `is_emergency=false` (see §3). Their payment/hold treatment continues to follow the existing emergency workflow.
- **N2 — `appointments.payment_status` (denormalized) vs `payments.status`** are two sources of truth; ensure the webhook keeps them consistent or the app reads one canonically.
- **N3 — Family-member civil numbers** — decision covers the patient only; note dependents as possible future scope.
- **N4 — New specialty slugs added in HAMS** won't have an i18n key and fall back to English; a periodic "missing `specialtyNames.<slug>`" check would catch gaps.

## Assumptions to confirm with Vikas before implementation

**Resolved 2026-07-16 (removed from open list):** ~~booking-window semantics (today+6, confirmed)~~ · ~~hold TTL (10 min, confirmed)~~ · ~~checkout auth assurance (MFA not required — I4)~~ · ~~refund policy (out of scope — I6)~~ · ~~emergency appointments (bypass window — N1)~~.

**Still open (product confirmations, not blockers):**
1. **Civil number format/length** — 8 digits for the `CHECK`? How are expat/non-standard IDs handled?
2. **Phone identity-linking rollout** — the *design* is decided (R4: link email⇄phone via OTP); what remains is the **SMS-provider provisioning** (F4 §5) that gates the phone side, and confirming the rollout timing.
3. **Password login retirement** — timeline for removing password once OTP login ships (kept during transition per F4 §11).

*Summary (post-2026-07-16 decisions): **C1, I4, I6, N1 are resolved.** The only remaining **Critical** blocker is **C2** (anon EXECUTE grants for guest availability). Remaining **Important** items: **I1** (dedicated unpaid-hold release path), **I2** (mobile availability consolidation — expired-hold/window/walk-in), **I3** (phone auth-identity linking), **I5** (authoritative Asia/Muscat timezone), **I7** (guest resume-after-sign-in), **I8** (sweep scheduling infra). Nice-to-have: N2–N4. No new contradictions; the plan is otherwise ready to implement once C2 + the Important items are addressed or explicitly deferred.*

> **All of C2, I1, I2, I3, I5, I7, I8 are now RESOLVED by the round-2 engineering decisions below (R1–R7).** See "Engineering Decisions — Round 2."

---

# Engineering Decisions — Round 2 (2026-07-16)

Resolves review items **C2, I1, I2, I3, I5, I7, I8**. Where this section differs from earlier wording in §3/§4/BP-3, **this section governs** (those spots are annotated inline).

## R1 — Guest availability RPC permissions (resolves C2)

Guests (Supabase `anon` role) may **read** discovery + availability only; they can **never** select/reserve/book/pay or touch patient data.

- **Grant anon `EXECUTE` strictly to the read-only availability functions:** `get_available_slots`, `doctors_available_today` (plus any read-only doctor/clinic/specialty list functions). These are the only functions a guest needs to "view available appointment slots" and clinic/doctor info.
- **All booking/reservation/payment RPCs stay authenticated-only — NO anon grant:** `book_appointment_atomic`, `reschedule_appointment_atomic`, `cancel_appointment_safe`, **`release_unpaid_hold`** (R2), `checkin_my_appointment`, and every `/api/payments/*` route. A guest tapping "select slot / book / pay" hits the sign-in wall, and the RPC would reject an anon caller regardless (defence-in-depth).
- **Migration:** additive grants migration — `GRANT EXECUTE … TO anon` on the read-only availability RPCs **only** — alongside the table SELECT policies in Guest §6. Reversible (`REVOKE`).
- **Staging test matrix (mandatory):** anon **can** EXECUTE `get_available_slots`/`doctors_available_today`; anon is **DENIED** on `book_appointment_atomic` and every patient table/RPC.

## R2 — Dedicated unpaid-hold release (resolves I1)

A new **authenticated** flow, distinct from `cancel_appointment_safe` (which carries cancellation-cutoff + refund side-effects meant for *confirmed/paid* bookings):

```
release_unpaid_hold(appointment_id)
  → void the reservation  (delete the pending, unpaid appointment row;
                           first detach/void any associated *unpaid* payments row)
  → slot frees            (row drops out of the uq_appointment_slot partial index)
  → done
```

- **Invoked when:** payment **fails / is cancelled / expires / times out / is abandoned** (WebView cancel or close, or a failure signal). The Scheduled Edge Function (R7) calls the **same** logic for holds that expire with no client signal — one release code path.
- **Guard:** only voids rows that are still `pending` **and** unpaid **and** owned by the caller (the Edge Function runs service-role but applies the same predicate). It **never** touches `confirmed`/paid rows.
- **Payments-row handling:** if a `payments` row exists for the reservation, it must be voided/expired (or FK-detached) before/with the appointment delete, so no orphan unpaid payment remains.
- **Late-payment interaction (with C1/§4):** if Thawani later reports **paid** for a released reservation, the webhook finds **no live hold** → it does **not** recreate/confirm; it **records the payment for manual reconciliation** and the patient sees the "received after the reservation expired" message. **No auto-refund.**
- **Backend work:** new `release_unpaid_hold` RPC (or backend route) + wire it into the mobile payment-cancel/fail paths and the Edge Function (R7). Mobile no longer calls `cancel_appointment_safe` for unpaid reservations.

## R3 — Backend is the single source of truth for availability (resolves I2)

**The mobile app must never compute appointment availability itself.**

```
Mobile  →  always requests backend  →  backend decides  →  mobile renders the response
```

- **Remove the client-side slot math** in `shared/src/api/appointments.ts` `getAvailableSlots`. It becomes a **thin pass-through** that calls the **`get_available_slots` RPC** and returns its rows verbatim. (This obsoletes I2's "two divergent implementations.")
- The **backend/RPC is authoritative** for: **available slots · booking window (today + 6) · expired holds · reserved (walk-in) slots · emergency booking rules.** The RPC must therefore exclude expired holds in real time, clamp to the window, honour `walkin_reserved`, and apply the emergency-bypass rule — all server-side.
- Mobile renders exactly what the backend returns and sends the chosen slot back to `book_appointment_atomic`, which **re-validates** on write (the write path stays the ultimate arbiter).
- **Shared/mobile change:** replace the re-implementation with the RPC call; drop any date/slot arithmetic from the client. Supersedes §1's "keep `getAvailableSlots` as-is" note.

## R4 — Identity linking: email ⇄ phone (resolves I3)

Users who signed up with **email** can later link a **phone** (and vice-versa); afterwards either identifier logs them in.

- **UX:** **Settings → Security** (or Profile) → **"Verify Mobile Number"** (or "Add email") → enter identifier → **Send OTP** → enter OTP → **Verify** → identifier is linked to the account. After success, login works with **either** email or phone.
- **Supabase Auth identity linking:** for email/phone on an existing account, use **`supabase.auth.updateUser({ phone })`** (sends an SMS OTP) then **`verifyOtp({ phone, token, type: 'phone_change' })`** to attach `auth.users.phone`; symmetric for email via `updateUser({ email })` + `type: 'email_change'`. *(Note: `linkIdentity` is for OAuth providers — not email/phone; use `updateUser`.)* Once `auth.users.phone` is set, `signInWithOtp({ phone })` (F4 phone flow) finds the account.
- **Database implications:** `auth.users.phone`/`email` are **Supabase-managed** — no app table/migration for the identity itself. Keep the app's `profiles.phone` **in sync** on a successful link (optional trigger or an explicit profile update). No new table required.
- **Migration requirements:** **none** for the auth identity; *optional* sync of `profiles.phone`.
- **New shared wrappers** in `shared/src/api/auth.ts`: `startPhoneLink`/`confirmPhoneLink` (+ email equivalents). **New mobile screen(s)** under Settings → Security.
- **Dependency:** **phone** linking + phone login require the **SMS provider** (F4 §5) — **blocked until provisioned**; gate the phone-linking UI behind the same feature flag. **Email** linking works now.

## R5 — User-selectable timezone, default Asia/Muscat (resolves I5)

- **Default:** **`Asia/Muscat`**. Users may change their preferred timezone in **Settings → Preferences**.
- **Authoritative use:** **scheduling, booking-window validation (today + 6), availability calculations, and "Today"** all use the **user's selected timezone**; if never changed (or for guests), **Asia/Muscat**.
- **Storage:** additive nullable **`timezone text` column** (default `'Asia/Muscat'`) on `patient_profiles` (or `profiles`) so it is **server-readable** — the booking/availability RPCs read the caller's timezone and fall back to `Asia/Muscat` when null or for anon/guest callers.
- **Server-authoritative:** because availability/window/today are computed server-side (R3), the RPCs perform all timezone math; **mobile renders server-provided dates/labels** rather than doing local date arithmetic (prevents device-vs-server drift).
- **UI:** a timezone picker in Settings; persists via profile update. **i18n:** timezone label + picker strings (EN/AR).
- **Migration:** additive `timezone` column (default `Asia/Muscat`) → regenerate types; RPCs updated to read/apply it. Reversible.

## R6 — Guest resume-after-signup (resolves I7)

When a guest decides to sign up **during booking**:

1. Complete **authentication** (email/phone OTP).
2. Complete **mandatory onboarding / profile creation**.
3. Then show a dialog — **"Continue where you left off?"** → **[ Resume Booking ] [ Go to Dashboard ]**.
4. **Resume Booking** → restore the exact booking selection the guest left.

- **Safe state preservation:** capture a **pending-booking intent** at the moment the guest hits the sign-in wall — `{ doctorId, facilityId, slotDate, slotStart, type, + display fields }` — in a **persisted store** (`pendingBookingStore`, backed by SecureStore/AsyncStorage) so it survives the auth + onboarding navigation **and** any app reload. Clear it after resume or on "Go to Dashboard," and on sign-out.
- **Re-validation (critical):** a guest **never held the slot** (guests cannot reserve — R1). On Resume, the app **must re-query the backend availability RPC** (R3) for that slot: if still free, re-enter the booking flow at review/payment with the restored selection; if taken/expired/out-of-window, show **"That slot is no longer available — please choose another"** and drop the user into the doctor's schedule screen. **Never assume the slot is still open.**
- **Security:** the intent stores only non-sensitive discovery identifiers (doctor/slot) — **no patient data**; cleared on resume/decline/sign-out.

## R7 — Scheduled Edge Function sweeper (resolves I8)

**Use a Supabase Scheduled Edge Function — NOT pg_cron.**

- **Execution frequency:** every **1 minute** (≤ 2 min) so expired 10-minute holds are released promptly.
- **Responsibility:** find `pending`, **unpaid** appointments with `hold_expires_at < now()` (in the authoritative timezone, R5) and run the **`release_unpaid_hold`** logic (R2) — void the reservation + detach the unpaid payment → free the slot. **One release code path** shared with the client cancel flow.
- **Retry strategy:** the function is **stateless + idempotent** (acts only on still-pending-unpaid-expired rows), so retries are safe; wrap each row's release in its own try/catch so one bad row never fails the batch. A missed run is reconciled by the next run.
- **Monitoring:** log per-run counts (scanned / released / errored); alert on elevated error rate and via a **dead-man's-switch** if the function hasn't run within N minutes; surface in the ops dashboard.
- **If one execution fails:** **non-critical** — because the availability RPCs (R3) **already exclude expired holds in real time**, a slot with an expired hold **already reads as free to patients** even before the sweep deletes the stale row. The Edge Function is *cleanup* (removing the row + unpaid payment), not the thing that makes the slot bookable. The next run finishes the cleanup.
- **How expired reservations are released:** Edge Function → `release_unpaid_hold` per expired row → reservation voided, slot freed, unpaid payment detached; late-arriving payments handled by the reconciliation path (R2/§4).

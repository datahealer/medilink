# Prescriptions — Backend Implementation Specification (DEFERRED / future task)

> **Status:** Phase 4 of the mobile integration effort. The prescription **content** is fully
> supported by the backend today (medications, dosage/frequency/duration, doctor, date, instructions,
> PDF download, share/send-to-pharmacy). It is **NOT wired** yet because a few *visible design
> elements* have no backing column: **Active/Previous status + Active badge**, **Rx number**, and the
> **doctor display ID** shown on the e-prescription. This spec defines only the missing backend work
> so the approved design (Design Doc p30–31) can be honored with **no mobile UI change**.
> No backend code and no mobile code has been written for this.

**Guiding constraint:** keep & extend `public.prescriptions`. All new RLS mirrors
`prescriptions_patient_read` (scoped by `patient_profiles.id`).

---

## 0. What already works (NO backend change needed)
- **Table `public.prescriptions`**: `id, appointment_id, doctor_id, patient_id, medications JSONB[], instructions, pdf_url, share_token, share_token_expires_at, issued_at`. RLS `prescriptions_patient_read` (patient reads own; scoped by `patient_profiles.id`). Doctor/facility write.
- **`medications` element shape** (from the PDF generator + AI scanner): `{ name, dosage, frequency, duration, notes? }` → backs the list **dosage** and the detail **dosage & duration**.
- **Shared API** `shared/src/api/prescriptions.ts`: `listPrescriptions(db)`, `getPrescription(db,id)` (joins doctor `full_name`/`specialty` + appointment `slot_date`/`type`).
- **Backend routes** (patient-authorized):
  - `GET /api/prescriptions/[id]/download` → `{ signed_url }` (Download PDF; requires PDF generated).
  - `POST /api/prescriptions/[id]/generate-pdf` → renders + stores `pdf_url`.
  - `GET /api/prescriptions/[id]/share-link` → `{ url: "/prescription/{token}", expires_at }` (**Share / Send to pharmacy**; 24h token).
- **Verified e-prescription**: any row in `prescriptions` is a doctor-issued e-prescription; the generated PDF is the authoritative signed artifact → the "Verified" badge is backed by row existence + `pdf_url`.

Because of the above, once the gaps below are closed the mobile wiring is small (a `PrescriptionRepository` + `usePrescriptions` hooks mapping to these shapes).

---

## 1. Gaps that require backend work

### Gap A — Prescription status (Active / Previous) — **primary blocker**
The design has top-level **Active / Previous** tabs and an **Active** badge. There is no status column, and deriving it from freetext `medications[].duration` (e.g. "30 days", "2 puffs as needed") is unreliable → **must not be guessed**.

**Recommended (Option 1):**
```sql
CREATE TYPE public.prescription_status AS ENUM ('active', 'completed', 'cancelled');

ALTER TABLE public.prescriptions
  ADD COLUMN status public.prescription_status NOT NULL DEFAULT 'active';

CREATE INDEX ix_prescriptions_status ON public.prescriptions (patient_id, status);
```
- Set by the doctor/HAMS at issue and when a course ends (or via a scheduled job from an explicit `valid_until` if you prefer time-based expiry — see optional below).
- Mobile mapping: `active → Active tab + "Active" badge`; `completed|cancelled → Previous tab`.
- **Optional time-based variant:** add `valid_until DATE` and a nightly job/trigger flipping `active→completed` when `valid_until < today`. Only adopt if the clinical workflow sets an end date; otherwise the explicit enum is simpler and truthful.

### Gap B — Rx number ("Rx #4471")
No human-facing prescription number exists.
```sql
ALTER TABLE public.prescriptions ADD COLUMN rx_number TEXT;   -- e.g. zero-padded sequence or formatted code
-- populate at issue (sequence or generated); expose read-only to patients.
```
(If you prefer not to add a column, the mobile can display a short slice of `id`, but that is not the design's "Rx #4471" format — a real `rx_number` is recommended.)

### Gap C — Doctor display ID ("ML-245879")
The detail header shows a doctor identifier. `public.doctors` currently has **no** license/registration/code column.
- Preferred: add `doctors.registration_no TEXT` (or `license_number`) and expose it via the `getPrescription` doctor join. This is also broadly useful for provider verification.
```sql
ALTER TABLE public.doctors ADD COLUMN registration_no TEXT;
```
- If a real registration number isn't available, treat this line as optional/omittable in the design rather than fabricating one.

### Gap D — Digital signature (cosmetic) — optional
The design shows a handwritten signature. The **authoritative** signature is the generated PDF (`pdf_url`). If a rendered signature image is required in-app:
```sql
ALTER TABLE public.doctors ADD COLUMN signature_url TEXT;   -- object in a doctor-assets bucket
```
Otherwise the mobile renders the doctor's name in a signature style (cosmetic, backed by `doctors.full_name`) — no backend change needed.

### Minor (no schema change) — patient name on detail
The detail shows "Patient: {name}". Extend the `getPrescription` projection to join the patient's `full_name` (data already exists via `patient_profiles → profiles`). This is a **shared-API projection add**, not a schema change.

---

## 2. Shared API additions (once schema lands)
`shared/src/api/prescriptions.ts`:
- Extend `SELECT` in both `listPrescriptions` and `getPrescription` to include: `status`, `rx_number`, doctor `registration_no` (and `signature_url` if added), and a patient `full_name` join for the detail.
- List filtering by tab is client-side on `status` (or add `.eq('status', …)`); index `ix_prescriptions_status` supports it.
- No new patient HTTP routes needed — download/generate-pdf/share-link already exist.

**Response shapes (target):**
```ts
interface PrescriptionListItem {
  id: string; rx_number: string | null;
  status: 'active' | 'completed' | 'cancelled';
  issued_at: string;
  medications: Array<{ name: string; dosage?: string; frequency?: string; duration?: string; notes?: string }>;
  doctor: { full_name: string | null; specialty: string | null } | null;
}
interface PrescriptionDetail extends PrescriptionListItem {
  instructions: string | null;
  pdf_url: string | null;               // Download via /download → { signed_url }
  doctor: { full_name: string | null; specialty: string | null; registration_no: string | null; signature_url?: string | null } | null;
  patient: { full_name: string | null } | null;   // "Patient: …"
}
```

---

## 3. Ingestion / lifecycle (HAMS / doctor side)
- Doctor issues a prescription (existing `POST /api/prescriptions` + `prescriptions_doctor_write`): now also sets `status='active'`, a generated `rx_number`, and (if adopted) `valid_until`.
- Course completion / cancellation flips `status` to `completed`/`cancelled` (manual action or the optional `valid_until` job).
- `generate-pdf` continues to render the verified PDF (already reads `{name,dosage,frequency,duration,notes}` + instructions + facility).

---

## 4. Client-only follow-up (no backend)
- **"Set reminder"** (list card) is a **local device** feature (schedule a medication reminder via `expo-notifications`). It needs no backend and can be implemented mobile-side later; not part of this spec.

---

## 5. Rollout order
1. Migration: `prescription_status` enum + `prescriptions.status` (+ optional `valid_until`), `rx_number`, `doctors.registration_no` (+ optional `signature_url`), index. Backward compatible (existing rows default `active`).
2. Populate `status`/`rx_number` at issue (HAMS doctor flow) + backfill existing rows.
3. `shared/src/api/prescriptions.ts` projection additions + regenerate DB types.
4. Then wire mobile (PrescriptionRepository + usePrescriptions hooks) against the shapes above; verify via patient impersonation as in Phases 1–2.

---

## Summary
| Design element | Backed today? | Action |
|---|---|---|
| Medication name / dosage / frequency / duration | ✅ `medications` JSONB | none |
| Doctor name + specialty, date, instructions | ✅ | none |
| Download PDF / Share / **Send to pharmacy** | ✅ routes exist | none |
| Verified e-prescription | ✅ (row + PDF) | none |
| **Active / Previous tabs + Active badge** | ❌ | add `prescriptions.status` (Gap A) |
| **Rx number** | ❌ | add `prescriptions.rx_number` (Gap B) |
| **Doctor display ID** | ❌ | add `doctors.registration_no` (Gap C) |
| Handwritten signature image | ❌ (PDF is authoritative) | optional `doctors.signature_url` (Gap D) |
| Patient name on detail | ✅ data exists | shared projection add (no schema) |
| Set reminder | n/a (local) | mobile-only follow-up |

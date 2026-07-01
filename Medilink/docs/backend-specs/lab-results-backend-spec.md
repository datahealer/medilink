# Lab Results — Backend Implementation Specification (IMPLEMENTED)

> **Status:** ✅ **CONNECTED** (migrations `20260701000003_lab_results_analytes.sql` +
> `20260701000004_fix_lab_status_trigger_cast.sql`). The structured analytes table, enums, roll-up
> trigger, indexes, and RLS below are all live and applied via the linked Supabase CLI. Shared
> `api.labs` now exposes `listLabResults` (extended), `getLabResult`, `getAnalyteTrend`,
> `markLabResultViewed`, `getLabResultSignedUrl`. Mobile has a real `LabRepository`
> (list/get/trend/markViewed/signedUrl), `useLabs` hooks, and the Lab Reports + Result Detail
> screens are wired to real data (Download PDF / Share via signed URL; report marked viewed on open).
>
> Verified E2E against the hosted DB via patient impersonation: the status roll-up trigger sets
> `status=flagged, flagged_count=2` from analyte flags; the patient reads their report list, detail
> (4 ordered analytes with reference ranges + flags), and a 2-point `total_cholesterol` trend
> (oldest→newest) under RLS; mark-viewed persists.
>
> **Two follow-ups remain (backend/product, not mobile):**
> 1. **Ingestion (critical path, §5):** the tables only fill once the HAMS/provider technician UI
>    writes structured analytes. Until that ships, real patients see reports with no analyte rows
>    (the detail screen already handles the empty-analytes case). The mobile side is complete.
> 2. **Trend UI:** the approved mobile detail screen (as built) has **no trend chart** — only the
>    analyte list + Me insight. `getAnalyteTrend` + `useAnalyteTrend` are wired at the data layer so
>    a future trend chart can be added without backend work; no chart was invented here (would depart
>    from the approved design).
> 3. **AI "Me insight" (§6, optional):** `lab_results.ai_insight` is read and rendered when present;
>    the `generate-lab-insight` Edge Function that populates it is still optional/future.
>
> The original spec follows unchanged for reference.

**Guiding constraint:** keep & extend the existing `public.lab_results` table (a delivered *file* per
report); add analytes as a child table. All new RLS mirrors `lab_results_patient_read`
(scoped by `patient_profiles.id`, NOT `auth.uid()`).

---

## 1. Database changes

### 1.1 Enums
```sql
CREATE TYPE public.lab_flag AS ENUM ('low', 'normal', 'high', 'abnormal');
CREATE TYPE public.lab_result_status AS ENUM ('normal', 'flagged');
```

### 1.2 Extend `public.lab_results`
```sql
ALTER TABLE public.lab_results
  ADD COLUMN status         public.lab_result_status NOT NULL DEFAULT 'normal',
  ADD COLUMN flagged_count  INTEGER                  NOT NULL DEFAULT 0,
  ADD COLUMN result_date    DATE,          -- shown in UI; orders trends (fallback uploaded_at::date)
  ADD COLUMN ai_insight     TEXT,          -- optional "Me insight" (see §6)
  ADD COLUMN ai_insight_at  TIMESTAMPTZ;
```
`status`/`flagged_count` are trigger-maintained (never client-written). Existing columns already
cover file needs: `test_name`, `facility_id`, `file_url`/`storage_path`/`file_type`, `notes`, `is_viewed`.

### 1.3 New table `public.lab_result_analytes`
```sql
CREATE TABLE public.lab_result_analytes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_result_id  UUID NOT NULL REFERENCES public.lab_results(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE CASCADE, -- denormalized for RLS + trends
  analyte_code   TEXT NOT NULL,      -- stable trend key: total_cholesterol, hdl, ldl, triglycerides, vitamin_d…
  analyte_name   TEXT NOT NULL,      -- display: "Total Cholesterol"
  value_numeric  NUMERIC,            -- for flag calc + trends (null when qualitative)
  value_text     TEXT,               -- raw/qualitative display
  unit           TEXT,               -- "mg/dL"
  reference_low  NUMERIC,            -- nullable (one-sided ranges allowed)
  reference_high NUMERIC,            -- nullable
  reference_text TEXT,               -- EXACT display, e.g. "<200 mg/dL", ">40 mg/dL", "13–17 g/dL"
  flag           public.lab_flag NOT NULL DEFAULT 'normal',
  measured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- trend ordering (defaults to result_date)
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
Design mapping (Lipid Profile, p30): Total Cholesterol 215 "<200 mg/dL" high · HDL 52 ">40 mg/dL" normal ·
LDL 140 "<130 mg/dL" high · Triglycerides 120 "<150 mg/dL" normal.

### 1.4 Roll-up trigger (maintains status + flagged_count)
```sql
CREATE OR REPLACE FUNCTION public.recompute_lab_result_status() RETURNS TRIGGER AS $$
DECLARE rid UUID; n INT;
BEGIN
  rid := COALESCE(NEW.lab_result_id, OLD.lab_result_id);
  SELECT COUNT(*) INTO n FROM public.lab_result_analytes WHERE lab_result_id = rid AND flag <> 'normal';
  UPDATE public.lab_results
    SET flagged_count = n, status = CASE WHEN n > 0 THEN 'flagged' ELSE 'normal' END
    WHERE id = rid;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_recompute_lab_status
AFTER INSERT OR UPDATE OR DELETE ON public.lab_result_analytes
FOR EACH ROW EXECUTE FUNCTION public.recompute_lab_result_status();
```

### 1.5 Indexes
```sql
CREATE INDEX ix_lra_result  ON public.lab_result_analytes (lab_result_id);
CREATE INDEX ix_lra_trend   ON public.lab_result_analytes (patient_id, analyte_code, measured_at DESC);
CREATE INDEX ix_lab_results_status ON public.lab_results (patient_id, status);
```

### 1.6 RLS (mirror `lab_results_patient_read`)
```sql
ALTER TABLE public.lab_result_analytes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lra_patient_read" ON public.lab_result_analytes FOR SELECT TO authenticated
  USING (patient_id IN (SELECT id FROM public.patient_profiles WHERE user_id = auth.uid()));

CREATE POLICY "lra_facility_write" ON public.lab_result_analytes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.role IN ('facility_admin','technician','super_admin')));

CREATE POLICY "lra_service_role" ON public.lab_result_analytes FOR ALL TO service_role USING (true);

GRANT SELECT ON public.lab_result_analytes TO authenticated;
GRANT ALL    ON public.lab_result_analytes TO service_role;
```
> Identity note: `lab_results.patient_id` / `lab_result_analytes.patient_id` reference `patient_profiles(id)`,
> so use the `IN (SELECT id FROM patient_profiles WHERE user_id = auth.uid())` form — NOT `= auth.uid()`
> (that was correct only for `payments`).

## 2. Storage
None. Report file stays in the existing private `lab-results` bucket (`results/{patient_profile_id}/…`),
served by short-lived signed URLs. Analytes are relational.

## 3. Backend APIs / shared additions (`shared/src/api/labs.ts`)
- **`listLabResults(db)`** — extend projection: add `status`, `flagged_count`, `result_date`, `facility:facility_id(name)`. Tabs: All (no filter) / Normal (`status='normal'`) / Flagged (`status='flagged'`); badge `flagged → "{flagged_count} flagged"`.
- **`getLabResult(db, id)` — NEW** — report + ordered `analytes` + `ai_insight` + facility; `.eq('id',id).eq('patient_id',<me>).maybeSingle()`.
- **`getAnalyteTrend(db, analyteCode, limit=12)` — NEW** — series `{measured_at, value_numeric, unit, flag}` for the patient's analyte over time.
- **Keep:** `markLabResultViewed`, `getLabResultSignedUrl` (Download PDF / Share).

Response shapes map 1:1 to the screens (list row, analyte row, Me insight card, download/share via signed URL). Patient reads stay direct-Supabase (RLS), no new HTTP routes.

## 4. Data model summary
| Concept | Where |
|---|---|
| Lab result (report) | `lab_results` (extended) |
| Analytes | `lab_result_analytes` (new) |
| Reference ranges | per analyte row (`reference_low/high` + `reference_text`) |
| Flags (High/Normal/Low) | `lab_result_analytes.flag` (`lab_flag`) |
| Trend history | query analytes by `(patient_id, analyte_code)` over `measured_at` |
| Status (Normal/Flagged) | `lab_results.status` + `flagged_count` (trigger-derived) |
| Me insight | `lab_results.ai_insight` (optional) |

## 5. Data ingestion flow (HAMS / provider side)
1. Technician uploads the report file to `lab-results` + inserts the `lab_results` row (existing writer role).
2. Enter analytes (new step): structured entry form in HAMS → insert `lab_result_analytes` (with `patient_id`, `measured_at = result_date`). Automated PDF/HL7/FHIR parsing is optional/future.
3. `flag`: trust the lab, else compute (`value<low→low`, `value>high→high`, else `normal`).
4. Status roll-up is automatic via the §1.4 trigger.
5. Trends come from querying analytes by stable `analyte_code` (define a canonical LOINC-aligned code list; optional future `analyte_catalog`).

**Critical path:** technician-side structured analyte entry — without it the tables stay empty.

## 6. Optional AI — "Me insight"
- Store on `lab_results.ai_insight` (+ `ai_insight_at`).
- Edge Function `generate-lab-insight` (reuse backend `MOCK_AI` config + AI-safety posture): after analytes inserted, produce a short, non-diagnostic, patient-friendly note with a "consult your doctor" disclaimer. Nullable → mobile hides the card when absent.

## 7. Rollout order
1. Migration (enums + columns + table + trigger + indexes + RLS) — backward compatible.
2. `shared/src/api/labs.ts` additions + regenerate DB types.
3. HAMS technician ingestion UI (critical path).
4. (Optional) `generate-lab-insight` Edge Function.
5. Then wire mobile (LabRepository + useLabs hooks) against these exact shapes; verify via patient impersonation.

# Specialty Categories — Backend Implementation Specification (CATALOG IMPLEMENTED)

> **Status:** ✅ **CATALOG CONNECTED** (migration `20260701000002_specialties.sql`). The
> `public.specialties` catalog table now exists (slug, name, icon, sort_order, is_active) with public
> read RLS, seeded with the design's canonical set (Design Doc p18). Shared
> `api.specialties.listSpecialties`; mobile `discovery.listSpecialties` is now **real** and the hybrid
> is flipped. The grid/Dashboard chips/Filters chips render identically — the seed's slug/name/icon
> match the previous mock catalog exactly, so no screen change was needed. Verified via anon read
> (9 rows, ordered, icons present).
>
> **Remaining gap (§3 below — follow-up):** tapping a tile passes the specialty **name** to doctor
> search (`doctors.specialty = name`), but `doctors.specialty` is **uncurated freetext** (production
> data includes test/garbage values and typos like `cardi`/`cardiologis`). So name-based filtering is
> imperfect — this is a pre-existing data-quality issue, neither improved nor regressed by making the
> catalog real. The clean fix is the `doctors.specialty_id` FK + backfill in §3 (Cleaner, larger),
> which requires curating the doctor specialty data first. Retained as a future task.

## Where specialties are used in the app
- **Specialty Categories** grid (p18) — iconographic tiles → tap sets a filter → doctor search.
- **Dashboard → Top Specialties** chips (p14).
- **Filters** bottom sheet → Specialty chips (p18) — the selected name is passed to doctor search
  (`doctors.specialty = name`), so the catalog name must match `doctors.specialty` values.

## Current backend reality
- `public.doctors.specialty TEXT NOT NULL` (indexed `ix_doctors_specialty`); freetext (e.g.
  "Cardiologist", "ENT Specialist"). No canonical list, no ids, no icons, no ordering.
- AI routes build an ad-hoc list via `SELECT specialty FROM doctors` — fine for prompting, not for
  a curated UI.

## Gap → required backend work

### 1. Catalog table
```sql
CREATE TABLE public.specialties (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,          -- stable key, e.g. 'cardiology'
  name       TEXT NOT NULL,                 -- display, e.g. 'Cardiology'  (must match doctors.specialty)
  icon       TEXT,                          -- icon key the app maps (e.g. 'cardiology','lab','dentist','physio','skincare','records','ai')
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_specialties_active ON public.specialties (is_active, sort_order);
```
Seed with the design's canonical categories (General, Pathology, Radiology, Cardiology, Dermatology,
Pediatrics, Physio, Skincare, Dentist, …), each with an `icon` key from the app's brand Icon set
(see `mobile/src/components/ui/Icon.tsx` / `resolveIconName`).

### 2. RLS
```sql
ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "specialties_public_read" ON public.specialties FOR SELECT USING (true);
GRANT SELECT ON public.specialties TO anon, authenticated;
-- writes: facility_admin/super_admin only.
```

### 3. Linkage to doctors (for correct filtering)
The Filters/grid pass the specialty **name** to `doctor.search` (`WHERE doctors.specialty = name`).
So either:
- **(Simplest)** guarantee `specialties.name` values exactly match existing `doctors.specialty` text
  (normalize the seed to the real doctor specialties), **or**
- **(Cleaner, larger)** add `doctors.specialty_id UUID REFERENCES specialties(id)` and filter by id;
  requires a backfill + updating `doctors.search` to accept `specialty_id`.

### 4. Shared API + mobile wiring (once the table exists)
- `shared/src/api/specialties.ts`: `listSpecialties(db)` →
  `select id, slug, name, icon from specialties where is_active order by sort_order`.
- Mobile: implement `discoveryRepo.listSpecialties` (real) mapping rows → `Specialty { id: slug, name, icon }`
  (icon resolved via `resolveIconName`); flip the hybrid `discovery.listSpecialties` from mock → real.
  No screen changes needed — `useSpecialties` already drives the grid/chips.

## Until implemented
Specialties remain **mock-served** (the canonical iconographic set), so the Specialty Categories grid,
Dashboard Top Specialties chips, and Filters specialty chips render per the approved design. Doctor
**search itself is real**; only the specialty *catalog* is mock.

## Rollout
1. Create `specialties` table + RLS + seed (names matching `doctors.specialty`).
2. Add `shared` `listSpecialties`; implement mobile real `discovery.listSpecialties`; flip hybrid.
3. (Optional) `doctors.specialty_id` FK + backfill for referential filtering.

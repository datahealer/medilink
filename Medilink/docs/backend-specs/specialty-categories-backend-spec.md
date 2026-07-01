# Specialty Categories — Backend Implementation Specification (DEFERRED / future task)

> **Status:** Module 2 of the post-integration pass. **No backend source was connected** because
> none exists: there is no specialties catalog — only freetext `doctors.specialty TEXT`. The approved
> Specialty Categories screen (Design Doc p18) is a **curated, iconographic grid** that needs stable
> ids, display names, and icons. Until the catalog below exists, specialties stay **mock-served** in
> the hybrid data layer so the grid/chips render exactly as designed. No API was invented.

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

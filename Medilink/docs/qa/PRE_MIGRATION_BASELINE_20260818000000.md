# Pre-migration baseline — 20260818000000_close_unrestricted_table_exposure.sql

- Captured: 2026-08-17 10:44:09 UTC
- Project ref: `zojrwuvxrkmgnlwyuypg`
- Method: READ-ONLY `supabase db query --linked` (catalog metadata only; no row data)
- Migration status: **NOT APPLIED** at time of capture

## Table privilege + RLS state (BEFORE)

```
┌──────────────────────────┬────────┬─────────────┬─────────────┬────────────┬──────────┐
│ relname                  │ rls_on │ anon_select │ auth_select │ svc_select │ policies │
├──────────────────────────┼────────┼─────────────┼─────────────┼────────────┼──────────┤
│ _bk_omani_counts         │ false  │ true        │ true        │ true       │ 0        │
│ _bk_omani_doctors        │ false  │ true        │ true        │ true       │ 0        │
│ _bk_omani_facilities     │ false  │ true        │ true        │ true       │ 0        │
│ _bk_omani_facility_staff │ false  │ true        │ true        │ true       │ 0        │
│ _bk_omani_fp             │ false  │ true        │ true        │ true       │ 0        │
│ _bk_omani_invitations    │ false  │ true        │ true        │ true       │ 0        │
│ _bk_omani_profiles       │ false  │ true        │ true        │ true       │ 0        │
│ _bk_omani_technicians    │ false  │ true        │ true        │ true       │ 0        │
│ appointments             │ true   │ true        │ true        │ true       │ 11       │
│ doctor_availability      │ true   │ true        │ true        │ true       │ 6        │
│ doctors                  │ true   │ true        │ true        │ true       │ 5        │
│ facilities               │ true   │ true        │ true        │ true       │ 7        │
│ facility_admin_invites   │ false  │ true        │ true        │ true       │ 0        │
│ facility_photos          │ true   │ true        │ true        │ true       │ 3        │
│ invitations              │ false  │ true        │ true        │ true       │ 0        │
│ payments                 │ true   │ true        │ true        │ true       │ 5        │
│ profiles                 │ true   │ true        │ true        │ true       │ 4        │
│ reviews                  │ true   │ true        │ true        │ true       │ 5        │
│ spatial_ref_sys          │ false  │ true        │ true        │ true       │ 0        │
│ specialties              │ true   │ true        │ true        │ true       │ 2        │
│ technicians              │ false  │ true        │ true        │ true       │ 4        │
│ user_notifications       │ false  │ true        │ true        │ true       │ 0        │
└──────────────────────────┴────────┴─────────────┴─────────────┴────────────┴──────────┘
```

## Verification script results (BEFORE migration)

Run per-DO-block via `supabase db query --linked`. `\set ON_ERROR_STOP on` was omitted because
`supabase db query` sends the file to the server as SQL and rejects psql meta-commands; the SQL
inside each block was run verbatim.

| Part | Check | Result | Meaning |
|---|---|---|---|
| A | anon holds no privilege | **FAIL (expected)** | anon holds SELECT/INSERT/UPDATE/DELETE on all 12 tables |
| B | RLS enabled | **FAIL (expected)** | RLS off on 8 snapshots + user_notifications |
| C | snapshots have no policies | PASS | 0 policies — nothing to regress |
| D | user_notifications own-row policy | **FAIL (expected)** | policy does not exist yet |
| E1 | authenticated not over-revoked | PASS | invitations/technicians/user_notifications SELECT intact |
| E2 | service_role retained | PASS | all targets readable by service_role |
| E3 | guest mode intact | PASS | 6 discovery tables still anon-readable |
| E4 | patient RLS intact | PASS | 11 patient tables all have RLS |
| F1 | deferred items still deferred | PASS | RLS correctly OFF on invitations + technicians |
| F2 | spatial_ref_sys untouched | PASS | RLS off, PostGIS reference data unmodified |

A, B and D are the exposure being measured. C and E–F are the state the migration must preserve.
After applying, ALL TEN must pass.

## Externally observable baseline (anon key over HTTPS, HEAD + count only)

| Table | anon rows visible |
|---|---|
| _bk_omani_profiles | 270 |
| _bk_omani_doctors | 112 |
| _bk_omani_invitations | 111 |
| invitations | 111 |
| _bk_omani_facilities | 52 |
| _bk_omani_technicians | 27 |
| technicians | 27 |
| _bk_omani_counts | 13 |
| _bk_omani_fp | 5 |
| _bk_omani_facility_staff | 3 |
| facility_admin_invites | 0 |
| user_notifications | 0 |

Guest-mode reference counts that MUST NOT change: doctors 112, facilities 52, specialties 9,
reviews 10, doctor_availability 507, facility_photos 11.
Patient-table control: appointments returns 200 with 0 rows to anon (RLS filtering correctly).

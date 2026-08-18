# `supabase/planned/`

SQL changes that are **written and reviewed but deliberately not applied**, held here instead of
in `supabase/migrations/`.

## Why not just leave them in `migrations/`?

Because `supabase db push` would consume them.

A file in `migrations/` that contains no executable statements still gets **recorded as applied**
in `supabase_migrations.schema_migrations` the first time anyone pushes. Its timestamp is then
spent. When the change is finally approved and the real SQL is written into that same file,
`db push` skips it — it has already been applied as far as the ledger is concerned — and the fix
silently never runs. Nothing errors; the migration simply has no effect, forever.

Keeping the file out of `migrations/` avoids that entirely. `config.toml` sets
`schema_paths = []`, and `db push` only reads `migrations/`, so nothing in this directory is ever
picked up automatically.

## Promoting one of these to a real migration

1. Get the sign-off named in the file's header.
2. `supabase migration new <name>` to mint a **fresh** timestamp — do not reuse the filename here,
   and do not move this file into `migrations/` as-is.
3. Copy the reviewed SQL into the new file, applying any correction the sign-off asked for.
4. Run the file's own verification queries against production afterwards. Every file here carries
   a read-only verification block for exactly this purpose.
5. Delete the entry from this directory once it has shipped, so `planned/` only ever describes
   work that is still outstanding.

## Current contents

### `20260819000000_exclude_inactive_doctors_from_slots.sql`

Stops deactivated doctors being offered as bookable at the **RPC layer**. Three parts, with
different approval requirements — read the file's header, which records the production
measurements behind it.

The **client-side** half of this defect is already fixed and shipped separately
(`shared/src/api/doctors.ts` filters `is_active` in `searchDoctors` and `getDoctor`, and the web
favourites hydration filters it too), so no MediLink screen can reach a deactivated doctor. What
remains here is the data layer still advertising slots to anyone calling the RPCs directly.

Blocked on: HAMS confirming what `is_active = false` means for their roster — "no longer
employed" or "not publicly listed". Part 2 touches `get_available_slots`, which HAMS also calls,
and part 3 drops the out-of-band `"Public read doctors"` policy, which is a separate coordinated
change.

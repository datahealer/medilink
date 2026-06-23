# Data Layer — Repositories & `DATA_MODE`

UI-first architecture (Phase A). Screens/hooks depend only on **domain models** and
**repository interfaces** — never on Supabase/HAMS row shapes. A single env switch
chooses the data source.

## The switch

```env
EXPO_PUBLIC_DATA_MODE=mock        # typed in-memory data, NO backend (dev default)
EXPO_PUBLIC_DATA_MODE=staging     # real HAMS + Supabase (staging)
EXPO_PUBLIC_DATA_MODE=production  # real HAMS + Supabase (production)
```

Resolved in `src/config/env.ts` (`DATA_MODE`). In `mock`, the SUPABASE/API env vars are
optional (safe fallbacks) so the app runs with **zero backend config**.

## Layout

```
src/data/
  types.ts          # domain models (PatientProfile, FamilyMember, MedicalHistory, …)
  repositories.ts   # interfaces: Auth / Patient / Family / MedicalHistory / Appointment
  mock/index.ts     # in-memory impls + seed data (Aisha Al Harthy + family, from the PDF)
  real/index.ts     # impls wrapping the UNCHANGED @medilink/shared api.* + authService
  index.ts          # factory → `repositories` (mock | real) + `isMockData`
```

`repositories` is the only thing the app imports. Selection:
`DATA_MODE === "mock" ? mockRepositories : realRepositories`.

## Flow

```
screen → TanStack hook (useProfile/useFamily/…) → repositories.<x> → mock | real
                                                                         └ real → @medilink/shared api.* (Supabase/RLS) + apiFetch (HAMS REST)
```

- `AuthProvider` drives `authStore` via `repositories.auth.restoreSession()` + `subscribe()`.
  In mock mode you start as **guest**, then mock sign-in/sign-up sets **authed** so every
  authenticated screen is reachable with seed data.
- `authStore` no longer imports `@supabase/supabase-js` types — it uses the domain
  `SessionUser`. The Supabase client/foundation is **kept intact**, just behind the boundary.

## Backend foundation — preserved, not deleted

Supabase client, `apiFetch`, env config, SecureStore tokens, TanStack Query provider, auth
guard, shared API types, error handling and `authService` are all untouched. `data/real`
simply wraps them. Phase B = swap one module's repo from mock→real after visual approval,
in the agreed order (Auth → Profile → Family → Medical History → Dashboard → …).

## UI states

- **Loading** — mock adds ~450 ms latency so `query.isLoading` spinners show.
- **Filled** — seed data renders the PDF's example content.
- **Empty / Error** — handled in every screen (`EmptyState` / `ErrorState`); reached in
  real/staging mode (e.g. a fresh account, or network off). Mock returns filled data by
  default; flip individual mock methods to throw / return `[]` to preview those states.
- **Disabled** — e.g. Add-family at the 5-member cap, Google button (not configured).

# MediLink — Migration Summary

What came from **HAMS** (the source Next.js + Supabase project), what was reused as-is, what changed, and what's left. This is the consolidated view; granular logs live in [REUSE_REPORT.md](./REUSE_REPORT.md), [BACKEND_MIGRATION_SUMMARY.md](./BACKEND_MIGRATION_SUMMARY.md), [MIGRATION_REPORT.md](./MIGRATION_REPORT.md), [FOUNDATION_REPORT.md](./FOUNDATION_REPORT.md), [API_COMPLETION_REPORT.md](./API_COMPLETION_REPORT.md).

**Source:** `D:\New folder (3)\hams-frontend` (read-only — never modified). **Target:** this monorepo. Guiding rule: **re-home, don't rewrite.**

## 1. What was migrated from HAMS
| Area | Migrated into MediLink | Count |
|---|---|---|
| Supabase schema (migrations) | `supabase/migrations/` | 121 reused |
| Edge Functions | `supabase/functions/` | 13 |
| Privileged API routes | `backend/src/app/api/**` | 36 route handlers |
| Backend libraries | `backend/src/lib/**` | 25 files |
| DB types / domain types / enums | `shared/src/types/`, `shared/src/auth/` | generated `Database` + roles |
| i18n catalogs (EN/AR) + config | `shared/src/config/` | full catalogs |
| Patient CRUD query patterns | `shared/src/api/*` (re-homed) | 13 modules / 49 fns |

## 2. What was reused as-is (verbatim)
- **All 121 HAMS migrations** + `config.toml` — no schema fork; the same remote Supabase project is reused.
- **All 13 Edge Functions** — copied unchanged (`send-booking-confirmation`, `generate-invoice`, `generate-health-insights`, `notify-lab-result`, `notify-waitlist`, `poll-refund-status`, `export-user-data`, `purge-user-auth`, `generate-patient-report`, `generate-report`, `generate-revenue-report`, `generate-facility-patients-report`, `broadcast-announcement`).
- **36 privileged routes** — moved verbatim (Payments·Thawani/Stripe, AI, PDF, OTP/2FA/Google auth, GDPR, profile-photo, calendar). Logic unchanged.
- **Backend `lib/` helpers** — Supabase clients (`service`, `server`, `api`, `adminClient`, `client`, `browser`, `middleware`), auth guards, email, sms, audit.
- **All patient RPC signatures** — `book_appointment_atomic`, `cancel_appointment_safe`, `reschedule_appointment_atomic`, `get_available_slots`, `get_nearby_*`, etc. (called unchanged by the shared layer).

## 3. What was modified
| Change | Why |
|---|---|
| Import rewrites `@/types/supabase` & `@/lib/auth/roles` → `@medilink/shared` | Dedupe types/roles into the shared package |
| Deleted `backend/src/lib/auth/roles.ts` | Deduped to `shared/src/auth/roles.ts` |
| `shared` barrels made extensionless (stripped `.js` specifiers, 11 files) | Portable resolution under both Next (webpack/turbopack) and Metro |
| `shared/src/config/i18n/translate.ts` re-pathed | Migration flattened `./messages/*` → `./en`/`./ar` |
| `shared/src/auth/roles.ts` typed `Set<string>` | Fix `Set<literal>.has(string)` type error |
| `Database` augmented with `device_tokens` + `notification_preferences` | New additive tables not yet in generated types |
| `payments/webhook` RPC args cast (`as never`) | Generated RPC types non-null; migrated path forwards nullable/null (runtime unchanged) |
| Backend `tsconfig` disables `noUncheckedIndexedAccess` | Match HAMS strictness (HAMS used `strict` but not this flag) |
| CRUD routes **not** copied to backend | Re-homed to `shared/src/api/*` as direct-Supabase modules instead |
| `db:types` script hardened (`2>/dev/null`) | Prevent CLI notice corrupting the generated file |
| Removed `lib/sidebarConfig.ts`, `lib/services/queueSync.ts` | Staff/admin-only, out of patient scope |

## 4. What was added (MediLink-specific)
- **Monorepo scaffolding:** `backend/ frontend/ shared/ mobile/ supabase/ scripts/ docs/`, root workspaces, `tsconfig.base.json`, `.env.example`.
- **Shared re-home data layer:** `shared/src/api/*` — 13 typed modules / 49 functions (the patient CRUD surface).
- **App foundations:** web (`frontend/`) and mobile (`mobile/`) providers, theme, i18n, Supabase clients, auth, navigation — **no UI screens yet**.
- **Push transport:** additive migrations `device_tokens`, `notification_preferences`; mobile `services/push.ts`; backend `notifications/push` dispatch route.

## 5. What remains to be built
| Area | Status |
|---|---|
| **Mobile UI screens** | Not started (navigation + data layer ready) |
| **Web UI screens** | Not started (App Router + data layer ready) |
| Re-home query **bodies** | ✅ Done (all 11 domains) |
| Push integration **validation** (real FCM/APNs on device) | Pending |
| Automated tests (unit / route / e2e) | Pending (manual smoke tests documented) |
| `patient_insurance` patient flow | Not built (no HAMS precedent — not invented) |
| Storage signed-URL policy verification (`patient-docs`, `lab-results`) | Pending (works if bucket RLS allows owner reads) |
| Production deployment (web/backend hosting, EAS builds, env, webhooks) | Pending |

## 6. Current backend completion
**≈ 90% complete for patient scope** (data + privileged services), pre-UI:
- Supabase schema/RPCs/Edge Functions: **100%** (reused).
- Privileged backend routes: **100%** migrated (Payments, AI, PDF, Auth/OTP/2FA, GDPR, calendar, push).
- Shared direct-Supabase data layer: **100%** of in-scope patient domains (typecheck-verified).
- Remaining backend work: push **validation** on real devices, automated tests, deployment hardening, optional `patient_insurance` flow.

```
Backend/data completion (patient scope, pre-UI): ████████████████████░  ~90%
Remaining: UI (web+mobile), push device validation, tests, deploy.
```

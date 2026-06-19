# MediLink — Backend Migration Summary (Step 3 plan, pre-copy)

Per-file/route plan for moving reusable HAMS backend into the monorepo. **Nothing copied yet** — this is the change list to approve before Step 3 executes.

**Source:** `D:\New folder (3)\hams-frontend` · **Target:** `D:\Medilink` (foundation from Step 2 is in place).
**Actions:** `MOVE` (privileged route → `backend/` verbatim) · `RE-HOME` (delete route; logic → direct Supabase in `frontend`/`mobile`/`shared`) · `EXTRACT` (lib → `shared`) · `BACKEND-LIB` (secrets helper → `backend/lib`) · `COPY` (Supabase, unchanged) · `SKIP` (out of patient scope) · `NEW` (build in a later step).

> Decisions locked: reuse existing Supabase project; **Thawani primary** (Stripe secondary); separate `frontend` + `backend` deployables.

---

## A. Supabase layer — `COPY` unchanged → `supabase/`
| Source | Dest | Action |
|---|---|---|
| `supabase/config.toml` | `supabase/config.toml` | COPY |
| `supabase/migrations/*` (20+) | `supabase/migrations/*` | COPY verbatim |
| `supabase/functions/*` (Edge Functions) | `supabase/functions/*` | COPY verbatim |
| `full_schema 1.sql` | `docs/reference/full_schema.sql` | COPY (reference only) |
| remote project (URL/keys) | — | **Reused as-is** (relink via `supabase link`; `.temp/` stays gitignored) |
| **NEW additive migrations** | `supabase/migrations/<ts>_device_tokens.sql`, `_notification_preferences.sql` | NEW (Step 3, additive only) |

## B. Shared layer — `EXTRACT` → `shared/src/`
| Source | Dest | Notes |
|---|---|---|
| `src/types/supabase.ts` | `shared/src/types/supabase.ts` | generated DB types; regenerate via `npm run db:types` |
| `src/types/{facility,global.d}.ts` | `shared/src/types/` | domain types |
| `src/lib/auth/roles.ts` (+ role/status enums) | `shared/src/auth/roles.ts` | shared by all clients |
| `src/constants/clinicTypes.ts` | `shared/src/config/clinicTypes.ts` | |
| `src/lib/utils.ts`, `src/lib/routes.ts` (client-safe parts) | `shared/src/utils/` | strip any server-only imports |
| i18n message catalogs (`src/i18n/messages`) | `shared/src/config/i18n/` | shared EN/AR strings; web/mobile providers consume |
| DTOs / validators (inferred from routes) | `shared/src/validation/` | centralize request/response shapes |

## C. Backend privileged routes — `MOVE` verbatim → `backend/src/app/api/<same path>/`
Stay as Next.js route handlers (secret / service-role / heavy compute). **~40 routes.**
| Group | Routes |
|---|---|
| **Payments (Thawani+Stripe)** | `payments/checkout`, `payments/[id]/invoice`, `payments/[id]/refund`, `payments/get-appointment/[id]`, `payments/unpaid`, `payments/webhook` |
| **AI** | `ai/symptom-check`, `ai/suggest-doctor`, `ai/scan-prescription`, `ai/schedule-assist` |
| **PDF** | `prescriptions/[id]/generate-pdf`, `prescriptions/[id]/download`, `prescriptions/[id]/share-link`, `patients/[id]/medical-history/pdf` |
| **Auth side-effects** | `auth/signup`, `auth/send-otp`, `auth/resend-otp`, `auth/verify-otp`, `auth/set-password`, `auth/google`, `auth/google/callback`, `auth/2fa/*`, `auth/session-log` |
| **Calendar / images** | `appointments/[id]/google`, `patients/me/profile-photo` (sharp) |
| **GDPR** | `users/me/data-export(+[id])`, `users/me/account(+cancel-deletion)` |
| **Backend libs** | `lib/supabase/{service,adminClient,api}` → `backend/src/lib/supabase/`; `lib/{email,sms}/*` → `backend/src/lib/`; `lib/audit/*` → `backend/src/lib/` (if patient audit needed) |

## D. RLS-safe CRUD — `RE-HOME` (delete route; query → client/shared) — **~55 routes**
Each verified against RLS during execution; query encapsulated in `shared/src/api/` data modules consumed by `frontend` + `mobile`.
| Domain | Routes re-homed to direct Supabase |
|---|---|
| Profile/Family | `me`, `patients/me`, `patients/me/family(+[id])`, `patients/family`, `patients/me/favourites` |
| Discovery | `doctors`, `doctors/[id]`, `doctors/[id]/availability`, `slots`, `facilities`, `facilities/nearby` (RPC), `facilities/[id]`, `facilities/[id]/available-slots`, `facilities/[id]/doctors` |
| Appointments | `appointments/book` (RPC), `appointments/[id]`, `/check-in`, `/rebook`, `/cancel-emergency`, `/ics`, `patients/me/appointments(+upcoming)`, `appointments/emergency/mine` |
| Records/Labs | `patients/me/medical-history`, `patients/me/documents(+[id], attach-appointment)`, `results`, `results/[id]/viewed`, `patients/me/results`, `patients/me/prescription-scans` |
| Prescriptions | `prescriptions`, `prescriptions/[id]` (read) |
| Reviews | `reviews`, `reviews/me`, `reviews/[id]` |
| Notifications | `notifications/me`, `read-all`, `unread-count` (+ Realtime subscribe) |
| GDPR / Waitlist | `users/me/consent`, `users/me/privacy`, `waitlist`, `waitlist/mine` |
| Client libs | `lib/supabase/{client,browser,server,middleware}` → `frontend/src/lib/supabase/`; mobile gets a bearer-token client in Step 5; `context/AuthContext`, `hooks/useDoctorFavourites`, `useFacilityFavourites` → `frontend` (logic shared) |

## E. `SKIP` — out of MediLink patient scope (~65 routes + helpers)
`admin/*`, `doctor/*`, `doctors/me/*`, `doctors/[id]/{invite,onboarding,status,documents,availability/block}`, most `facilities/[id]/*` (admins, analytics, announcements, branches, calendar, earnings/payouts, logo, patients, photos, queue, refunds, reports, revenue, staff(+metrics), technicians, verify, status, admin-invite/limit), `technician/*`, `technicians/*`, `staff/*`, `queue-items/*`, `refunds/[id]/action`, `waitlist/[id]/claim`, `invitations/*`, `email/bulk`, `send-announcement-email`, `test-email`, `upload-doctor-photo`, `integrations/google/status`; helpers `lib/services/queueSync`, `lib/sidebarConfig`, `lib/auth/{requireFacilityAccess,requireRole,withRole}` (staff RBAC).

## F. `NEW` — later steps
- **Push transport** (FCM/APNs) + `device_tokens` table + dispatch route → `backend/src/app/api/notifications/push/` (Step 3 additive + Step 5 wiring).
- Mobile Supabase **bearer-token** client + SecureStore session (Step 5).
- Web/mobile UI (Steps after foundation).

## G. Env routing
- **`backend/.env`** gets all `SECRET` keys (`SUPABASE_SERVICE_ROLE_KEY`, Thawani/Stripe secrets, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, email, `INVITE_SECRET`).
- **`frontend/.env.local`** & **`mobile/.env`**: PUBLIC only (`*_SUPABASE_URL`, `*_SUPABASE_ANON_KEY`, `*_BACKEND_URL`, publishable keys).
- Service-role client + secret SDKs imported **only** under `backend/`.

## H. Execution order (Step 3) & verification
1. `COPY` Supabase (`config.toml`, `migrations`, `functions`) → relink, `supabase db push` (dry-run first).
2. `EXTRACT` shared types/enums/utils → `shared/`; `npm run db:types`.
3. `MOVE` privileged routes + backend libs → `backend/`; rewrite imports to `@medilink/shared` & `@/*`; `npm run build:backend`.
4. Author `RE-HOME` data modules in `shared/src/api/` (queries) — routes deleted only after the client module replaces them.
5. Add `NEW` additive migrations (`device_tokens`, `notification_preferences`).
6. `npm install` (generates root `package-lock.json`), `npm run typecheck`.
7. Produce `docs/MIGRATION_REPORT.md` (Step 7): files copied/modified/skipped, APIs reused, % complete.

**Counts:** MOVE ≈ 40 · RE-HOME ≈ 55 · SKIP ≈ 65 · EXTRACT ≈ 8 module groups · NEW = push + 2 migrations.

> ⏸ **Confirm to start Step 3.** Open question: keep `auth/send-otp`/`verify-otp` server-side (SMS secret) — confirm OTP channel is **SMS** (Thawani/provider) vs Supabase email OTP, so I route it correctly.

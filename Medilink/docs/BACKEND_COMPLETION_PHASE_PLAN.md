# Backend Completion — Phased Plan

> Scope: `backend/`, `shared/`, `supabase/` (server/data tier). Pure UI-only work (web/mobile screens with
> no backend change) is **documented but not implemented**, per the brief. **Insurance** and **Telemedicine**
> are **out of scope** (client-removed) and appear nowhere below.
> Branch: `development`. Rules: one phase at a time, stop for approval after each, no commits/push/deploy,
> every phase leaves the project compiling + type-safe.

---

# Overview

**Current backend completion: ~85%.** The two-tier design is real and largely finished — `shared/src/api/*`
(RLS tier) and `backend/src/app/api/**` (~40 routes) are almost entirely functional and backed by real tables
and RPCs. What remains is **hardening and cleanup**, not greenfield features.

**Remaining work (backend-only), by theme**
- **Security (critical):** payment-webhook trusts its body (payment-bypass), OTP stored plaintext + returned in
  API responses, OAuth tokens logged to console.
- **Authentication hardening:** OTP rate-limiting, OTP delivery (SMS is stubbed), a dead route reference, a wrong
  post-OAuth redirect path, dead SMS file.
- **Payments hardening:** "card" option books without charging; webhook robustness/idempotency.
- **Notifications:** push pipeline is a "foundation"; `send-booking-confirmation` edge fn is a stub.
- **Database/migration drift:** two live RPCs have no committed migration; a couple of edited fields aren't
  persisted.
- **AI:** two backends (`schedule-assist`, `scan-prescription`) are complete but unreachable; `symptom-check` is
  unauthenticated/unthrottled.
- **Deployment blockers:** module-scope Groq client fails `next build` without `GROQ_API_KEY`; Supabase prod
  auth config (site_url, redirect allow-list, SMTP).

**Priority (highest first):** Security → Auth hardening → Payments hardening → Notifications → DB/migration
cleanup → AI → Production readiness.

**Estimated effort remaining (backend):** ~**14–20 engineer-days** total. Critical security (Phase 1) is
~**1 day**. The bulk is Auth/Payments/Notifications hardening; several items are config/decision-gated.

---

## Remaining backend tasks (classified)

Legend — Risk: 🔴 high · 🟠 med · 🟢 low. Effort: S (<0.5d) · M (0.5–1.5d) · L (2–4d).

| ID | Title | Class | Why required | Status | Files | APIs | Tables | Risk | Effort | Deps |
|---|---|---|---|---|---|---|---|---|---|---|
| **T1** | Webhook must verify payment with Thawani before finalizing | Security / Payments | Webhook marks `paid` + confirms appt from the POST body alone → **payment bypass** | Broken | `payments/webhook/route.ts` | `POST /api/payments/webhook` | `payments`, `appointments` | 🔴 | S | mirrors `verify/route.ts` |
| **T2** | Hash OTP at rest + stop returning it in responses | Security / Auth | OTP stored plaintext (`hash: code`); `send-otp`/`resend-otp` **return the code in JSON** | Broken | `auth/send-otp`, `auth/resend-otp`, `auth/verify-otp` | those 3 | `otp_records` | 🔴 | S | `bcryptjs` (already dep) |
| **T3** | Remove OAuth token logging | Security | `console.log("TOKEN DATA", tokenData)` leaks Google tokens to server logs | Broken | `auth/google/callback/route.ts` | `GET /api/auth/google/callback` | — | 🔴 | S | — |
| T4 | OTP rate-limiting (per-user cooldown) | Auth | No throttle on OTP issue → abuse/enumeration | Missing (TODO) | `send-otp`, `resend-otp` | those 2 | `otp_records` | 🟠 | S | T2 |
| T5 | OTP delivery (SMS) is stubbed | Auth | `lib/sms/sendOtp.ts` fully commented; phone-OTP never delivered | Blocked | `lib/sms/sendOtp.ts`, `send-otp`, `resend-otp` | those 2 | — | 🟠 | M | **product/Twilio decision** |
| T6 | `set-password` calls a non-existent route | Bug / Auth | Fire-and-forget to `/api/notifications/admin-password-set` (no file) | Bug | `auth/set-password/route.ts` | — | — | 🟢 | S | — |
| T7 | Google callback redirects to a non-existent (HAMS staff) path | Bug / Auth | `/dashboard/dashboardpages/scheduling/calendar-sync` not in patient app | Bug | `auth/google/callback/route.ts` | that route | — | 🟢 | S | product: target screen |
| T8 | Remove dead `lib/sms/sendOtp.ts` | Technical debt | Fully commented-out file | Debt | `lib/sms/sendOtp.ts` | — | — | 🟢 | S | resolves with T5 |
| T9 | "Card" pays nothing but books pending appt | Payments | Implies card processing with no gateway | Partial | checkout path / booking | `POST /api/payments/checkout` | `payments` | 🟠 | S | product: keep/relabel |
| T10 | Webhook idempotency + enrich `gateway_ref` | Payments | Harden re-delivery; store gateway invoice ref like `verify` does | Partial | `payments/webhook/route.ts` | that route | `payments` | 🟢 | S | T1 |
| T11 | Push notifications end-to-end verification | Notifications | Route is a "foundation"; confirm token registration + delivery | Partial | `notifications/push/route.ts`, mobile `services/push.ts` | `POST /api/notifications/push` | `device_tokens`, `notification_preferences` | 🟠 | M | — |
| T12 | `send-booking-confirmation` edge fn is a stub | Notifications | Returns success without sending | Stub | `supabase/functions/send-booking-confirmation` | edge fn | — | 🟢 | S | — |
| T13 | Commit migration for `checkin_my_appointment` RPC | Migration / DB | RPC live but **no committed migration** → fresh env can't rebuild | Drift | `supabase/migrations/*` (new) | check-in (web+mobile) | RPC | 🟠 | S | live def |
| T14 | Commit migration for `get_nearby_branches` RPC | Migration / DB | RPC live but **no committed migration** | Drift | `supabase/migrations/*` (new) | `facilities.nearbyBranches` | RPC | 🟠 | S | live def |
| T15 | Persist or remove height/weight + family blood group | DB / Records | Editable in UI, silently dropped (no column) | Partial | migration + `shared/api/{profile,family}` | — | `patient_profiles`, `family_members` | 🟢 | M | product decision |
| T16 | Wire or remove `schedule-assist` & `scan-prescription` | AI | Complete backends, **no caller** (unused APIs) | Unreachable | those 2 routes | those 2 | — | 🟢 | S(remove)/M(wire) | product decision |
| T17 | Auth + rate-limit on `symptom-check` | AI / Security | Public, unauthenticated, unthrottled AI endpoint (cost/abuse) | Partial | `ai/symptom-check/route.ts` | that route | `ai_request_logs` | 🟠 | S | — |
| T18 | `GROQ_API_KEY` module-scope build blocker | Deployment blocker | 4 AI routes `new Groq()` at import → `next build` fails without key | Blocker | `ai/*` routes | those 4 | — | 🔴(deploy) | S | env or lazy-init |
| T19 | Supabase production auth config | Deployment blocker | `site_url`=localhost, empty redirect allow-list, no SMTP | Config | `supabase/config.toml` + dashboard | auth emails/links | — | 🟠 | S | dashboard access |

**UI-only (documented, NOT implemented here):** refund patient UI (backend `payments/[id]/refund` exists);
mobile parity screens (GDPR, symptom-checker, onboarding wizard, reach the rate flow); dashboard fake-vitals
removal; lab-tests/surgeries "demo" gating. These need no backend change.

---

# Phases

## Phase 1 — Critical security fixes  ← (implement now)
**Objectives:** Close the three exploitable backend defects with minimal, surgical changes; no behavior change
beyond removing the vulnerabilities.

**Tasks:** T1 (webhook Thawani verification), T2 (OTP hash at rest + stop leaking the code), T3 (remove OAuth
token logging).

**Files expected to change:**
- `backend/src/app/api/payments/webhook/route.ts`
- `backend/src/app/api/auth/send-otp/route.ts`
- `backend/src/app/api/auth/resend-otp/route.ts`
- `backend/src/app/api/auth/verify-otp/route.ts`
- `backend/src/app/api/auth/google/callback/route.ts`

**Database changes:** none. **Migration changes:** none.

**Expected API changes (contract-compatible):**
- `POST /api/payments/webhook` — still `{success:true}` on a genuinely-paid session; now returns
  `{received:true, finalized:false}` (HTTP 200) when the gateway does not report the session as paid, instead of
  finalizing on trust.
- `POST /api/auth/send-otp` and `/api/auth/resend-otp` — response no longer includes the `otp` field.
- `POST /api/auth/verify-otp` — unchanged contract; now compares against a bcrypt hash.

**Validation steps:** `npm run typecheck` (all workspaces) green; backend `next build` compiles the changed
routes; manual reasoning trace that (a) an unpaid webhook body no longer finalizes, (b) OTP responses omit the
code, (c) verify still succeeds for a correct code via bcrypt compare.

**Completion criteria:** All three defects closed; typecheck passes; no unrelated code touched; no new DB objects.

---

## Phase 2 — Authentication hardening
**Objectives:** Make OTP issuance safe and remove auth dead-ends.
**Tasks:** T4 (rate-limit), T5 (SMS delivery — decision-gated), T6 (dead route ref), T7 (redirect path), T8
(remove dead sms file).
**Files:** `auth/send-otp`, `auth/resend-otp`, `auth/set-password`, `auth/google/callback`, `lib/sms/sendOtp.ts`.
**DB/Migration:** none (T4 may reuse `otp_records.created_at`/`updated_at`). **API changes:** add 429 on OTP
abuse; correct OAuth redirect target. **Validation:** typecheck+build; simulate rapid OTP calls → 429.
**Completion:** OTP throttled; no dead references; delivery decision documented/implemented.

## Phase 3 — Payments hardening
**Objectives:** Remove misleading payment paths and harden the webhook.
**Tasks:** T9 ("card" relabel/guard — backend guard only; UI relabel documented), T10 (webhook idempotency +
`gateway_ref`).
**Files:** `payments/webhook/route.ts`, `payments/checkout/route.ts`. **DB/Migration:** none.
**API changes:** none breaking. **Validation:** typecheck+build; re-deliver webhook twice → single finalize.
**Completion:** No no-op "paid" paths; webhook safe under retries.

## Phase 4 — Notification completion
**Objectives:** Make the notification pipeline production-real.
**Tasks:** T11 (push end-to-end), T12 (implement `send-booking-confirmation`).
**Files:** `notifications/push/route.ts`, `supabase/functions/send-booking-confirmation/*`.
**DB:** uses `device_tokens`, `notification_preferences` (exist). **Migration:** none expected.
**API changes:** none breaking. **Validation:** typecheck+build; token register → push received; booking →
confirmation dispatched. **Completion:** push verified; no stub edge fn.

## Phase 5 — Database cleanup / migration drift
**Objectives:** Eliminate schema drift so fresh environments rebuild exactly.
**Tasks:** T13, T14 (commit live RPC migrations), T15 (persist-or-remove height/weight + blood group).
**Files:** new `supabase/migrations/*.sql`; possibly `shared/api/{profile,family}.ts`.
**DB changes:** additive columns only if T15 persists. **Migration changes:** new idempotent migrations for the
two RPCs (+ optional columns). **API changes:** none breaking. **Validation:** `supabase db diff`/`migration
list` clean; typecheck. **Completion:** no live object lacks a committed migration.

## Phase 6 — AI completion
**Objectives:** Resolve unreachable AI backends and protect the public AI endpoint.
**Tasks:** T16 (wire or remove `schedule-assist`/`scan-prescription` — decision-gated), T17 (auth + rate-limit
`symptom-check`).
**Files:** `ai/*` routes. **DB:** `ai_request_logs` (exists). **Migration:** none.
**API changes:** `symptom-check` may require auth. **Validation:** typecheck+build; rate-limit trips.
**Completion:** no dead AI APIs; public endpoint protected.

## Phase 7 — Production readiness
**Objectives:** Remove deployment blockers.
**Tasks:** T18 (lazy-init Groq clients so `next build` succeeds without the key, or mandate build-env key),
T19 (Supabase prod auth config in `config.toml` + dashboard).
**Files:** `ai/*` routes (lazy init), `supabase/config.toml`. **DB/Migration:** none.
**API changes:** none. **Validation:** `next build` succeeds without secrets present; auth links resolve to prod
URL. **Completion:** clean build in a secretless CI; prod auth config in version control.

---

## Explicitly out of scope
- **Insurance**, **Telemedicine** — client-removed.
- **Radiology, Surgeries (transactional), Lab-ordering, Articles CMS, Dashboard vitals** — no spec/backend;
  separate product-gated initiatives, not part of backend *completion*.
- **Pure UI/mobile-parity work** — documented in the audit, implemented outside this backend plan.

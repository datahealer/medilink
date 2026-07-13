# MediLink — Patient App Backend-Completion Plan (Web + Backend)

> **Status:** PLAN ONLY — no code has been written. This document maps the work to remove all mock/static
> business data from the **web** patient app and complete the **backend** wherever feasible, per the 10-phase
> brief. Scope = `frontend/` (web), `backend/`, `shared/`, `supabase/`. Mobile parity is noted but secondary.
> Source of truth is the repository; every claim below cites a file path verified during the audits in this
> engagement (Batches 1–4 + i18n + architecture audit are already merged on `feature/patient-feature-completion`).

---

## 0. Guardrails (from the brief)

- Never change existing UI/UX, layouts, routing, or translations. Replace **data sources**, not designs.
- Prefer existing backend/shared APIs; only build new backend where none exists.
- Do **not** invent behavior. If a feature has no specification, **document it as blocked** (Rule 10) rather than
  guessing a data model. This governs Lab Ordering, Surgeries, Vitals, Articles CMS, Insurance (see §Phase 5).
- Mock/stub/TODO/placeholder counts as *not done*.
- Work in small batches; after each: `npm run typecheck`, `npm run build:frontend`, `npm run build:backend`,
  mobile `expo lint`; commit; pause. (No test suite exists yet — gates are typecheck+build+manual smoke.)
- Do not modify `package-lock.json` files (existing working-tree noise) unless explicitly agreed.

---

## Phase 1 — Implementation Map (current state, evidence-based)

### 1a. Web pages — data-source status

Legend: **Real** = backend/shared-API integrated · **Partial** = mixed real + static · **Static** = hardcoded
business data · **No-backend** = feature has no backend anywhere.

| Route (`frontend/src/app/…`) | Status | Evidence / notes |
|---|---|---|
| `(auth)/*` (sign-in/up, otp, forgot/reset, welcome, language, onboarding) | **Real** | Supabase Auth; OTP page verifies `type:"signup"`. Auth *config* bugs tracked in Phase 8. |
| `dashboard` (home) | **Partial** | Real profile/appointments/notifications; **`HEALTH_METRICS` fake vitals** (`dashboard/page.tsx:143`); articles preview from static file; decorative specialty circles (bilingual constant). |
| `dashboard/find-doctors` + `/[id]` | **Real** | `api.doctors`, `api.specialties`, `api.reviews`, availability, favourites. |
| `dashboard/clinics/[id]` | **Real** | `api.facilities.getFacility` + `searchDoctors({facilityId})` (Batch 3). |
| `dashboard/appointments` | **Real** | list/cancel/reschedule/check-in via `api.appointments` (RPCs). |
| `dashboard/payments` | **Real** | backend `/api/payments` + backend invoice (Batch 4). |
| `dashboard/profile` | **Real** | `api.profile/family/records/prescriptions`. |
| `dashboard/records` | **Real** | prescriptions/labs/docs; non-Rx "download" is a client text blob (minor). |
| `dashboard/setup` | **Real** | `api.profile/records/family`. |
| `dashboard/notifications` + `messages` | **Real** | `api.notifications.*` incl. facility messages (Batch 4). |
| `dashboard/settings` | **Real** | account + prefs + GDPR (Batch 4). |
| `dashboard/symptom-checker` | **Real** | streams `/api/ai/symptom-check`. |
| `dashboard/favourites` | **Real** | `api.favourites` (Batch 1). |
| `dashboard/articles` + `/[id]` | **Static (No-backend)** | `frontend/src/lib/data/articles.ts` — no CMS. |
| `dashboard/lab-tests` | **Static (No-backend)** | hardcoded `LABS[]` + fake booking/payment (`lab-tests/page.tsx:28,423`). |
| `dashboard/surgeries` | **Static (No-backend)** | hardcoded `SURGERIES[]` + fake consult (`surgeries/page.tsx:28`). |
| `contact` | **Static** | `mailto:` only; fake success; no endpoint. |
| marketing (`/`, about, for-clinics, services, splash) | **Real (static by design)** | brand pages, not patient data — out of scope. |
| `components/dashboard/SiteSearch.tsx` | **Partial** | real doctor search; `LAB_TESTS_INDEX`/`SURGERIES_INDEX`/articles are static mirrors. |

### 1b. Backend APIs — status
- `backend/src/app/api/**` (~40 routes): auth, payments, prescriptions, ai, users/me (GDPR), patients, notifications/push, docs — **all real**.
- `shared/src/api/**` (17 modules, ~55 fns): **100% direct-Supabase** (tables/RPCs/Auth/Storage), **zero backend calls**. All tables (20) + RPCs (8) verified live (architecture audit).
- **No backend exists** for: lab **ordering**, surgeries, vitals, articles CMS, insurance flow.

**Deliverable of Phase 1:** this table is the map. No further discovery needed before execution.

---

## Phase 2 — Static-data inventory & disposition

The keyword sweep (`mock|dummy|placeholder|fake|comingSoon|hardcoded|SEED_|HEALTH_METRICS|LABS|SURGERIES`) over
`frontend/src backend/src shared/src` returns ~90 hits across ~30 files. **Most are benign**: input `placeholder=`
attributes, `supabase.ts` codegen strings, i18n demo copy, and code comments (e.g. "not mocked-over"). The
**genuine static business-data** to remove/replace:

| # | Static data | File | Disposition |
|---|---|---|---|
| S1 | `HEALTH_METRICS` fake vitals (HR/BMI/BP) | `dashboard/page.tsx:143` | **No vitals backend** → hide/label as demo until a vitals source exists (Rule 10). Do **not** invent values. |
| S2 | `LABS[]` catalog + fake booking | `dashboard/lab-tests/page.tsx` | Needs Lab-Ordering domain (Phase 5, spec-gated). Interim: demo banner. |
| S3 | `SURGERIES[]` catalog + fake consult | `dashboard/surgeries/page.tsx` | Needs Surgeries domain (Phase 5, spec-gated). Interim: demo banner. |
| S4 | `ARTICLES` static library | `lib/data/articles.ts` (+ `articles/*`, dashboard preview) | Needs Articles CMS (Phase 5, spec-gated) OR keep static + document as out-of-scope. |
| S5 | `LAB_TESTS_INDEX` / `SURGERIES_INDEX` search mirrors | `components/dashboard/SiteSearch.tsx:24-45` | Remove once S2/S3 have real catalogs; until then they mirror the static pages. |
| S6 | Contact form (fake success) | `contact/page.tsx` | Marketing lead form — **no spec** for a leads endpoint → document; optional tiny `contact_messages` table if product wants it. |
| S7 | Non-Rx document "download" = client text blob | `dashboard/records/page.tsx:10-35` | Minor; real docs use signed URLs already. Optional cleanup. |

**Benign (leave as-is):** input placeholders (`setup`, `profile`, auth pages), `shared/src/types/supabase.ts`
codegen, i18n `specialtyNames`/demo strings, code comments. Removing these would violate "don't change UI."

**Rule-10 call:** S1–S4 cannot be made backend-driven **without a product specification** for their data models.
The plan below proposes concrete designs **for sign-off**; nothing is built until the model is confirmed.

---

## Phase 3 — Web ↔ Backend completeness (state contract per page)

For each **already-real** page, verify/complete the state contract (loading/empty/error/success, auth, i18n,
and where relevant pagination/filters/sort). Most already have loading+error; gaps to close:

| Task | Page | Gap to close | Effort |
|---|---|---|---|
| P3-1 | `dashboard/appointments`, `payments`, `records`, `notifications`, `favourites` | Confirm explicit **empty state** + **error retry** on every list; add where missing | S |
| P3-2 | `find-doctors` | Add **sorting** (rating/fee) + confirm pagination beyond `limit:100`; recent searches optional | M |
| P3-3 | `messages`, `settings` (Batch 4) | Confirm error/empty states already present (they are) — regression pass only | S |
| P3-4 | `dashboard` | Remove S1 fake vitals; keep real tiles (appointments/labs/rx counts already real) | S |
| P3-5 | All pages | Localization freetext gaps (doctor.specialty, lab names) — **documented** as needing backend normalization (see architecture/i18n audits); not a page bug | doc |

No new page designs. Only data-source and state-contract completion.

---

## Phase 4 — Build missing backend where a web page already exists

Pages that exist but lack backend, **and where the feature clearly belongs in the patient app**:

| Feature | Page exists | Backend today | Action | Spec status |
|---|---|---|---|---|
| Lab Ordering | `lab-tests` | ❌ (results-only) | Phase 5 domain | **Needs spec** |
| Surgeries | `surgeries` | ❌ none | Phase 5 domain | **Needs spec/decision (informational vs transactional)** |
| Articles | `articles`, `articles/[id]` | ❌ static file | Phase 5 CMS or keep-static | **Needs decision** |
| Contact leads | `contact` | ❌ | tiny `contact_messages` table + insert (optional) | **Needs decision** |
| Dashboard vitals | `dashboard` | ❌ no vitals table | vitals domain (Phase 5) or hide | **Needs spec** |

There are **no** already-real web pages whose backend is silently missing — every integrated page is backed
(architecture audit confirmed shared/api is fully implemented). So Phase 4 collapses into Phase 5's spec-gated
domains; nothing to "quietly wire" here.

---

## Phase 5 — Missing domains (PROPOSALS — require product sign-off before building)

> Per Rule 10, these are **proposals**, not decisions. Each invents a data model that must be confirmed by product
> before implementation, because no specification exists in `docs/` beyond the static UI.

### 5A. Lab Ordering (Large)
- **DB:** `lab_test_catalog(id, slug, name, category, sample_type, price, facility_id?, is_active)`;
  `lab_orders(id, patient_id, test_id, facility_id, scheduled_at, status, payment_id, home_collection, created_at)`;
  enums `lab_order_status`. Reuse existing `lab_results` for delivery (already built).
- **RLS:** patient reads own orders; catalog public-read; facility writes results (existing).
- **RPC:** `place_lab_order(...)` (atomic + payment link) mirroring `book_appointment_atomic`.
- **Shared API:** `shared/src/api/labs.ts` gains `listLabCatalog`, `placeLabOrder`, `listMyLabOrders`.
- **Payment:** reuse Thawani checkout (`/api/payments/checkout`) with an order reference.
- **Web:** replace `LABS[]` + fake modal in `lab-tests/page.tsx` with catalog + real order + real payment.
- **Effort:** Very Large. **Blocker:** catalog source of truth, pricing, facility linkage, refund policy — **need spec**.

### 5B. Surgeries (Very Large / decision-gated)
- **Decision first:** informational catalog vs transactional booking. If informational → a read-only
  `surgery_catalog` table + list/detail; **no** booking/payment. If transactional → full consult-request +
  scheduling + payment domain (much larger).
- **Recommendation:** treat as **informational** MVP (catalog only) unless product commits to transactional.
- **Effort:** 2 ed (informational) / 12+ ed (transactional). **Blocker:** product decision.

### 5C. Health Articles CMS (Large)
- **DB:** `articles(id, slug, title, body, category, cover_url, published_at, is_published)` + public-read RLS.
- **Shared API:** `listArticles`, `getArticle`. **Web:** replace `lib/data/articles.ts`.
- **Alternative:** keep static and **document as out-of-scope content** (no editorial backend planned).
- **Blocker:** is there an editorial/CMS owner? If not, keep static + document.

### 5D. Dashboard Vitals (Medium)
- **DB:** `patient_vitals(id, patient_id, kind, value, unit, recorded_at, source)` + RLS.
- **Source question:** who writes vitals (device? clinician? manual)? Without a source, the tiles have no real data.
- **Interim (no build):** hide the `HEALTH_METRICS` block or label "sample" so no fake number is presented as real.
- **Blocker:** vitals data source — **need spec**.

### 5E. AI
- **No placeholder to replace on web** — web symptom-checker already calls `/api/ai/symptom-check`. Mobile's static
  AI chat is a mobile task (out of this web/backend scope). `ai/suggest-doctor` real. `scan-prescription`/
  `schedule-assist` exist but unused — leave. **No action** unless mobile is pulled in.

---

## Phase 6 — Shared API verification (already complete)

The architecture audit already verified **every** `shared/src/api` function resolves to a real table, RPC, Auth, or
Storage call; **none** is a stub. **Two RPCs are live but their migrations are uncommitted** (Phase 7). No shared
function needs implementing. Action: none, beyond Phase 7's migration fixes.

---

## Phase 7 — Architectural drift (concrete, low-risk)

| # | Item | Evidence | Action | Effort |
|---|---|---|---|---|
| D1 | `checkin_my_appointment` RPC live but **no committed migration** | `supabase.ts:4162`, used by check-in (web+mobile) | Add a migration that (re)creates it from the live definition | S |
| D2 | `get_nearby_branches` RPC live but **no committed migration** | `supabase.ts:4490` | Add migration (or repoint `facilities.nearbyBranches` to committed `nearby_branches`) | S |
| D3 | Web payments uses backend REST; mobile uses `api.payments` (two paths) | audit | Document as intentional (web needs backend for method/aggregation); no change | doc |
| D4 | Scattered per-file enum maps vs shared catalog | localization audit | Optional consolidation; low priority, do not risk UI | S (opt) |

---

## Phase 8 — Auth (CONFIG-level; mostly Supabase dashboard, minimal/no code)

Root causes already diagnosed (see the two auth root-cause reports in this engagement). **The MediLink code is
correct; the reused HAMS Supabase project config is wrong.**

| # | Fix | Where | Code change? |
|---|---|---|---|
| A1 | Add MediLink callback/reset URLs to **Redirect URLs** allow-list | Supabase dashboard (shared HAMS project) | No |
| A2 | Switch **Confirm signup** email template to `{{ .Token }}` (6-digit OTP) | Supabase dashboard | No (OTP page already verifies `type:"signup"`) |
| A3 | Configure **OTP SMS** provider (Twilio) | Supabase dashboard / env | No |
| A4 | Wire mobile **password-reset deep link** recovery session | `mobile/app/auth/reset-password.tsx` | Yes (mobile; out of web scope — flag) |
| A5 | Mirror A1/A2 in `supabase/config.toml` (`additional_redirect_urls`, template block) | `supabase/config.toml` | Config file only |
| A6 | Decide shared-project strategy (HAMS also uses this template/Site URL) | product | Decision |

**Caveat:** changing the shared Confirm-signup template also affects HAMS signups — confirm HAMS can verify a token,
or split projects. **Do not change blindly** (documented risk).

---

## Phase 9 — Payments end-to-end verification (mostly verify, 2 fixes)

| Step | State | Action |
|---|---|---|
| Checkout | ✅ Thawani hosted (`/api/payments/checkout`) | verify |
| Verify | ✅ `/api/payments/verify` + web return | verify |
| Webhook | ⚠️ route exists, **signature unverified** | **Fix:** verify Thawani signature (`/api/payments/webhook`) — S |
| Invoice | ✅ backend `/api/payments/[id]/invoice` (Batch 4) | **Fix:** add **ownership check** (currently IDOR — service client, no auth) — S |
| Receipt | ✅ web + mobile invoice screens | verify |
| Refund | ⚠️ `/api/payments/[id]/refund` + `poll-refund-status` edge fn; no patient UI | document (UI deferred) |
| Notifications on pay | ✅ `notifyPaymentSuccess` + edge fns | verify |
| Appointment confirmation | ✅ `send-booking-confirmation` edge fn | verify |
| "Card" option | ⚠️ books pending appt with **no gateway** | **Fix:** relabel/disable to avoid implying card processing — S |

---

## Phase 10 — Verification gates (per batch + final)

Run and require green: `npm run typecheck` (4 workspaces) · `npm run build:frontend` · `npm run build:backend` ·
mobile `npx expo lint` (+ `expo export` if mobile touched). Then confirm: no broken imports, no unused APIs
introduced, no static business data remaining outside the documented out-of-scope set, no fake metrics/mock
booking/mock payment presented as real.
> Note: `next lint` cannot run (no `eslint.config.js` in web/backend) — typecheck+build are the enforceable gates.

---

## Execution sequencing (proposed batches)

- **Batch A — Drift & security (safe, no UX change):** D1, D2 (RPC migrations), A5 (config.toml mirror), P9 invoice
  IDOR + webhook signature, P9 "Card" relabel. *No product decision needed.* **~2–3 ed.**
- **Batch B — Honesty/demo gating (no invented data):** S1 hide/label vitals, S2/S3 demo banners on lab-tests &
  surgeries, S5 keep search mirrors consistent. Closes "fake presented as real" without inventing backends. **~1 ed.**
- **Batch C — State-contract pass:** P3-1, P3-2 (sorting), P3-4. **~2–3 ed.**
- **Batch D — Auth config (dashboard, needs access + decision A6):** A1–A3. **~0.5 ed + product sign-off.**
- **Batch E — Spec-gated domains (BLOCKED until sign-off):** 5A Lab Ordering, 5B Surgeries, 5C Articles, 5D Vitals,
  S6 Contact. Build only after each model is confirmed. **Large; per-domain sub-plans on approval.**

Batches A–D contain everything achievable **without inventing behavior**. Batch E is where the bulk of "remove all
mock" lives, and it is **spec-gated by Rule 10**.

---

## Explicitly BLOCKED (documented, not invented)

| Feature | Why blocked | Needed to unblock |
|---|---|---|
| Lab Ordering | No catalog/pricing/refund spec; no backend | Product spec + catalog data source |
| Surgeries | Undecided informational vs transactional | Product decision + spec |
| Articles CMS | No editorial owner/spec | Decision: CMS vs keep-static-out-of-scope |
| Dashboard vitals | No vitals data source | Spec: who writes vitals |
| Insurance | `patient_insurance` table only, no flow/spec | Product spec |
| Mobile clinic screen / AI chat / privacy wiring / reset deep link | Mobile scope; out of web/backend brief | Pull mobile into scope |
| Auth shared-project template change | Affects HAMS too | Product decision (A6) |

---

## Final report template (to be filled after execution)

- Pages converted static→dynamic: …
- Backend endpoints created: …
- SQL migrations added: …
- RPCs added: …
- Tables added: …
- Mocks removed (file:line): …
- Hardcoded values removed: …
- Features still blocked + exact reason: … (see BLOCKED table)

---

### Bottom line for the reviewer
Everything that can be completed **without inventing a data model** is Batches A–D (drift/security, honesty gating,
state contracts, auth config) — safe, low-risk, no UX change. The large "remove all mock" items (lab ordering,
surgeries, articles, vitals) are **real domains with no specification** and are therefore presented as **proposals
requiring sign-off**, per Rule 10, rather than built speculatively. On approval of each model, I will produce a
per-domain sub-plan (schema + RLS + RPC + shared API + web wiring) and execute in small, gated batches.

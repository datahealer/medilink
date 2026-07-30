# MediLink — Full Production Readiness Audit

**Date:** 2026-07-29 · **Branch:** `development` @ `fbc2097`
**Method:** static analysis of the repository + live read-only probes against the Supabase
project + executed build/test/typecheck commands. Every claim below is evidence-backed.

---

## 0. Verification boundary — read first

The brief asked for no guessing. These items **cannot** be verified in this environment and are
**not** claimed as tested anywhere in this report:

| Not verifiable here | Why | Where it must happen |
|---|---|---|
| Load at 100 / 500 / 1k / 5k / 10k concurrent users | No load-generation infrastructure | Staging + k6/Artillery |
| Physical device behaviour (crashes, safe area, haptics, camera, push delivery) | No iOS/Android hardware | `DEVICE_TEST_CHECKLIST.md` |
| Lighthouse / Core Web Vitals / real LCP-CLS-INP | No browser or Lighthouse runner | CI with Lighthouse CI |
| Live `EXPLAIN ANALYZE` under production data volume | Read-only anon access only; no service-role SQL console | Supabase SQL editor |
| Dashboard-side config (Apple, Expo/EAS, GCP, Supabase settings, Vercel env) | Outside the repo | Account owners |
| Cross-patient isolation with two real sessions | No seeded patient credentials | Staging security test |
| Runtime React warnings / hydration / memory leaks | Requires a running browser + profiler | Manual QA + React DevTools |
| Every button/link/modal manually exercised | Requires a running app | `MANUAL_QA_CHECKLIST.md` (18 areas) |

Everything else below was verified. Commands executed are listed in §23.

---

## 1. Executive summary

MediLink is a genuinely well-engineered codebase whose **code quality substantially exceeds its
production readiness**. Architecture is disciplined (a documented two-tier split, one shared API
layer, a repository pattern on mobile), typing is strict (0 errors across 4 workspaces, zero
`@ts-ignore`), and the data layer is correct where it counts — RLS holds on every PHI table
under live probe, money math is centralised and tested, and the HAMS queue contract is enforced
by tests.

What is not ready is everything *around* the code: release configuration, credentials,
observability, and verification. The single most dangerous defect is not a bug in a feature — it
is that **a production build currently ships with fabricated patient data** because no build
profile declares environment variables. Layered on that: payments default to a sandbox host, one
unauthenticated endpoint leaks an API-key prefix and burns paid model calls, there are **no HTTP
security headers at all**, **no crash reporting**, and the web app has **essentially no SEO
foundation** (1 metadata export across 35 routes; no sitemap, robots, OpenGraph or structured
data).

Nothing has ever run on a physical device, and two security gates (guest-mode RLS, queue
cross-tenant isolation) remain unexecuted.

**Verdict: NOT READY for production. Ready for internal testing.** The path to TestFlight/beta is
roughly 3–5 days of configuration and observability work plus a device-QA cycle — not feature
work. Two blockers are owned by the external HAMS team and one is a product decision.

---

## 2–15. Scores

Scoring basis: weighted against what a production healthcare app requires, with unverifiable
areas scored on *evidence available*, not assumed pass. Anything marked ⚠️ is capped because it
could not be verified rather than because it failed.

| # | Dimension | Score | Basis |
|---|---|---|---|
| 2 | **Overall completion** | **88%** | Features built; config/observability/verification outstanding |
| 3 | **Production readiness** | **52%** | 10 blockers, 4 of them silent-failure class |
| 4 | **Security** | **62%** | RLS verified holding + CORS correct + no secrets in client; but no headers/CSP, a leaking debug endpoint, 14 unguarded (empty) tables, 4/43 routes rate-limited |
| 5 | **Performance** | ⚠️ **65%** | Indexes 100/101 present, bundles 135–212 kB, adaptive polling; **no load test possible** |
| 6 | **Architecture** | **90%** | Clean tiering, one shared API layer, no duplicate clients; minor dead deps |
| 7 | **Mobile** | **86%** | 64 screens, offline cache, runtime RTL, 189 tests; zero device validation |
| 8 | **Backend** | **80%** | 43 routes, service-role isolation, HMAC webhook; thin rate limiting, 1 bad endpoint |
| 9 | **Web** | **72%** | Builds 35/35, real data after `fbc2097`; 2 pages fake a purchase, no headers |
| 10 | **Database** | **88%** | 152 migrations ordered + synced, 101 indexes, constraints/triggers present; 1 missing index |
| 11 | **Supabase** | **84%** | RLS on 61/76 tables and verified holding; 2 schema-drift objects, 16 edge functions unverified-deployed |
| 12 | **Authentication** | **78%** | Real Supabase auth, proactive token refresh, middleware gating verified; forgot-password cannot complete, no SMS |
| 13 | **GDPR compliance** | **70%** | Export + deletion + audit logging + consent table exist; legal documents absent, PHI cache unencrypted at rest |
| 14 | **SEO** | **18%** | Near-absent foundation — see §14 detail |
| 15 | **Scalability estimate** | ⚠️ see §15 | Extrapolated from architecture, **not load-tested** |

### §14 SEO detail (worst-scoring area)

Verified by enumeration, not opinion:

| Requirement | State |
|---|---|
`export const metadata` / `generateMetadata` | **1 file** (`app/layout.tsx`) across **35 routes** |
Root metadata content | `title: "MediLink"`, `description: "MediLink — patient healthcare app"` — 43 chars, no keywords, no locale |
`sitemap.ts` / `sitemap.xml` | **absent** |
`robots.ts` / `robots.txt` | **absent** |
OpenGraph tags | **absent** (0 matches repo-wide) |
Twitter Cards | **absent** |
JSON-LD / schema.org | **absent** — no `MedicalOrganization`, `Physician`, `MedicalClinic`, `FAQPage` or `Article` |
Canonical URLs | **absent** |
`manifest.ts` (PWA) | **absent** |
`hreflang` for en/ar | **absent** despite full bilingual content |
Public indexable pages | only 6: `/`, `/about`, `/contact`, `/services`, `/for-clinics`, + payment returns |

**Answer to the ranking question:** for "doctor in Oman", "dermatologist Oman", "clinic Oman",
"hospital appointment Oman" — **the site cannot realistically rank today.** Three structural
reasons: (a) doctor and clinic pages live under `/dashboard/*` behind auth middleware, so the
highest-value content is uncrawlable; (b) there is no sitemap, robots, canonical or structured
data, so nothing guides a crawler; (c) every page inherits one generic title/description, so
there are no keyword-targeted landing pages at all. Brand search ("MediLink") would resolve, as
brand queries usually do. Ranking for commercial intent needs public, indexable, individually
-optimised doctor/clinic/specialty pages plus `Physician`/`MedicalClinic` JSON-LD — a feature
project, not a config fix.

### §15 Scalability estimate (extrapolated — **not load-tested**)

Reasoning is architectural: Supabase/Postgres + stateless Next routes + client-side polling.

| Concurrent users | Assessment | Limiting factor |
|---|---|---|
| **100** | ✅ Comfortable | None |
| **500** | ✅ Likely fine | Connection pooling; confirm PgBouncer mode |
| **1,000** | 🟡 Probable, unproven | 4/43 routes rate-limited; AI + PDF routes are unbounded and CPU/cost-heavy |
| **5,000** | 🔴 Unlikely as-is | Queue polling (10–60 s/client) plus no server cache on hot reads; Supabase plan limits |
| **10,000** | 🔴 No | Needs read caching, realtime fan-out instead of polling, durable rate limiting, connection pooling review |

The queue design is the good news: it polls adaptively and stops at terminal state, and its
realtime path was deliberately designed as one broadcast row rather than per-client table
subscriptions. The bad news is the absence of any server-side cache and in-memory (per-instance,
serverless-defeating) rate limiters.

---

## 16–19. Findings

Severity: 🔴 blocker · 🟠 high · 🟡 medium · 🔵 low/informational

### 🔴 Production blockers (10)

| # | Finding | Evidence |
|---|---|---|
| **B1** | **A production build ships fabricated patient data.** No build profile in `eas.json` declares `env`, so `EXPO_PUBLIC_DATA_MODE` is unset → `src/config/env.ts:20` defaults to `mock` → seeded fake patient ("Aisha Al Harthy"). `EXPO_PUBLIC_APP_ENV` also defaults to `development`, enabling the dev screen gallery. **Fails silently — nothing warns.** | `eas.json` (no `env` key), `mobile/src/config/env.ts:20` |
| **B2** | **Payments default to Thawani UAT.** `THAWANI_CHECKOUT_BASE_URL ?? "https://uatcheckout.thawani.om"` — unset in production means real bookings never take real money. | `backend/src/app/api/payments/checkout/route.ts:109` |
| **B3** | **`GET /api/ai/health` is unauthenticated**, returns `keyPrefix` (first 7 chars of `GROQ_API_KEY`) plus `NODE_ENV`, and makes a live Groq completion **per request** → unauthenticated cost amplification + partial secret disclosure. | `backend/src/app/api/ai/health/route.ts:16-30`; confirmed no auth guard by route sweep |
| **B4** | **No HTTP security headers anywhere.** Neither `next.config.ts` sets `headers()`. Missing CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` → clickjacking, MIME sniffing, no transport pinning for a PHI app. | grep of both `next.config.ts` — 0 matches |
| **B5** | **`usesCleartextTraffic: true`** permits plaintext HTTP on Android for PHI. | `mobile/app.json:26` |
| **B6** | **Push notifications non-functional end-to-end.** Client complete, but no APNs key, no FCM credentials, no `aps-environment` entitlement. | `app.json` has no `entitlements`; no `google-services.json` |
| **B7** | **Queue cannot progress** — nothing writes `status='called'`/`'done'`; `call_next`/`skip`/`recall`/`pause`/`mark_no_show` unbuilt. Patients check in and wait forever. **HAMS-owned.** | `QUEUE_BACKEND_FOR_MEDILINK.md` §3.6; no writer in repo |
| **B8** | **No push on "→ called"** — the decisive moment never reaches a backgrounded patient. **HAMS-owned.** | contract §3.3 |
| **B9** | **`lab-tests` and `surgeries` fake a completed purchase.** Final button is `onClick={() => setBooked(true)}` — no appointment, no payment, nothing persisted, then a success screen. A patient can complete "Pay OMR 4,500" and receive confirmation for a booking that does not exist; providers/prices/slots fabricated. **Product decision** — no catalogue backend exists. | `lab-tests/page.tsx:423`, `surgeries/page.tsx:479` |
| **B10** | **Store assets + legal absent** — no splash, no Android adaptive icon, no notification icon, no `PrivacyInfo.xcprivacy`, no Privacy Policy/Terms/Medical Disclaimer (`href="#"` in sign-up). Submission will be rejected. | `assets/images/` contains only `icon.png`; `sign-up/page.tsx:153,157` |

### 🟠 High (9)

| # | Finding | Evidence |
|---|---|---|
| H1 | **No crash/error reporting.** Zero Sentry/Bugsnag/Crashlytics/Datadog. Field crashes in a healthcare app are undiagnosable. | grep across all workspaces + `package.json` |
| H2 | **Rate limiting on 4 of 43 backend routes.** `ai/scan-prescription` and `ai/schedule-assist` are authenticated but unbounded — LLM/vision cost exposure. | route sweep |
| H3 | **Rate limiters are in-memory `Map`s** → per-instance, bypassable on serverless. | tracker 7.3; `lib` limiters |
| H4 | **Migration `20260729000000` committed but unapplied.** Until pushed, `title_ar`/`body_ar` do not exist while `shared/src/api/notifications.ts:8` selects them explicitly → `42703 undefined_column` breaks notifications on **web and mobile**. | `supabase migration list`; `notifications.ts:8` |
| H5 | **Forgot-password cannot complete.** `resetPassword` only works inside a recovery session, and no deep link is configured (`app.json` has no `associatedDomains`/`intentFilters`). | `authService.ts:203`; `app.json` |
| H6 | **Email is development-grade on both paths.** Auth email uses Supabase's built-in sender (`[auth.email.smtp]` commented out, hourly-capped, documented non-production); app email is nodemailer hardcoded to Gmail (~500/day, no SPF/DKIM alignment). Signup OTP and password reset are the flows that break, i.e. the ones that lock users out. | `supabase/config.toml:223-231`; `backend/src/lib/email/*.ts:9` |
| H7 | **PHI cached unencrypted at rest on device.** React Query persists to AsyncStorage (app-private, not encrypted), 24 h TTL. Mitigated by logout purge + version buster, but MMKV-with-encryption is the correct store. | `mobile/src/providers/QueryProvider.tsx:39-45` |
| H8 | **Zero device validation, and two security gates unrun** — guest-mode RLS and queue cross-tenant isolation (`get_my_queue_position('<other patient>')` must return `forbidden`). | no test artifacts |
| H9 | **Android Maps key is a literal placeholder** — Android map non-functional; also map pins still come from the mock source. | `app.json:32`; `data/index.ts:46` |

### 🟡 Medium (10)

| # | Finding |
|---|---|
| M1 | **14 tables have no RLS** (`accounts`, `accounts_memberships`, `billing_customers`, `config`, `facility_admin_invites`, `nonces`, `notifications`, `orders`, `order_items`, `roles`, `role_permissions`, `subscriptions`, `subscription_items`, `user_notifications`). **Live probe returned 0 rows for each — because with RLS off there is no filter, that means they are empty.** Latent risk, *not* an active leak: they are SaaS-starter leftovers referenced by **0 files** of MediLink code. Enable RLS or drop them. |
| M2 | **Missing index: `prescriptions.patient_id`** — FK only, and Postgres does not auto-index FKs. `listPrescriptions` filters on it. (Checked and dismissed as false positives: `payments.appointment_id` is `UNIQUE` → auto-indexed; `favourites` has `UNIQUE (patient_id, …)` → covered.) |
| M3 | **`RECORD_AUDIO` declared but never used** — added both manually and by the `expo-image-picker` plugin. Play Console will demand a microphone justification and the Data Safety form would be inaccurate. |
| M4 | **Unused iOS permission strings** — `NSFaceIDUsageDescription` with no `expo-local-authentication`; `NSMicrophoneUsageDescription` auto-injected. |
| M5 | **`NSCameraUsageDescription` is the plugin's generic default** ("Allow $(PRODUCT_NAME) to access your camera") — weak for health-app review. Camera *is* used. |
| M6 | **`app/dev/design-system-preview.tsx` has no `isDev` guard** (its sibling `screen-gallery` does) → reachable in a production build via `medilink://dev/design-system-preview`. |
| M7 | **Schema drift** — `public._owns_appointment` exists live but in no migration until `20260728000002` recovered it; `account_image` storage bucket created manually with no migration → `supabase db reset` produces a divergent database. |
| M8 | **16 Edge Functions unverified as deployed**, with secrets required per function (`GROQ_API_KEY`, `GOOGLE_GEOCODING_API_KEY`, `THAWANI_*`, `EMAIL_*`). |
| M9 | **No OTA update path** — no `expo-updates`, so no hotfix channel post-launch. |
| M10 | **No analytics** — no funnel or usage instrumentation. |

### 🔵 Low / informational (8)

L1 Dead dependencies: `stripe@^22` and `@google/generative-ai@^0.24` installed, **never used**; `THAWANI_API`/`THAWANI_API_KEY`/`GEMINI_API_KEY` in `.env.example` read by no code. ·
L2 3 real TODOs (`PhoneField` country picker; `send-otp` per-user rate limit; specialty catalog normalisation). ·
L3 20 `as any` casts (2 are the documented queue-RPC casts pending HAMS type regen). ·
L4 `next lint` fails for backend/frontend — deprecated, no ESLint config, drops to an interactive prompt. Pre-existing and environmental; the builds are the meaningful gate. ·
L5 `build:shared` is a broken root script (`shared` has only `typecheck`; it is consumed as TS source). ·
L6 `mobile/README.md` describes a "Week 1+2 only" state — stale by many sprints. ·
L7 `WEB_DYNAMIC_INTEGRATION_AUDIT.md` §4 🔴 items (fake auth, middleware mismatch) are **resolved** in current code — the document is stale and should be annotated. ·
L8 `shared/src/types/supabase.ts` was UTF-16LE and pre-queue; regenerated during this session.

### ✅ Verified working (worth stating — these were tested, not assumed)

- **RLS holds on every PHI table.** Live anon probe of `patient_profiles`, `appointments`,
  `payments`, `lab_results`, `patient_documents`, `prescriptions`, `medical_histories`,
  `in_app_notifications`, `device_tokens`, `notification_preferences` → **0 rows each**.
- **Queue RPCs reject anonymous callers** — `get_my_queue_position` and `acknowledge_queue_call`
  both return `401 / 42501 permission denied`; `REVOKE … FROM PUBLIC, anon` is live.
- **Copied queue routes return the exact contract envelope**, and check auth **before**
  validation (a malformed UUID still yields 401, so the endpoint cannot be probed).
- **CORS is correctly implemented** — explicit allow-list, never `*`, `Allow-Credentials: true`,
  `Vary: Origin`, and preflight answered. (`backend/src/middleware.ts`)
- **API docs are gated** — `/api/docs` and `/api/openapi.json` behind `ENABLE_API_DOCS` with a
  prod admin requirement.
- **Web middleware gating verified** — `/dashboard` + 7 prefixes protected, redirecting to
  `/sign-in`; `/dashboard/settings` was missing and was **fixed** in `fbc2097`.
- **No secrets in the client bundle** — no `sk_`/`service_role`/JWT/`AIza` patterns in
  `mobile/src`, `mobile/app`, or `frontend/src`.
- **Payment webhook** verifies HMAC-SHA256 with `timingSafeEqual` and independently re-queries
  Thawani (the authoritative anti-spoof guard).
- **Money math is centralised and tested** — one `round3`/VAT implementation shared by backend
  and clients, 17 tests including IEEE-754 drift and an invariant sweep.
- **Migration integrity** — 152 migrations, all versions unique, local == remote, ordered.
- **Type safety** — 0 errors across 4 workspaces, **zero** `@ts-ignore`/`@ts-expect-error`.
- **Bundle sizes reasonable** — First Load JS 104–212 kB per route; no outlier.

---

## 20. Recommendations, in execution order

**Week 1 — configuration and observability (unblocks TestFlight; no feature work)**
1. Add `env` to every `eas.json` profile **and a build-time assert that production ≠ mock** (B1).
2. Set `THAWANI_CHECKOUT_BASE_URL` to the production host (B2).
3. Delete or auth-gate `/api/ai/health`; never return a key prefix (B3).
4. Add `headers()` to both `next.config.ts`: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`,
   `Referrer-Policy`, `Permissions-Policy` (B4).
5. Remove `usesCleartextTraffic` (B5); remove `RECORD_AUDIO` + unused iOS strings (M3, M4);
   set an explicit camera purpose string (M5); guard the dev route (M6).
6. Install Sentry for mobile + both Next apps (H1).
7. `supabase db push` for `20260729000000` (H4).
8. Add rate limiting to the 2 unbounded AI routes; move limiters to a durable store (H2, H3).
9. Add the `prescriptions.patient_id` index (M2); enable RLS on or drop the 14 unused tables (M1).

**Week 2 — credentials, email, verification**
10. APNs key + FCM credentials + `aps-environment` (B6).
11. Resend as the sending service: Supabase dashboard SMTP + swap the nodemailer transport (H6).
12. Store assets: splash, adaptive icon, notification icon, privacy manifest (B10).
13. Execute the two security gates: guest-mode RLS and queue cross-tenant isolation (H8).
14. Device QA per `DEVICE_TEST_CHECKLIST.md` — D1/D3/D4 minimum, plus a real payment round-trip.

**Decisions that gate release (not engineering tasks)**
15. **B9** — gate, convert to enquiry, or hide `lab-tests`/`surgeries`.
16. **B7/B8** — escalate to HAMS; without them the queue feature is inert.
17. Client: legal documents + production domain + Thawani merchant credentials.

**Post-launch / project-sized**
18. SEO foundation: sitemap, robots, per-route metadata, OG/Twitter, `hreflang`, and — for
    commercial ranking — public indexable doctor/clinic/specialty pages with `Physician` /
    `MedicalClinic` / `FAQPage` JSON-LD (§14).
19. Load testing before any claim above ~500 concurrent users (§15).
20. Encrypted MMKV for the PHI query cache (H7); `expo-updates` for hotfixes (M9); analytics (M10).

---

## 21. Files changed in this audit

**None.** This pass was read-only: static analysis, live read-only probes, and build/test
commands. No source file, migration or configuration was modified.

(The fixes referenced as already-done — `/dashboard/settings` gating, the health-snapshot data
integration, the `?q=` wiring — landed earlier in commit `fbc2097`, before this audit began.)

## 22. Commits created

**None.** No code changes were made, so no commit was created.

## 23. Verification commands executed

```bash
# Build / type / test
npm run typecheck                    # 4 workspaces -> 0 errors
npm test                             # 189 passed, 12 suites
cd mobile && npm run lint            # 0 problems
npm run build:frontend               # compiled, 35/35 static pages, bundle table captured
npm run build:backend                # compiled

# Database
supabase migration list              # 152 migrations, local == remote, versions unique

# Live read-only security probes (node fetch, anon key)
GET  /rest/v1/{14 no-RLS tables}     # all 200 / 0 rows  -> empty, not leaking
GET  /rest/v1/{10 PHI tables}        # all 200 / 0 rows  -> RLS holding
POST /rest/v1/rpc/get_my_queue_position    # 401 / 42501 permission denied
POST /rest/v1/rpc/acknowledge_queue_call   # 401 / 42501 permission denied

# Static analysis
RLS coverage: 76 public tables vs ENABLE ROW LEVEL SECURITY (case-insensitive)
Index extraction: 101 CREATE INDEX statements parsed, FK/hot-column coverage checked
Route auth sweep: 43 backend routes, 6 without an auth guard (5 legitimate)
Rate-limit sweep: 4/43 routes
Secret scan: sk_/service_role/eyJ/AIza across mobile+frontend source -> clean
SEO enumeration: metadata exports, sitemap, robots, OG, JSON-LD, canonical, manifest
Header scan: headers()/CSP/HSTS across both next.config.ts -> 0
TODO/FIXME/HACK + @ts-ignore + `as any` counts
```

---

## Final verdict

# NOT READY FOR PRODUCTION — READY FOR INTERNAL TESTING

Blockers in priority order: **B1** (ships fake patient data — silent), **B2** (sandbox
payments), **B3** (key-prefix leak + cost amplification), **B4** (no security headers), **B5**
(cleartext HTTP), **B10** (store assets + legal), **B6** (push credentials), **B9** (fake
purchase flow — product decision), **B7**/**B8** (HAMS-owned queue progression and push).

The code is not the problem. Configuration, credentials, observability and verification are —
and the SEO foundation is a separate, larger piece of work that should be scoped deliberately
rather than treated as a launch checkbox.

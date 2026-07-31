# MediLink — Production Execution Roadmap

**Date:** 2026-07-29 · **Baseline:** `development` @ `fbc2097`
**Input:** `FULL_PRODUCTION_READINESS_AUDIT.md` (findings referenced by ID — **not** repeated here)

**Team basis (from git, last 30 days):** Satyam 155 commits, Vikas 5, Ayush 1 → plan is sized for
**one full-time engineer with occasional part-time support**, no CI, deploying to Vercel.

---

## 1. Executive summary

Roughly **50 hours of code work** stands between today and a build that is safe to put in
testers' hands. None of it is feature development, and — critically — **none of the top four
blockers need a single external credential**. They are config, headers, one endpoint deletion,
and a database push.

The plan is therefore built around one principle: **do everything credential-free first, and
build the credential-dependent integrations as plug-and-play shells while waiting.** When APNs
keys or SMTP credentials finally arrive, integration should be a paste-and-deploy, not a project.

Wall-clock to production is dominated by things engineering does not control: legal documents,
Thawani merchant onboarding, a domain, iOS hardware, and two HAMS deliverables. Realistic
estimate: **~7 working days of engineering** to reach internal-testing-hardened, then
**4–7 weeks wall-clock** to production, most of it waiting.

Two items are explicitly not engineering decisions and need answers this week: the fake-purchase
flow on lab-tests/surgeries (**B9**), and who owns the Apple/Play listings.

---

## 2. Overall strategy

Five sequencing rules, in priority order:

1. **Credential-free before credential-blocked.** ~85% of remaining hardening needs nothing from
   anyone. Do it now; the waiting is free.
2. **Batch by context, not by priority.** All `app.json`/`eas.json` work in one sitting; all
   backend routes in another; all SQL in another. Switching between mobile/backend/web/SQL is the
   biggest hidden cost for a solo engineer.
3. **Silent failures first.** A blocker that fails loudly gets caught in QA. B1 (ships fake
   patient data), B2 (sandbox payments) and H4 (skipped migration) all fail *silently* — they
   outrank noisier issues.
4. **Build the shell before the key arrives.** Sentry, APNs, FCM and Resend all get wired with
   placeholder config and a documented one-line swap.
5. **Automate the gate once, then stop.** One CI pipeline (typecheck + lint + test + build) pays
   for itself immediately for a solo engineer with no safety net.

**Explicitly out of scope until after launch:** SEO, analytics, public doctor pages, speculative
performance tuning, MapLibre, scalability work beyond measured bottlenecks. Reasons in §Phase 7.

---

## 3. Engineering roadmap

### PHASE 1 — Production hardening (code only, zero external dependencies)

Six batches, ordered for minimum context switching. Every task here is independently shippable.

---

#### BATCH A — Mobile config & build guards (~9h, one sitting)

*All work in `mobile/app.json`, `eas.json`, `mobile/src/config/env.ts`, `mobile/app/dev/*`.*

**A1 — `eas.json` env per profile + build-time production assert** · **3h** · 🔴 **B1**
- **Why:** the highest-severity defect in the project. Unset `EXPO_PUBLIC_DATA_MODE` → `mock` →
  a store build presents seeded fake patient data; unset `APP_ENV` → dev screen gallery enabled.
- **Risk ignored:** shipping fabricated patient records to real users. Silent — no warning, no crash.
- **Files:** `eas.json`, `mobile/src/config/env.ts`
- **Deps:** none
- **Acceptance:** `production`/`preview` profiles declare `EXPO_PUBLIC_DATA_MODE`,
  `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `env.ts` **throws at module load** if
  `APP_ENV === "production"` and `DATA_MODE !== "production"`.
- **Verify:** `EXPO_PUBLIC_APP_ENV=production EXPO_PUBLIC_DATA_MODE=mock npx expo export` must
  **fail**. Same with `DATA_MODE=production` must succeed.
- **Independent:** yes

**A2 — Remove `usesCleartextTraffic`** · **15m** · 🔴 **B5**
- **Why:** permits plaintext HTTP on Android for PHI in transit.
- **Risk:** trivially interceptable traffic; an auditor's first finding.
- **Files:** `mobile/app.json:26`
- **Acceptance:** key absent. **Verify:** local dev must use an HTTPS or LAN-IP API URL afterwards
  — confirm the dev flow still works before merging.
- **Independent:** yes (coordinate with whoever runs a local HTTP backend)

**A3 — Permission hygiene** · **1h** · 🟡 **M3, M4, M5**
- **Why:** `RECORD_AUDIO` is declared and never used (Play will demand a microphone justification
  and the Data Safety form would be false); `NSFaceIDUsageDescription` has no corresponding
  library; the camera purpose string is the plugin's generic default on a health app.
- **Files:** `mobile/app.json` — `permissions[]`, `infoPlist`, `expo-image-picker` plugin config
- **Acceptance:** set `microphonePermission: false` on the plugin **and** remove `RECORD_AUDIO`
  from `permissions[]`; drop `NSFaceIDUsageDescription`; set an explicit
  `cameraPermission` string ("MediLink uses your camera to capture medical documents.").
- **Verify:** `npx expo prebuild --clean` then grep the generated `AndroidManifest.xml` for
  `RECORD_AUDIO` (must be absent) and `Info.plist` for the camera string.
- **Independent:** yes

**A4 — Guard the unguarded dev route** · **15m** · 🟡 **M6**
- **Files:** `mobile/app/dev/design-system-preview.tsx`
- **Acceptance:** same `if (!isDev) return <Redirect href="/splash" />` as `screen-gallery.tsx:29`.
- **Verify:** with `APP_ENV=production`, `medilink://dev/design-system-preview` redirects.
- **Independent:** yes

**A5 — Release assets + version** · **3h** · 🔴 **B10 (partial)**
- **Why:** no splash, no Android adaptive icon, no notification icon, no privacy manifest →
  submission is rejected and Android shows a white square for notifications.
- **Files:** `mobile/app.json`, `mobile/assets/images/*`; add `expo-splash-screen`
- **Deps:** brand assets exist under `assets/brand/` — reuse; no designer needed for a first pass
- **Acceptance:** `expo-splash-screen` configured; `android.adaptiveIcon` (fg+bg);
  `expo-notifications` `icon` set; `ios.infoPlist` privacy manifest entry;
  `version` bumped off `0.1.0`.
- **Verify:** `expo prebuild` produces the icon/splash resources; inspect generated dirs.
- **Independent:** yes

**A6 — Central env validation module** · **2h**
- **Why:** A1 covers mobile. Backend/frontend have no equivalent — a missing `GROQ_API_KEY` or
  `SUPABASE_SERVICE_ROLE_KEY` currently fails at first request, not at boot.
- **Files:** new `backend/src/lib/env.ts`, `frontend/src/lib/env.ts` (one exists — extend)
- **Acceptance:** required vars validated at module load with a named error listing what's missing;
  a documented allow-list of optional vars.
- **Verify:** unset a required var → build/boot fails with a clear message, not a 500 later.
- **Independent:** yes

---

#### BATCH B — Backend security (~10.5h, one sitting)

*All work in `backend/`.*

**B1 — Delete or auth-gate `/api/ai/health`** · **30m** · 🔴 **B3**
- **Why:** unauthenticated, returns 7 chars of `GROQ_API_KEY` + `NODE_ENV`, and makes a **paid
  Groq completion per request**.
- **Risk:** partial secret disclosure plus unauthenticated cost amplification — a trivial DoS on
  your AI bill.
- **Files:** `backend/src/app/api/ai/health/route.ts`
- **Acceptance:** **preferred — delete it.** If kept: `getAal2UserOrThrow` + super-admin check,
  never return `keyPrefix`, and remove the live model call (report key *presence* only).
- **Verify:** `curl -i .../api/ai/health` → 401/404. Confirm no `keyPrefix` in any response.
- **Independent:** yes

**B2 — HTTP security headers (both Next apps)** · **3h** · 🔴 **B4**
- **Why:** zero headers today — no CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`.
- **Risk:** clickjacking of the patient dashboard, MIME sniffing, no transport pinning for PHI.
- **Files:** `frontend/next.config.ts`, `backend/next.config.ts`
- **Deps:** CSP must allow-list Supabase (`*.supabase.co`), Thawani checkout, `unpkg.com`
  (Leaflet, if the web map uses it) — **budget most of the 3h for getting CSP right without
  breaking the app.** Ship `Content-Security-Policy-Report-Only` first.
- **Acceptance:** all six headers present; CSP starts in report-only, promoted to enforcing after
  one clean QA pass.
- **Verify:** `curl -sI https://<host> | grep -iE "content-security|strict-transport|x-frame|x-content-type|referrer|permissions"`;
  browser console shows zero CSP violations on every route.
- **Independent:** yes

**B3 — Rate-limit the two unbounded AI routes** · **2h** · 🟠 **H2**
- **Why:** `ai/scan-prescription` and `ai/schedule-assist` are authenticated but unlimited —
  vision/LLM calls with real per-call cost.
- **Files:** `backend/src/app/api/ai/{scan-prescription,schedule-assist}/route.ts`
- **Deps:** reuse the existing `ai_request_logs` pattern from `symptom-check` — **do not invent a
  second mechanism.** Add a file-size cap on `scan-prescription`.
- **Acceptance:** per-user hourly cap enforced; 429 with a friendly message; size cap rejects
  oversized uploads with 413.
- **Verify:** loop the endpoint past the cap → 429. Post an oversized file → 413.
- **Independent:** yes

**B4 — Durable rate limiter** · **4h** · 🟠 **H3**
- **Why:** current 2FA/OTP limiters are in-memory `Map`s → per-instance, so trivially bypassed on
  serverless by hitting a different lambda.
- **Files:** `backend/src/lib/auth/*` limiters; new migration for a counter table (or reuse
  `ai_request_logs`' shape)
- **Deps:** do **after** B3 so both use one mechanism.
- **Acceptance:** limits enforced across instances; counters expire.
- **Verify:** concurrent requests from separate cold starts share one budget.
- **Independent:** yes (contains a migration — sequence with Batch C)

**B5 — `send-otp` per-user rate limit** · **1h** · 🔵 **L2**
- Existing in-code TODO (`send-otp/route.ts:6`). Prevents OTP-bombing a known address.
- **Verify:** 4th OTP request inside the window → 429.

---

#### BATCH C — Database & Supabase (~6h, one sitting)

*All SQL / Supabase CLI. **Requires `db push` authorization** — the only Phase 1 item needing sign-off.*

**C1 — Apply the pending migration** · **30m** · 🟠 **H4**
- **Why:** `20260729000000_notification_bilingual_content.sql` is committed but unapplied. Until
  it runs, `title_ar`/`body_ar` don't exist while `shared/src/api/notifications.ts:8` selects them
  → `42703 undefined_column` **breaks the notifications list on web and mobile**.
- **Acceptance:** `supabase db push`; `supabase migration list` shows it remote.
- **Verify:** load notifications on web and mobile — no 42703. Regenerate types afterwards.
- **Independent:** needs approval to touch the shared production DB

**C2 — RLS on the 14 unguarded tables** · **2h** · 🟡 **M1**
- **Why:** they are SaaS-starter leftovers referenced by **0 files**, currently empty (hence the
  audit's 0-row probe). Harmless today; world-readable the moment anything writes to them.
- **Acceptance:** **prefer dropping them** if product confirms they're unused; otherwise
  `ENABLE ROW LEVEL SECURITY` with no permissive policy (deny-by-default).
- **Verify:** re-run the audit's anon probe — expect `401/403`, not `200 []`.
- **Independent:** needs a product confirmation that they're dead

**C3 — `prescriptions.patient_id` index** · **30m** · 🟡 **M2**
- Postgres does not auto-index FKs; `listPrescriptions` filters on it.
- **Verify:** `EXPLAIN` shows an index scan, not a seq scan.

**C4 — Close the two schema-drift objects** · **1h** · 🟡 **M7**
- `account_image` bucket + its storage policy exist live but in no migration → `supabase db reset`
  produces a divergent database.
- **Acceptance:** an additive, `IF NOT EXISTS`-guarded migration that reproduces both.
- **Verify:** a fresh `supabase db reset` on a local/shadow DB yields a working profile-photo upload.

**C5 — Edge Function deployment audit** · **2h** · 🟡 **M8**
- 16 functions in-repo, deployment state unverified, each with its own secret requirements.
- **Acceptance:** a matrix of function → deployed? → secrets set? committed to
  `docs/RUNBOOK.md`; deploy any missing.
- **Verify:** `supabase functions list`; invoke each idempotent one once.

---

#### BATCH D — Observability scaffolding (~6h)

**D1 — Sentry, three surfaces, placeholder DSN** · **4h** · 🟠 **H1** → *see Phase 2*
**D2 — Route the existing ErrorBoundary + `console.error` sites into the reporter** · **2h**
- **Files:** `mobile/src/components/ErrorBoundary.tsx`, the 5 known unguarded `console.error` sites
- **Acceptance:** a thrown render error produces a reporter event (visible locally in debug mode).

---

#### BATCH E — Cleanup (~2h, good filler work)

**E1 — Remove dead dependencies** · **1h** · 🔵 **L1**
- `stripe@^22`, `@google/generative-ai@^0.24` installed and never used; `THAWANI_API`,
  `THAWANI_API_KEY`, `GEMINI_API_KEY` in `.env.example` read by no code.
- **Why it matters beyond tidiness:** someone will waste a week sourcing Stripe or Gemini
  credentials that nothing consumes.
- **Verify:** `npm run build:backend` still compiles; bundle size unchanged or smaller.

**E2 — Annotate stale documentation** · **1h** · 🔵 **L4–L7**
- `mobile/README.md` ("Week 1+2 only"), `WEB_DYNAMIC_INTEGRATION_AUDIT.md` §4 (its 🔴 items are
  resolved), the broken `build:shared` root script.
- **Why:** a stale doc claiming the dashboard is unprotected will send the next engineer down a
  dead end.

---

#### BATCH F — Automated gates (~10h)

**F1 — CI pipeline** · **4h**
- **Why:** a solo engineer at 155 commits/month has no safety net. This is the highest-leverage
  item in Phase 1 after B1.
- **Acceptance:** GitHub Actions on PR + push to `development`: `npm ci`, `npm run typecheck`,
  `cd mobile && npm run lint`, `npm test`, `npm run build:frontend`, `npm run build:backend`.
- **Note:** gate on **mobile** lint only — `next lint` fails environmentally (**L4**).
- **Verify:** open a PR with a deliberate type error → CI red.

**F2 — Security test harness** · **6h** · 🟠 **H8**
- **Why:** the two most important security properties — guest-mode RLS and queue cross-tenant
  isolation — have **never been executed**. They cannot be asserted from the client bundle.
- **Acceptance:** a runnable script (`scripts/security-check.mjs`) using two seeded staging patient
  accounts that asserts: anon denied on every patient table/RPC; Patient A requesting Patient B's
  appointment returns `{"found":false,"reason":"forbidden"}`; storage buckets reject cross-patient
  reads.
- **Deps:** two seeded **staging** accounts (internal — not a client dependency).
- **Verify:** script exits non-zero on any isolation failure; wire into CI as a nightly job.

---

### PHASE 2 — Infrastructure prepared, credentials pending

Build the shell now; the key becomes a one-line change later. Each item states its swap point.

| # | Integration | Effort now | Swap when credential arrives | Swap effort |
|---|---|---|---|---|
| **P2-1** | **Sentry** — install SDKs for mobile + both Next apps, wrap the root, tag release/env, source-map upload script, DSN read from env, **no-op when DSN unset** | 4h | paste `SENTRY_DSN` + auth token into env | **15m** |
| **P2-2** | **APNs / iOS push** — add the `aps-environment` entitlement to `app.json`, document the `eas credentials` steps, keep the client (already complete) untouched | 1h | upload the `.p8` via `eas credentials` | **30m** |
| **P2-3** | **FCM / Android push** — document the FCM V1 service-account flow; add the notification icon (done in A5) | 1h | upload the service-account JSON to EAS | **30m** |
| **P2-4** | **Resend / SMTP** — refactor the three nodemailer helpers + the `broadcast-announcement` edge function from `service:"gmail"` to explicit `host/port/secure/auth` read from env | 2h | set `EMAIL_*` to Resend + add SPF/DKIM/DMARC + paste SMTP into the Supabase dashboard | **1h** + DNS propagation |
| **P2-5** | **`eas.json` production profile completeness** — `submit.production` (`ascAppId`, track), channels, `autoIncrement` confirmed | 2h | add real App Store / Play identifiers | **30m** |
| **P2-6** | **Thawani production switch** — make the checkout host env-driven with **no sandbox default** (fail loudly instead) | 1h | set `THAWANI_*` to production values | **15m** |
| **P2-7** | **Deep links** — add `associatedDomains` + `intentFilters` scaffolding, and the recovery route that fixes forgot-password (**H5**) | 4h | swap the placeholder domain for the real one; host `apple-app-site-association` | **1h** |

**Phase 2 total: ~15h.** Deliberate design goal: no Phase 3 item should exceed **1 hour** of
engineering once its credential lands.

---

### PHASE 3 — Externally blocked

| Item | What's blocked | Owner | Information required | Integration time after arrival |
|---|---|---|---|---|
| **Apple Developer** | TestFlight, App Store, APNs | **Inzint** (bundle `com.inzint.medilink` + Expo account are ours) — *unless* the listing should be client-owned | Team ID, App Store Connect access, `ascAppId`; APNs `.p8` + Key ID | **30m** (P2-2 done) |
| **Google Play** | Android distribution | **Decision needed** (Vikas) | Console access, $25 paid, service account for EAS submit | **30m** |
| **Google Cloud (Maps)** | Android map + server geocoding (**H9**) | Inzint dev key now; client key at launch | Maps SDK for Android key (restrict by package + SHA-1), Geocoding key | **1h** |
| **Firebase / FCM** | Android push delivery | **Inzint** — free tier | FCM V1 service-account JSON | **30m** (P2-3 done) |
| **Production SMTP** | Signup OTP + password reset at any real volume (**H6**) | Inzint buys; **client supplies DNS** | Resend API key + SPF/DKIM/DMARC on the domain | **1h** + DNS |
| **Thawani production** | Real payments (**B2**) | **CLIENT** — funds settle to their bank | API/secret key, publishable key, webhook secret, merchant account | **15m** (P2-6 done) |
| **Production domain** | API origin, universal links, email DNS, legal hosting; **also fixes forgot-password** | **CLIENT** | Domain + DNS access | **1h** (P2-7 done) |
| **Legal documents** | Store submission — **hard gate** | **CLIENT** | Privacy Policy, Terms, Medical Disclaimer, support email | **1h** to link |
| **HAMS queue progression** | Queue is inert without it (**B7**) | **HAMS team** | `call_next`/`skip`/`recall`/`pause`/`mark_no_show` + a staff surface | **0h** — MediLink already consumes it |
| **HAMS called-push** | The decisive queue moment (**B8**) | **HAMS team** | DB trigger → Edge Function → `device_tokens` | **0h** — dispatcher + deep-link routing already built |
| **iOS hardware** | All iOS validation; iPad review (`supportsTablet: true`) | **Inzint** — procurement | One iPhone + one iPad | n/a |

**Longest lead times: legal documents and Thawani merchant onboarding.** Request both first.

---

### PHASE 4 — Verification (run after every batch)

**Automated — must be green before any merge:**
```bash
npm run typecheck                 # 4 workspaces, 0 errors
cd mobile && npm run lint         # 0 problems
npm test                          # 189+ passing
npm run build:frontend            # 35/35 pages
npm run build:backend
cd mobile && npx expo export --platform android   # after any app.json/dep change
```

**Per-batch additions:**

| Batch | Extra verification |
|---|---|
| **A** | `APP_ENV=production DATA_MODE=mock expo export` **must fail**; `expo prebuild` → manifest/plist grep for removed permissions; dev deep link redirects |
| **B** | `curl -I` header assertions; CSP report-only console clean on every route; 429 on rate-limit overflow; `ai/health` returns 401/404 with no `keyPrefix` |
| **C** | `supabase migration list` all synced + unique; anon probe on the 14 tables now denied; `EXPLAIN` shows index scan; `supabase db reset` on a shadow DB succeeds; `supabase functions list` matches the matrix |
| **D** | deliberate thrown error produces a reporter event |
| **E** | builds still green; `npm ls stripe` → absent |
| **F** | PR with a type error goes red; `security-check.mjs` exits non-zero on a seeded isolation failure |

**Regression rule:** the 189-test suite plus both builds run on **every** batch, not just the one
that touched the relevant workspace. The queue-contract and money tests are the tripwires.

---

### PHASE 5 — Device QA

Full matrix already written: **`DEVICE_TEST_CHECKLIST.md`** (7 devices, pre-conditions, sign-off
table) and **`MANUAL_QA_CHECKLIST.md`** (18 areas, ~200 cases). Do not duplicate them here.

**Entry conditions — do not start Device QA until all are true:**
1. Phase 1 Batches A–C merged
2. A build produced with `DATA_MODE=staging` (verify the signed-in patient is **not** "Aisha Al Harthy")
3. APNs + FCM configured, or push cases explicitly deferred
4. A seeded staging patient with an appointment
5. A HAMS staff account able to call patients — **or** queue called/done cases run in mock mode and re-run later

**Minimum device set to sign off:** iPhone (notched) · **iPad** (mandatory — `supportsTablet: true`
means Apple reviews on iPad) · Android flagship. Android budget device for the performance floor.

**Sequence — one pass per device, ~1 day each:**
1. Pre-flight (data mode, env, dev routes blocked) — **worthless without this**
2. Auth: signup → OTP → sign-in → session persistence → token refresh after 1h background → sign-out
3. Booking → payment round-trip on a **real card** (success / cancel / hard-close / network loss)
4. Queue: check-in → live position → *(staff calls)* → acknowledge → done
5. Records: camera capture, PDF upload, download, cross-patient negative test
6. Notifications: foreground / background / **killed** / cold-start tap routing
7. RTL sweep: every screen in Arabic, instant en↔ar switch
8. Offline: airplane mode, cached reads, **ETA must not tick**, reconnect
9. Crash/perf: cold start, 30-min session memory, list scrolling, rotation (tablet)

**Known limitation to state in the report:** no iOS hardware is currently available. iPad review
is mandatory for Apple, so **procurement is on the critical path to TestFlight.**

---

### PHASE 6 — Release readiness

#### Milestone 1 — Internal QA (achievable ~day 7)
- [ ] Batches A, B, C, E merged; CI green (F1)
- [ ] Staging build with verified non-mock data
- [ ] Smoke pass on Android flagship
- [ ] **Gate:** no 🔴 blocker open except B6 (push), B9 (product), B7/B8 (HAMS)

#### Milestone 2 — TestFlight / Play internal
- [ ] Everything in M1, plus: A5 assets, P2-1 Sentry live, P2-5 submit config
- [ ] APNs + FCM configured; push delivered on a real device
- [ ] Legal document **URLs** live (can be minimal, must be public)
- [ ] iOS hardware available; **iPad** pass complete
- [ ] Security harness (F2) green
- [ ] **Gate:** B1–B6, B10 closed. **B9 decided** (gated / converted / hidden)

#### Milestone 3 — Closed beta
- [ ] Everything in M2, plus: production domain live, universal/app links working
- [ ] Resend SMTP live with SPF/DKIM/DMARC — signup OTP verified at volume
- [ ] Forgot-password **completes** end-to-end (H5)
- [ ] Thawani **production** credentials; one real settled payment reconciled
- [ ] CSP promoted from report-only to enforcing
- [ ] Crash-free rate observed ≥99% over one week in Sentry
- [ ] **Gate:** HAMS queue progression (B7) live, or queue feature-flagged off for beta

#### Milestone 4 — Production
- [ ] Everything in M3, plus: HAMS called-push (B8) delivering
- [ ] Store metadata, screenshots, privacy nutrition labels, Play Data Safety
- [ ] Medical disclaimer positioned for Apple 1.4.1 / Play Health review
- [ ] Rollback plan documented; on-call owner named
- [ ] **Gate:** zero open 🔴; Sentry clean for 7 days; all four device sign-offs

---

### PHASE 7 — Deliberately deferred

| Deferred | Why now is the wrong time |
|---|---|
| **SEO foundation** (sitemap, robots, per-route metadata, OG, JSON-LD) | Scored 18% and genuinely weak — but it wins **zero** launch risk. The high-value pages (doctors, clinics) sit behind auth by design, so real SEO means building *new public pages*: a feature project, not hardening. Doing it now competes with blockers for the only engineer. |
| **Public doctor / clinic / specialty pages** | Same reason, larger. This is the actual SEO unlock and deserves its own scoped project with product input on indexable-vs-private content. |
| **Analytics / funnel instrumentation** | Zero launch risk. Also more valuable *after* launch, when there is real traffic to instrument. Sentry (crash visibility) is the observability that matters pre-launch. |
| **Performance tuning beyond measured bottlenecks** | Nothing has been load-tested, so any tuning now is guesswork. Bundles are 104–212 kB and the queue polls adaptively — no evidence of a problem. **Measure first.** |
| **Scalability work (caching, realtime fan-out, pooling review)** | Architecture is sound to ~500 concurrent. Optimising for 5,000 before having 100 real users is speculative. Revisit when load testing gives numbers. |
| **MapLibre migration** | Current Leaflet/OSM solution is dev/QA-ready. The trigger is choosing a licensed tile provider for production — until then, migrating changes nothing a user sees. |
| **Encrypted MMKV for the PHI cache (H7)** | Genuine hardening, but AsyncStorage is app-private, purged on logout, and 24h-capped. Post-launch. |
| **`expo-updates` / OTA (M9)** | Useful post-launch for hotfixes; adds a release-channel concept to get wrong right now. |
| **SMS / phone OTP** | Not built, not required — email OTP works. Confirm scope with Vikas before spending anything. |
| **Apple Sign In** | Guideline 4.8 is **not** triggered because no social login ships. Adding it creates review surface for no benefit. |

---

## 4. Priority matrix

| | **Low effort** | **High effort** |
|---|---|---|
| **🔴 High impact** | **B1** ai/health delete (30m) · **A2** cleartext (15m) · **C1** migration (30m) · **A4** dev route (15m) · **C3** index (30m) | **A1** env guard (3h) · **B2** headers (3h) · **A5** assets (3h) · **F1** CI (4h) · **D1** Sentry (4h) · **F2** security harness (6h) |
| **🟡 Lower impact** | **A3** permissions (1h) · **B5** OTP limit (1h) · **E1** dead deps (1h) · **E2** docs (1h) | **B4** durable limiter (4h) · **C2** RLS cleanup (2h) · **C5** edge audit (2h) · **P2-7** deep links (4h) |

**Do first (highest impact ÷ effort):** B1 → A2 → A4 → C1 → C3 → A1 → B2.
Those seven close four 🔴 blockers in **under 8 hours**.

---

## 5. Dependency graph

```
CREDENTIAL-FREE (start immediately, no waiting)
├── BATCH A (mobile config) ──────────┐
├── BATCH B (backend security) ───────┤
├── BATCH E (cleanup) ────────────────┼──> BATCH F1 (CI)  [wants a stable tree]
└── BATCH C (database) ───────────────┘         │
        └─ needs: db push approval (internal)   │
                                               ▼
                                    BATCH F2 (security harness)
                                     └─ needs: 2 seeded staging accounts (internal)

PREPARED SHELLS (no credential needed to build)
D1/P2-1 Sentry ──────┐
P2-2 APNs entitlement ┤
P2-3 FCM docs ────────┼──> all become 15m–1h swaps in Phase 3
P2-4 SMTP refactor ───┤
P2-6 Thawani host ────┤
P2-7 deep links ──────┘

EXTERNALLY BLOCKED (cannot start)
Legal docs ─────────────┐
Domain ─────────────────┼──> P2-4 SMTP go-live, P2-7 links go-live, forgot-password fix
Thawani merchant ───────┼──> real payments
APNs .p8 / FCM JSON ────┼──> push delivery ──┐
iOS hardware ───────────┴──> iPad + iOS QA ──┼──> TESTFLIGHT
HAMS queue ops (B7) ─────────────────────────┼──> queue usable
HAMS called-push (B8) ───────────────────────┘
```

**Critical path to production:** legal documents **and** iOS hardware **and** HAMS B7 — all
outside engineering. Everything engineering owns finishes long before these.

---

## 6. Daily execution plan (one engineer, 8 working days)

| Day | Focus | Deliverable |
|---|---|---|
| **1** | **Quick wins + Batch A start.** B1 (delete ai/health), A2, A4, then A1 env guard. | 3 🔴 closed; production build can no longer ship mock data |
| **2** | **Batch A finish.** A3 permissions, A5 assets + version, A6 env validation. | `expo prebuild` clean; store assets exist |
| **3** | **Batch B security.** B2 headers (CSP report-only), B3 AI rate limits. | Headers live; AI cost bounded |
| **4** | **Batch B finish + E.** B4 durable limiter, B5 OTP limit, E1 dead deps, E2 docs. | Limiters serverless-safe; tree tidy |
| **5** | **Batch C database.** *(needs push approval — request on day 1.)* C1, C3, C4, C2, C5. | Notifications unbroken; drift closed; edge matrix documented |
| **6** | **Batch F1 CI + Batch D Sentry.** Pipeline green on a test PR; Sentry with placeholder DSN. | Safety net exists; observability ready to activate |
| **7** | **Batch F2 security harness.** Seed 2 staging accounts; write and run isolation assertions. | The two never-run security gates now automated |
| **8** | **Phase 2 shells + internal smoke.** P2-2, P2-3, P2-5, P2-6, P2-7 scaffolding; staging build; Android smoke pass. | **Milestone 1 reached** |

**Day 1 also, before coding (30 min, unblocks weeks):**
- Request from client: legal documents + domain + Thawani merchant onboarding
- Ask Vikas: Apple/Play listing ownership · iOS hardware procurement · the **B9** decision
- Escalate to HAMS: B7 + B8 with dates
- Request internal: `db push` approval, 2 seeded staging accounts

---

## 7. Verification checklist

*(Consolidated; run top-to-bottom before each milestone.)*

```bash
# Gate 1 — static
npm run typecheck                            # 0 errors, 4 workspaces
cd mobile && npm run lint                    # 0 problems
npm test                                     # 189+ pass, 12+ suites

# Gate 2 — builds
npm run build:frontend                       # 35/35 pages
npm run build:backend
cd mobile && npx expo export --platform android
cd mobile && npx expo export --platform ios

# Gate 3 — production-config guards (must FAIL where noted)
EXPO_PUBLIC_APP_ENV=production EXPO_PUBLIC_DATA_MODE=mock npx expo export   # MUST FAIL
curl -sI $FRONTEND | grep -icE "content-security-policy|strict-transport-security|x-frame-options"  # == 3+
curl -s $BACKEND/api/ai/health -o /dev/null -w "%{http_code}"               # 401 or 404

# Gate 4 — database
supabase migration list                      # all synced, versions unique
node scripts/security-check.mjs              # anon denied; cross-patient forbidden; storage isolated
supabase functions list                      # matches the documented matrix

# Gate 5 — manual (per DEVICE_TEST_CHECKLIST.md)
# pre-flight data mode · payment round-trip · push fg/bg/killed · RTL sweep · offline
```

---

## 8. Release checklist

See **Phase 6** — four gated milestones with explicit exit criteria.

---

## 9. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Legal documents arrive late and block submission** | **High** | **Critical** | Request day 1, alone, before anything else. Accept a minimal compliant first version. |
| R2 | **No iOS hardware → cannot validate or pass iPad review** | **High** | **Critical** | Start procurement day 1. Interim: TestFlight external tester with a device. Do **not** ship iOS unvalidated. |
| R3 | **HAMS doesn't deliver B7/B8** | Medium | **Critical** for queue | Escalate with dates day 1. Contingency: feature-flag the queue off for beta — everything else ships. |
| R4 | **CSP breaks the app in production** | Medium | High | Ship report-only; promote only after a clean QA pass. Never enforce blind. |
| R5 | **Thawani merchant onboarding takes weeks** | Medium | **Critical** | Client-driven; request day 1. UAT covers all code paths meanwhile. |
| R6 | **B9 decision deferred and the fake-purchase flow ships** | Medium | **Critical** — a patient pays for nothing | Force the decision at M2 gate. Default action if undecided: **hide from navigation.** |
| R7 | **Solo-engineer bus factor** | Medium | High | CI (F1) day 6; documentation already strong; keep batches independently shippable. |
| R8 | **`db push` breaks the shared HAMS production DB** | Low | **Critical** | Migrations are additive; rehearse on a shadow DB; coordinate a window with HAMS. |
| R9 | **Removing cleartext breaks local dev** | Medium | Low | Verify the LAN-IP/HTTPS dev flow the same day as A2. |
| R10 | **Env vars set in EAS but wrong at build time** | Medium | **Critical** (re-opens B1) | A1's build-time assert is the guard — that is exactly why it's an assert, not a doc. |

---

## 10. Definition of Done per phase

**Phase 1 (code hardening)** — every batch merged to `development`; CI green; each task's
acceptance criteria demonstrably met; **no 🔴 remaining that engineering can close alone**;
Gates 1–4 pass.

**Phase 2 (prepared infra)** — every credential-dependent integration has a working shell that
no-ops safely without its credential; each has a documented swap procedure of ≤1 hour; a
placeholder-config build still passes Gates 1–2.

**Phase 3 (external)** — each credential received, swapped in per its documented procedure, and
verified live (push delivered, email received, payment settled, links opened).

**Phase 4 (verification)** — all five gates green; security harness passes; zero regressions in
the 189-test suite.

**Phase 5 (device QA)** — sign-off recorded for iPhone + iPad + Android flagship; a real payment
round-trip completed on both platforms; push verified in the killed-app state; Arabic RTL swept
on every screen.

**Phase 6 (release)** — the target milestone's checklist fully ticked with named owners and dates.

---

## 11. Timeline — one engineer

| Phase | Effort | Wall-clock |
|---|---|---|
| Phase 1 (Batches A–F) | ~44h | **6 days** |
| Phase 2 (shells) | ~15h | **2 days** |
| **Engineering subtotal** | **~59h** | **8 working days** |
| Phase 3 integration (post-credentials) | ~6h | 1 day, spread over arrivals |
| Phase 5 device QA | ~32h | 4 days (needs hardware) |
| Phase 6 release prep | ~8h | 1 day |
| **Total engineering** | **~105h** | **~14 working days** |

**Wall-clock to production: 4–7 weeks**, driven by legal (1–3 weeks), Thawani onboarding (1–3
weeks), iOS hardware procurement, and HAMS B7/B8 — **not** by engineering.

## 12. Timeline — current team

Git shows one engineer at 155 commits/30 days plus two occasional contributors, so the honest
model is **1.0 FTE + ~0.2 FTE support**, not a parallel team.

| Track | Owner | Notes |
|---|---|---|
| Batches A–F, Phase 2 | Satyam (1.0 FTE) | Sequential; batches are context-grouped to reduce switching |
| Stakeholder chasing (legal, Thawani, domain, HAMS, hardware) | **Vikas** | The single highest-leverage parallel activity — it shortens wall-clock more than any code |
| Web QA / Arabic RTL sweep | Vartika (part-time) | Genuinely parallelisable; needs no backend context |
| Device QA | Whoever holds hardware | 4 days, gated on procurement |

**Realistic: ~8 working days to Milestone 1, ~2.5 weeks to TestFlight-ready code**, then
external-dependency-bound. Adding a second engineer would compress Phase 1 by perhaps 2 days —
the batches are context-bound, not parallel-friendly, so the gain is modest. **Vikas working the
external dependencies in parallel is worth far more than a second engineer.**

---

## 13. Final recommendation

**Start today with seven tasks that close four 🔴 blockers in under eight hours:**
B1 (delete `ai/health`) → A2 (cleartext) → A4 (dev route) → C1 (migration) → C3 (index) →
A1 (env guard) → B2 (headers).

**Do the 30 minutes of stakeholder requests before writing any code.** Legal documents and iOS
hardware are the critical path, and both start at zero today. Every day they aren't requested is
a day added to launch — that half-hour is the highest-return work in this entire plan.

**Force the B9 decision this week.** A flow where a patient can complete "Pay OMR 4,500" and
receive confirmation for a booking that doesn't exist is the one open item with genuine
liability. It needs a product answer, not an engineering one, and the safe default — hide it from
navigation — costs about an hour.

**Do not touch SEO, analytics or performance tuning yet.** SEO scoring 18% is uncomfortable to
leave, but it buys zero launch risk and competes for the only engineer. It becomes the right
project the week after launch, properly scoped with product input on which pages should be
public.

**Treat CI (F1) and the security harness (F2) as hardening, not overhead.** For a solo engineer
committing this fast, the pipeline is what stops a silent regression reaching a tester — and F2
executes the two security properties that have never once been verified.

The code is in good shape. What remains is discipline: close the silent failures, build the
shells, chase the humans, and verify on real hardware.

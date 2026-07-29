# MediLink — Production Dependency & Third-Party Service Audit

**Date:** 2026-07-28 · **Prepared for:** internal discussion (Vikas) before any client request
**Method:** verified against the repository. No code was modified.

**How to read this document**
- ✅ **VERIFIED** — confirmed by inspecting repository files (path/line cited).
- ⚠️ **UNVERIFIABLE FROM REPO** — lives in a dashboard (Apple, Expo, Supabase, GCP, Thawani). Must be confirmed by whoever holds the account; **not assumed either way**.
- 💡 **RECOMMENDATION** — my opinion, clearly separated from findings.

---

## 0. One-page summary

| Service | Status today | Blocks dev? | Needed from client? | When needed |
|---|---|---|---|---|
| Apple Developer | Company account, bundle ID + EAS set | No | **No** | Now (TestFlight) |
| Google Play Console | Package name set; no account evidence in repo | No | **Decision needed** | Before Android release |
| Google Maps | **Placeholder key** in `app.json` | Android map only | Eventually (or company key) | Dev: temp key. Prod: real key |
| Thawani | **UAT/sandbox by default** | No | **YES — mandatory** | Before release only |
| Twilio / SMS | **Not integrated at all** | No | No (out of scope) | Only if phone-OTP is added |
| Email (auth) | **Supabase built-in sender** | No | Domain + DNS | Before public beta |
| Email (app) | **nodemailer → Gmail** | No | Domain + DNS | Before public beta |
| Firebase / FCM | No SDK; needed as push transport | No | **No** | Before Android push |
| Groq (AI) | Live, key required | **Yes, if absent** | No | Now |
| Supabase | Company/HAMS-owned, reused | No | **No** | — |
| Domains | **None configured** | No | **YES** | Before release |
| Legal documents | **None in repo** | No | **YES** | Before store submission |

**The only two hard client dependencies are Thawani merchant credentials and the production domain + legal documents.** Everything else is ours or can run on temporary developer credentials.

---

## 1. Apple / iOS

### 1.1 Current implementation ✅ VERIFIED

| Item | Value | Source |
|---|---|---|
| Bundle identifier | `com.inzint.medilink` | `mobile/app.json:17` |
| EAS project ID | `0aed5a20-7493-41b9-8f0f-8fcdbcc3b458` | `mobile/app.json:56` |
| Expo account owner | `ayush-inzint` | `mobile/app.json:60` |
| Tablet support | `supportsTablet: true` | `mobile/app.json:16` |
| Encryption declaration | `ITSAppUsesNonExemptEncryption: false` | `mobile/app.json:20` |
| Build profiles | development / preview / production, `autoIncrement`, `appVersionSource: remote` | `eas.json` |
| App version | `0.1.0` — **not release-ready** | `mobile/app.json:6` |

Both the bundle ID and the Expo owner are **Inzint-namespaced**, i.e. our own accounts.

**Apple Sign In — ✅ VERIFIED NOT IMPLEMENTED.** No `expo-apple-authentication` dependency and no `AppleAuthentication` / Apple `signInWithIdToken` usage anywhere in `mobile/`.

**Google Sign-In — ✅ VERIFIED PERMANENTLY DISABLED.** `authService.googleSignIn()` returns `googleNotConfigured` unconditionally (`mobile/src/services/authService.ts:213`), and the button is disabled when client IDs are absent (`app/auth/sign-in.tsx:248`).

**This matters commercially:** App Store Guideline **4.8** only requires "Sign in with Apple" when the app offers a *third-party or social* login. Since no social login ships, **4.8 is not triggered** and Apple Sign In is not required for approval.

**Push notifications — ✅ VERIFIED client-complete, infrastructure missing.**
- Client: permission → token → `device_tokens` upsert, foreground/background/**cold-start** tap routing — all implemented (`mobile/src/services/push.ts`, `src/hooks/usePushNotifications.ts`).
- `projectId` resolves from `app.json extra.eas.projectId` (present).
- **Missing:** `aps-environment` entitlement (no `entitlements` block in `app.json`), and an APNs key.

### 1.2 What we need for production

| Requirement | Who provides | Client action? |
|---|---|---|
| Apple Developer Program membership | **Us (Inzint)** | None |
| App Store Connect app record + `ascAppId` | **Us** | None |
| APNs authentication key (`.p8`) uploaded via `eas credentials` | **Us** | None |
| `aps-environment` entitlement added to `app.json` | **Us (dev task)** | None |
| Distribution certificate + provisioning profile | **Us** (EAS manages) | None |
| App Store metadata, screenshots, privacy nutrition labels | **Us**, content from client | Copy + legal only |

### 1.3 Direct answers to your questions

> **Do we need anything from the client for Apple?**

**No — nothing technical.** Because the bundle ID is `com.inzint.*` and the Expo owner is `ayush-inzint`, the entire iOS pipeline runs on our account. From the client we need only *content*: app description, screenshots copy, support email, and the legal documents (§10).

⚠️ **One commercial caveat, not technical:** if the app is published under **our** Apple account, the App Store listing shows **Inzint** as the seller, and the client cannot take the listing over later without an app transfer. If the client expects to own the listing, they must supply their own Apple Developer account (an Organization account requires a **D-U-N-S number**, which can take 1–2 weeks). **This is a Vikas decision, not a technical one.**

> **If Sign in with Apple is implemented, what additional configuration is required?**

It is **not** implemented today. If it were added, it would need: the "Sign in with Apple" capability enabled on the App ID, a Services ID, a private key (`.p8`) + Key ID + Team ID, the Apple provider enabled in the Supabase Auth dashboard with those values, the `expo-apple-authentication` dependency, and the entitlement in `app.json`. **All from our Apple account — no client involvement.** 💡 Since 4.8 is not triggered, I would not add it unless the client asks.

> **Is everything configured from our Apple Developer account?**

✅ Yes for what exists in the repo (bundle ID, EAS project, build profiles). ⚠️ The APNs key, entitlement, and App Store Connect record are **dashboard-side and unverifiable from the repo** — I cannot confirm whether they exist. Please check with whoever administers the Apple/Expo accounts.

> **What should I confirm with Vikas before asking the client?**

1. Do we publish under **Inzint's** Apple account or the **client's**? (listing ownership, transfer implications)
2. Same question for Google Play.
3. **Bundle ID inconsistency:** iOS is `com.inzint.medilink` but Android is `com.medilink.app` (`app.json:24`). These should normally match, and the mismatch suggests the ownership question was never settled. Changing either after first publish is impossible — decide now.
4. Does Inzint already have the APNs key uploaded to EAS?
5. Who owns the Google Cloud project for Maps — Inzint or the client?
6. Is phone/SMS login in the contracted scope at all? (currently not built)

---

## 2. Google Play Console

### 2.1 Current implementation ✅ VERIFIED

| Item | Value | Source |
|---|---|---|
| Package name | `com.medilink.app` | `mobile/app.json:24` |
| `edgeToEdgeEnabled` | true | `mobile/app.json:25` |
| Declared permissions | `RECORD_AUDIO` | `mobile/app.json:28` |
| `usesCleartextTraffic` | **true** — must be removed for production | `mobile/app.json:26` |
| `submit.production` in `eas.json` | **empty** — no service-account or track config | `eas.json:18-20` |

No Play Console account reference, no `google-services.json`, no service-account JSON in the repo.

### 2.2 Answers

> **Is a Play Console account required?** ✅ **Yes** — mandatory for any Android distribution, including internal testing. One-time **$25** fee.

> **Does the company already provide it?** ⚠️ **Cannot be verified from the repo.** Confirm with Vikas.

> **Or should the client provide it?** Same ownership decision as Apple. 💡 Recommendation: use **Inzint's** Play Console for development and internal/closed testing, and decide production ownership before the first production release — a Play listing **can** be transferred between accounts, so this is less irreversible than the Apple decision, but the package name still cannot change.

⚠️ **Play-specific risk (verified):** `RECORD_AUDIO` is declared but the app **never uses audio** — no audio API appears anywhere in `mobile/src` or `mobile/app`. It is added both manually and automatically by the `expo-image-picker` plugin (`node_modules/expo-image-picker/plugin/build/withImagePicker.js:33`). Play Console will demand a microphone justification for a permission we don't use, and the Data Safety form would be inaccurate. **Fix before submission** (set `microphonePermission: false` on the plugin and remove it from `permissions[]`).

---

## 3. Google Maps

### 3.1 Current implementation ✅ VERIFIED

| Item | Finding | Source |
|---|---|---|
| Library | `react-native-maps@1.20.1` | `mobile/package.json` |
| Provider | **`PROVIDER_DEFAULT`** | `app/(app)/search/map.tsx:4` |
| Usage | `MapView` + `Marker` (display only) | `app/(app)/search/map.tsx:69-85` |
| Directions | Plain `https://www.google.com/maps/search/?api=1&query=…` URL | `app/(app)/search/map.tsx:45` |
| Android key | **`"REPLACE_WITH_ANDROID_GOOGLE_MAPS_API_KEY"`** — literal placeholder | `mobile/app.json:32` |
| Server geocoding | `GOOGLE_GEOCODING_API_KEY` in the `geocode-facility` edge function | `supabase/functions/geocode-facility/index.ts:41` |
| Entry points | Search tab icon + "Me" hub tile | `search.tsx:102`, `me.tsx:79` |
| Pin data source | ⚠️ `doctor.mapClinics` is **still the mock** | `mobile/src/data/index.ts:46` |

### 3.2 Which Google APIs are actually required

Because the code uses `PROVIDER_DEFAULT` (not `PROVIDER_GOOGLE`), the platforms differ:

| Platform / component | API required | Key needed? |
|---|---|---|
| **iOS map display** | Apple MapKit — `PROVIDER_DEFAULT` on iOS is Apple Maps | ❌ **No Google key at all** |
| **Android map display** | **Maps SDK for Android** (Android always uses Google) | ✅ Yes — the placeholder above |
| **Server-side geocoding** (clinic address → coordinates) | **Geocoding API** | ✅ Yes — separate, server-only key |
| "Directions" button | none — it's a URL hand-off to the Maps app | ❌ No |

So exactly **two** Google Cloud APIs: *Maps SDK for Android* and *Geocoding API*. iOS needs neither.

**Billing:** ✅ Google requires a **billing account attached** to the Cloud project for Maps Platform even within the free allowance — an unbilled project returns `REQUEST_DENIED`. So a payment method is required even if we never exceed the free tier.

### 3.3 Answers

> **Whether a temporary developer account can be used** — ✅ **Yes.** Both keys are server/app-side configuration with no user-facing identity. Swapping them later is a one-line change in `app.json` plus a Supabase secret update, then a rebuild.

> **Google Cloud free trial / monthly free usage**

Your premise is correct and worth stating precisely for the client conversation: Google Maps Platform includes a recurring **monthly free usage allowance** (historically **$200/month** of credit, which Google restructured in 2025 into per-API monthly free call volumes — in either form, comfortably more than development and QA consume). New accounts additionally get a **$300 / 90-day** trial credit. A development project realistically costs **$0**.

> **Should we use a temporary company/developer key for testing and switch to the client's production key later?**

💡 **Yes — recommended, and I'd do this regardless.** Reasons:
1. It **unblocks Android map testing today** — it is currently broken.
2. It costs effectively nothing.
3. Restrict the Android key by **package name + SHA-1 certificate fingerprint**, and the Geocoding key by **API + IP**, so a leak is not exploitable.
4. Never ship a key belonging to us in the client's production build — usage would bill to Inzint and could not be revoked without breaking their app.

Switch-over cost at release: change `app.json:32`, run `supabase secrets set GOOGLE_GEOCODING_API_KEY=…`, rebuild. **Under an hour.**

⚠️ Note the map is still fed by mock pin data, so a real key alone will not make the map show real clinics.

---

## 4. Thawani (payments)

### 4.1 Current implementation ✅ VERIFIED

| Env var | Used at | Purpose |
|---|---|---|
| `THAWANI_BASE_URL` | checkout, `poll-refund-status` | API host |
| `THAWANI_SECRET_KEY` | checkout, refund polling | server auth |
| `THAWANI_PUBLISHABLE_KEY` | checkout | hosted-page key |
| `THAWANI_CHECKOUT_BASE_URL` | `payments/checkout/route.ts:109` | hosted checkout host |
| `THAWANI_WEBHOOK_SECRET` | `payments/webhook/route.ts:28` | HMAC verification |
| `THAWANI_WEBHOOK_SIGNATURE_HEADER` | webhook | header name |

**Sandbox status — ✅ VERIFIED:**
```ts
// backend/src/app/api/payments/checkout/route.ts:109
const checkoutBase = process.env.THAWANI_CHECKOUT_BASE_URL ?? "https://uatcheckout.thawani.om";
```
If the variable is unset, **the code silently defaults to Thawani's UAT/sandbox host.** Production requires `https://checkout.thawani.om`.

**Webhook security — ✅ VERIFIED:** HMAC-SHA256 with `timingSafeEqual` is implemented, but **skipped when the secret is unset** (`webhook/route.ts:29` — `if (!secret) return { ok: true, reason: "hmac-not-configured" }`). The authoritative anti-spoof guard is the independent Thawani re-query, so this is defence-in-depth, not the only protection.

⚠️ **Documentation drift:** `.env.example` lists `THAWANI_API` and `THAWANI_API_KEY`, which **no code reads**. Ignore them when requesting credentials, or the client will send values we don't use.

⚠️ **Stripe:** `stripe@^22.0.1` is installed but **never used** (no `new Stripe(...)`, no `STRIPE_SECRET_KEY` read). Dead dependency — do not request Stripe credentials.

### 4.2 What production requires

| Credential | Who | Notes |
|---|---|---|
| Production **API / secret key** | **CLIENT** | from their Thawani merchant dashboard |
| Production **publishable key** | **CLIENT** | |
| **Merchant account** (Thawani onboarding) | **CLIENT** | requires their Omani commercial registration + bank account |
| **Webhook secret** | **CLIENT** (or generated on their dashboard) | enables HMAC |
| **Checkout URL** | *known value* — `https://checkout.thawani.om` | no request needed |
| Webhook endpoint registration | **Us**, on their dashboard | needs the production backend domain first (§10) |

> **Why production credentials are only needed before release**

Because **settlement is the only thing that changes.** The UAT environment exposes an identical API surface, so every code path — session creation, hosted-page redirect, success/cancel interception, webhook signature, idempotent finalisation, refunds — is fully exercisable against sandbox. Production credentials add nothing testable; they only move real money into the client's bank account.

There is also a good reason **not** to request them early: they are live financial credentials. Holding them for weeks before they are needed is an unnecessary security and liability exposure. 💡 Request them at the start of release preparation, not now.

**Mandatory, non-negotiable:** the merchant account **must** be the client's. Funds settle to the account holder's bank; we cannot legally or practically receive their patients' payments.

---

## 5. Twilio / SMS

### 5.1 Current implementation ✅ VERIFIED — Twilio is not used anywhere

| Check | Result |
|---|---|
| `twilio` package | **ABSENT** from every workspace |
| Twilio API calls | **none** |
| Phone/SMS OTP delivery | **not wired** — `backend/src/app/api/auth/send-otp/route.ts:84`: *"OTP delivery (SMS) is not wired yet — no provider is configured"* |
| Supabase SMS auth | **disabled** — `config.toml:259` `enable_signup = false`, `:261` `enable_confirmations = false` |
| OpenAPI note | *"SMS delivery is currently disabled in code"* (`lib/openapi/spec.ts:110`) |
| `sms` in notification prefs | enum value only, default **false** — no provider behind it |

**What authentication actually uses today:** email + password, and **email** OTP via Supabase Auth. The backend `send-otp` route generates and stores a 6-digit code in `otp_records` but has no delivery channel.

### 5.2 Answers

> **Is Twilio currently required?** ❌ **No.**
> **Is phone authentication implemented?** ❌ **No.**
> **Is OTP using Twilio?** ❌ **No** — OTP is email-based via Supabase Auth.
> **Can development continue without Twilio?** ✅ **Yes, entirely.** Nothing is blocked.
> **Why would Twilio be needed?** Only if phone-number login/verification becomes a requirement. In Oman, SMS is a common patient expectation, so it may well be requested — but it is **not built**, and the tracker records it as blocked on provider provisioning (`MOBILE_COMPLETION_TRACKER.md` item 10.1).
> **What production credentials would be required?** Account SID, Auth Token, and a Messaging Service SID or sender ID — **plus** Oman-specific deliverability: alphanumeric sender IDs generally require **pre-registration with the local regulator/operators**, which takes time and is a commercial process the **client** is better placed to drive.

💡 **Recommendation:** treat SMS as **out of current scope**. Raise it with Vikas as a *scope question* ("was phone login ever promised?") rather than requesting Twilio credentials. Supabase Auth also supports Twilio/MessageBird/Vonage natively, so if it is added, the integration is dashboard configuration plus a client screen — not a large build.

---

## 6. Email

### 6.1 Current implementation ✅ VERIFIED — there are **two separate** email paths

**Path A — Supabase Auth built-in sender (all authentication email).**
`[auth.email.smtp]` in `supabase/config.toml:223-231` is **entirely commented out**, so Auth email uses Supabase's own sender. This path carries:
- signup confirmation — a **6-digit OTP**, not a link (`config.toml:212`, `[auth.email.template.confirmation]`)
- password reset (`shared/src/api/auth.ts:107` → `resetPasswordForEmail`)
- email login OTP / magic link (`auth.ts:77` → `signInWithOtp`)

`config.toml:182` sets `email_sent = 2` per hour (local). ⚠️ The **hosted** project's SMTP setting is dashboard-side and **unverifiable from the repo** — but Supabase's built-in sender is explicitly documented as being for development, with a low hourly cap and no deliverability guarantee.

**Path B — backend nodemailer over Gmail (application email).**
```ts
// backend/src/lib/email/sendNotification.ts:9  (same in sendInvite.ts, sendInvoice.ts)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});
```
- `nodemailer@^8.0.4` installed; **`resend` is NOT installed**; `@sendgrid/mail` is NOT installed.
- Env: `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`.
- Live call sites: **one** — invoice email from the payments webhook (`webhook/route.ts:316`). `sendInviteEmail` / `sendNotificationEmail` are currently uncalled from MediLink.
- Also used by the `broadcast-announcement` edge function (same three env vars).

⚠️ **Assessment:** `service: "gmail"` with a user/password is a **development-grade** setup. It requires a Google **App Password**, is capped around **500 recipients/day** (~2,000 on Workspace), sends from a Gmail address (so SPF/DKIM cannot align to a MediLink domain), and risks spam classification for transactional healthcare mail. It is not appropriate for production.

### 6.2 Production options

#### Option 1 — Continue with Supabase's built-in sender

| Pros | Cons / limitations |
|---|---|
| Zero configuration, already working | **Severe rate limits** (a handful per hour) — signup OTPs will silently fail during any launch spike |
| No extra vendor or cost | Supabase documents it as **not for production** |
| No DNS work | Sender is a Supabase domain — not MediLink branding |
| | No deliverability control, no bounce/complaint visibility |
| | Does **not** cover Path B (invoices) at all |

💡 Acceptable for internal testing only. **Not viable for launch** — signup and password reset are the two flows that break, i.e. the ones that lock users out.

#### Option 2 — Resend (as Supabase custom SMTP **and** for backend email)

Why it fits here: Resend is SMTP-compatible, so it drops into **both** paths — the Supabase Auth SMTP block *and* nodemailer — with no application-code rewrite.

- **Pricing (verify at purchase time):** free tier ~3,000 emails/month / 100 per day; the first paid tier is ~**$20/month** for ~50,000 emails. MediLink's volume (OTPs, resets, invoices) sits comfortably in the low tiers.
- **DNS records required on the MediLink domain** (client-controlled — see §10):
  - `SPF` — TXT record authorising Resend
  - `DKIM` — CNAME/TXT signing records from the Resend dashboard
  - `DMARC` — TXT policy record (strongly recommended)
  - optional custom **return-path/MAIL FROM** subdomain
- **SMTP credentials needed:** host `smtp.resend.com`, port `587` (or `465`), username `resend`, password = **Resend API key**, plus a verified sender address such as `no-reply@<domain>`.
- **Where they go:** Supabase Dashboard → Auth → SMTP settings (Path A); `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` in the backend environment (Path B).

⚠️ DNS is the dependency: **the domain must exist and the client must add records** before this can be completed.

#### Option 3 — Keep Nodemailer

Nodemailer is **already the implementation** for Path B, so "use Nodemailer" is not a change of library — it is a change of **transport**.

- **Code changes required:** replace `service: "gmail"` with an explicit `host`/`port`/`secure`/`auth` block in the three files under `backend/src/lib/email/`, plus the same in `supabase/functions/broadcast-announcement/index.ts`. Roughly **1–2 hours**, low risk.
- **Do backend email APIs need modification?** No route signatures change; only the transport construction inside the three helpers.
- **Advantages:** no new dependency; provider-agnostic (works with Resend, SES, SendGrid, or the client's own SMTP); keeps a single code path.
- **Disadvantages:** Nodemailer is only a client — it provides **no deliverability, no analytics, no bounce handling, no suppression list**. You still need a real sending service behind it. And it does **nothing** for Path A: Supabase Auth email cannot be routed through our Nodemailer code — that must be configured as SMTP in the Supabase dashboard.

### 6.3 💡 Recommended production approach

**Resend as the sending service, reached two ways** — this is Option 2 and Option 3 combined, and it is the smallest total change:

1. **Path A:** configure Resend SMTP in the **Supabase dashboard** → removes the Auth rate limit and brands signup/reset email as MediLink.
2. **Path B:** keep Nodemailer, swap `service:"gmail"` for Resend SMTP host/port/API-key (the ~1–2 hour edit above).

One vendor, one API key, one set of DNS records, both paths fixed, minimal code churn, and the provider stays swappable because Nodemailer is transport-agnostic.

**Prerequisite for both: the production domain (§10).** Until the domain exists, the interim position is: keep Supabase's built-in sender and the Gmail transport for internal testing only, and do not run any external beta on them.

---

## 7. Firebase

### 7.1 Current implementation ✅ VERIFIED

| Check | Result |
|---|---|
| `firebase` / `@react-native-firebase/*` | **ABSENT** |
| `google-services.json` (Android) | **ABSENT** |
| `GoogleService-Info.plist` (iOS) | **ABSENT** |
| Firebase code references | **none** — the only match is a comment in `mobile/src/services/push.ts:13` mentioning FCM as the eventual transport |
| Push architecture | **Expo Push Service** — `getExpoPushTokenAsync`, tokens in `device_tokens`, dispatched server-side via `exp.host/--/api/v2/push/send` (`backend/src/lib/notifications/sendPush.ts:5`) |

### 7.2 What this means

We are **not building on Firebase**, and no Firebase development work is required. However **FCM is still needed as the delivery transport for Android**: Expo's push service hands Android notifications to FCM on our behalf.

| Requirement | Who | Notes |
|---|---|---|
| Firebase project (Android only) | **Us (Inzint)** | free tier is sufficient |
| **FCM V1 service-account JSON** uploaded to EAS credentials | **Us** | required for Android push on any store/standalone build |
| APNs key (iOS) | **Us** | §1 |
| Android notification icon asset | **Us (dev task)** | ⚠️ none configured — `app.json:44` sets only `color`, so Android may render a white square |

> **Does the client need to provide anything for Firebase?** ❌ **No.** Push is entirely our infrastructure.

---

## 8. AI (Groq)

### 8.1 Current implementation ✅ VERIFIED

| Item | Value |
|---|---|
| SDK | `groq-sdk@^1.1.2` |
| Model | `llama-3.3-70b-versatile`, overridable via `GROQ_MODEL` (`backend/src/lib/ai/groq.ts:18`) |
| Credential | `GROQ_API_KEY` — **required, no fallback** |
| Client init | lazy, so `next build` succeeds without the key (`groq.ts:24`) |
| Features | symptom check (streaming SSE), doctor suggestion, schedule assist, prescription scan |
| Also used by | `generate-health-insights` edge function (needs `GROQ_API_KEY` as a Supabase secret) |
| Mock/stub mode | **none** — a missing key returns a graceful 5xx, **never fabricated clinical content** |
| Rate limiting | ✅ on `symptom-check` and `suggest-doctor` (5/hr via `ai_request_logs`); ⚠️ **absent** on `schedule-assist` and `scan-prescription` |

⚠️ **`@google/generative-ai@^0.24.1` is installed but never used** — no `GEMINI_API_KEY` read, no `GoogleGenerativeAI` instantiation. Dead dependency; do **not** request Gemini credentials.

### 8.2 Production requirements

| Requirement | Who | Notes |
|---|---|---|
| `GROQ_API_KEY` (backend env) | **Us or client** — decision | needed **now**; AI features are dead without it |
| `GROQ_API_KEY` (Supabase secret) | same | for `generate-health-insights` |
| Paid Groq tier | likely **client** | free tier is rate-limited; evaluate against real usage |
| Rate limits on the two unprotected routes | **Us (dev task)** | cost-control gap |

💡 A **developer key is fine for now** and is what should be used. Before launch, decide whether the AI spend sits with Inzint or the client — this is a **recurring operating cost**, so it belongs in the commercial conversation, not just the technical one.

⚠️ **Separate risk, flagged for Vikas:** the app ships an AI **symptom checker**. Both Apple (Guideline 1.4.1) and Google apply extra scrutiny to medical apps. This needs a **medical disclaimer** and careful store positioning (§10) — a compliance dependency, not a credential.

---

## 9. Supabase

### 9.1 Current implementation ✅ VERIFIED

| Item | Value | Source |
|---|---|---|
| Local project id | `hams-frontend` | `supabase/config.toml:5` |
| Linked remote project | `zojrwuvxrkmgnlwyuypg` — *Appointment for Healthcare* (ap-south-1, PG 17) | `docs/QUEUE_BACKEND_FOR_MEDILINK.md` |
| Model | **Reused, already-live HAMS project** — "never fork the schema; only additive migrations" | `CLAUDE.md` |
| Migrations | 151 local, all synced to remote (verified this week) | `supabase migration list` |
| Credentials in use | `EXPO_PUBLIC_SUPABASE_URL` + anon key (client); `SUPABASE_SERVICE_ROLE_KEY` (backend + 15 edge functions) | |
| Storage buckets | `patient-docs`, `lab-results`, `facility-profile-photo`, `user-exports` (in migrations) + `account_image` (⚠️ **created manually, in no migration**) | |
| `site_url` | ⚠️ `http://127.0.0.1:3000`; redirect allow-list localhost only | `config.toml:154-156` |

### 9.2 Answer

> **Is anything still required from the client?**

**No — assuming the HAMS Supabase project is Inzint-owned**, which the repository strongly implies (it is our own prior platform, reused per `CLAUDE.md`). On that basis: **no client action for Supabase.**

⚠️ **One thing to confirm with Vikas, not the client:** who holds the Supabase organisation/billing for `zojrwuvxrkmgnlwyuypg`, and whether MediLink production is expected to share the **live HAMS project** or get its own. Sharing means MediLink patients and HAMS data live in one database — already the accepted architecture, but worth a conscious sign-off given this is PHI.

**If the client is ever expected to own the project instead**, we would need: an Organization owner/admin invite, the project URL + anon key + service-role key, ability to run migrations (`db push`), permission to set Edge Function secrets, and Auth dashboard access for SMTP and providers. That would be a **significant migration**, not a configuration change.

**Our own outstanding Supabase tasks (not client-facing):**
- `site_url` + redirect allow-list → production URLs (needed for password-reset deep links)
- Custom SMTP (§6)
- Set `GROQ_API_KEY`, `GOOGLE_GEOCODING_API_KEY`, Thawani secrets as Edge Function secrets
- Confirm all 16 edge functions are deployed
- Add a migration for the manually-created `account_image` bucket, or accept the drift

---

## 10. Domains & legal documents

### 10.1 Current state ✅ VERIFIED — nothing configured

| Need | Status | Consumer |
|---|---|---|
| **Backend API origin** | ❌ none | `EXPO_PUBLIC_API_URL`; `.env.example` shows only LAN/localhost examples |
| **Website / patient web** | ❌ none | `frontend/` is deployable but has no configured host |
| **Deep links** | ⚠️ custom scheme `medilink://` only (`app.json:5`) | push tap-routing works in-process |
| **Universal Links (iOS)** | ❌ no `associatedDomains` | needed for `https://` links to open the app |
| **App Links (Android)** | ❌ no `intentFilters` | same |
| **Legal document hosting** | ❌ none | App Store + Play both **require** a public privacy-policy URL |

⚠️ **Direct consequence, verified:** password-reset completion is broken because it needs a deep link that does not exist. `authService.resetPassword` only succeeds inside a Supabase recovery session (`authService.ts:203`), and the recovery email link has nowhere to land. **The domain is a functional dependency, not just branding.**

### 10.2 What must come from the client

| Item | Why | Blocking |
|---|---|---|
| **Production domain** (e.g. `medilink.om`) + DNS control | API origin, universal links, email SPF/DKIM, legal hosting | **Before release** |
| **Privacy Policy** | **Mandatory** for App Store and Play submission | **Before submission** |
| **Terms & Conditions** | Standard requirement | Before submission |
| **Medical Disclaimer** | AI symptom checker + health data → Apple 1.4.1 / Play Health scrutiny | **Before submission** |
| **Support email** | Required field in both store listings | Before submission |
| Data-retention / PHI-handling policy | Oman health-data compliance; informs the Data Safety form | Before submission |

💡 These are **client-authored legal content**, not something we can draft — they carry the client's liability. Request early: legal review is often the longest lead time in the whole list, frequently exceeding all technical work.

---

# Final Deliverables

## A. Already handled by our team ✅

| Item | Evidence |
|---|---|
| Apple bundle ID + EAS project (Inzint-owned) | `app.json:17,56,60` |
| EAS build profiles, autoIncrement, remote versioning | `eas.json` |
| Push notification **client** (permission, token, `device_tokens`, fg/bg/cold-start routing) | `services/push.ts`, `usePushNotifications.ts` |
| Push **dispatch** server-side (opt-in, batching, dead-token cleanup) | `lib/notifications/sendPush.ts` |
| Supabase project, schema, RLS, 151 migrations (all synced) | `supabase/`, `migration list` |
| Thawani integration **complete** against UAT (checkout, webhook + HMAC, refunds, invoices) | `api/payments/*` |
| Groq AI — 4 features, real provider, no fake clinical data | `lib/ai/groq.ts` |
| Email **code** (nodemailer, transport-agnostic) | `lib/email/*` |
| Maps **code** (MapView, markers, directions hand-off) | `search/map.tsx` |
| Localization EN/AR + runtime RTL | `src/i18n/` |
| Automated test foundation — 155 tests, 10 suites | `TEST_PLAN.md` |

## B. Need confirmation from Vikas (before contacting the client) ⚠️

| # | Question | Why it matters |
|---|---|---|
| B1 | Publish under **Inzint's** or the **client's** Apple account? | Listing ownership; Apple transfers are painful; client Organization account needs a D-U-N-S (1–2 weeks) |
| B2 | Same for **Google Play** ($25, transferable) | Less irreversible, still decide early |
| B3 | **Bundle ID mismatch** — iOS `com.inzint.medilink` vs Android `com.medilink.app` | Unchangeable after first publish; signals the ownership question is unsettled |
| B4 | Is the APNs key already uploaded to EAS? Is there a Play Console account? | Cannot verify from the repo |
| B5 | Who owns the **Google Cloud** project for Maps + Geocoding? | Billing account required even on free tier |
| B6 | Who pays for **Groq**, **Resend**, and Supabase at production scale? | Recurring operating cost — commercial, not technical |
| B7 | Is **phone/SMS login** in contracted scope? | Not built; drives whether Twilio is ever needed |
| B8 | Does MediLink production share the **live HAMS Supabase project**? | PHI co-tenancy deserves explicit sign-off |
| B9 | Who owns the **Supabase org/billing** for `zojrwuvxrkmgnlwyuypg`? | Determines whether §9's "no client action" holds |

## C. Need from the client before production 🔴

Ordered by lead time, longest first.

| # | Item | Why | Lead time |
|---|---|---|---|
| C1 | **Privacy Policy, Terms, Medical Disclaimer** | Store submission is impossible without them; AI symptom checker invites scrutiny | **Longest** — legal review |
| C2 | **Production domain + DNS control** | API origin, universal links, email DNS, legal hosting; **fixes password reset** | Days–weeks |
| C3 | **Thawani production credentials** — API/secret key, publishable key, webhook secret, merchant account | Real money settles to their bank; cannot be ours | Days–weeks (merchant onboarding) |
| C4 | **Support email address** | Required store-listing field | Immediate |
| C5 | Store listing content — description, screenshots copy, keywords | Submission | Days |
| C6 | *(If client-owned)* Apple Developer + Play Console access | Depends on B1/B2 | 1–2 weeks (D-U-N-S) |
| C7 | *(If client-owned)* Google Maps production key | Depends on B5 | Hours |
| C8 | Data-retention / PHI policy | Oman compliance; Data Safety form | Days |

## D. Can use temporary developer credentials for testing ✅

| Item | Note |
|---|---|
| **Google Maps API key** (Android) | Company/dev key, restricted by package + SHA-1. Free tier is ample. **Do this now — Android maps are broken.** |
| **Google Geocoding key** | Server-only Supabase secret; restrict by API + IP |
| **Thawani UAT** | Already in use; identical API surface to production |
| **Groq developer key** | Free/low tier fine for dev |
| **Supabase (existing HAMS project)** | Already live |
| **Email** — Supabase built-in + Gmail transport | **Internal testing ONLY.** Not for any external beta |
| **Apple/Play** — internal + TestFlight/internal track | On Inzint accounts |
| **Firebase project** for FCM | Free tier |

## E. Can be postponed until production ⏸

| Item | Postpone until |
|---|---|
| Thawani production credentials | Release prep (deliberately — avoid holding live financial keys) |
| Resend account + DNS records | Blocked on C2 (domain) |
| Universal Links / App Links | Domain exists |
| Client-owned Maps key | Release |
| Store metadata, screenshots, nutrition labels | Submission prep |
| Twilio / SMS | Only if B7 says in scope |
| Apple Sign In | Only if requested (Guideline 4.8 not triggered) |
| Paid Groq tier | Real-usage data available |

## F. Risks if omitted 🔥

| Omission | Risk | Severity |
|---|---|---|
| Thawani production credentials | App cannot take real payment — **core revenue flow dead** | **Critical** |
| Privacy Policy / legal docs | **Submission rejected**; cannot ship at all | **Critical** |
| Production domain | Broken password reset, no universal links, no branded email, no legal hosting | **Critical** |
| `THAWANI_CHECKOUT_BASE_URL` left unset | Silently ships pointing at **UAT** — patients "pay" into sandbox | **Critical** |
| APNs / FCM credentials | No push at all → the queue "you're being called" moment never reaches a backgrounded patient | **Critical** |
| Production email service | Signup OTP and password reset fail under Supabase's hourly cap — **users locked out at launch** | **Critical** |
| `GROQ_API_KEY` absent in production | All 5 AI features return graceful errors (no fake data, but visibly broken) | High |
| Medical disclaimer | Apple 1.4.1 / Play Health rejection; clinical liability | High |
| Android Maps key | Map non-functional on Android only | Medium |
| `usesCleartextTraffic: true` left in | Plaintext HTTP permitted for PHI | Medium |
| `RECORD_AUDIO` left declared | Play demands a mic justification; inaccurate Data Safety form | Medium |
| Rate limits on 2 AI routes | Unbounded Groq spend | Medium |
| Bundle ID mismatch unresolved | Permanent after first publish | Medium |

## G. Recommended order to request everything 📋

**Step 0 — internal, this week (no client contact).** Resolve **B1–B9** with Vikas. Requesting anything before the ownership questions are settled risks asking for the wrong things or asking twice.

**Step 1 — unblock ourselves immediately (no client needed).**
Create a company Google Cloud project → enable Maps SDK for Android + Geocoding API → issue restricted keys → Android maps start working. Create the Firebase project for FCM. Confirm the APNs key in EAS. Fix the free config defects (cleartext, `RECORD_AUDIO`, unused permission strings, dev-route guard, `eas.json` env, version bump).

**Step 2 — first client request: legal + domain (longest lead time).**
> Privacy Policy · Terms & Conditions · Medical Disclaimer · production domain + DNS access · support email

💡 Send this **first and on its own**. Legal review routinely takes longer than everything else combined, and the domain unblocks email, universal links and password reset.

**Step 3 — once the domain exists.** Set up Resend, add SPF/DKIM/DMARC, configure Supabase SMTP + the backend transport, register the production redirect URLs, add universal/app links.

**Step 4 — release preparation.** Request **Thawani production credentials** + merchant account, register the production webhook, and switch the checkout host. Deliberately last: live financial credentials should be held for the shortest possible time.

**Step 5 — submission.** Store metadata, screenshots, nutrition labels / Data Safety, review notes, demo account.

💡 **Do not send one combined list.** Splitting it as above means the client is never blocked waiting on us, and we are never holding credentials we don't yet need.

---

## Appendix — dead dependencies (do not request credentials for these)

| Package | Status |
|---|---|
| `stripe@^22.0.1` | installed, **never used** — Thawani is the payment provider |
| `@google/generative-ai@^0.24.1` | installed, **never used** — Groq is the only AI provider |
| `THAWANI_API`, `THAWANI_API_KEY` (in `.env.example`) | **read by no code** — documentation drift |
| `GEMINI_API_KEY` (in `.env.example`) | marked unused, correctly |

💡 Worth cleaning up separately: each one is a credential someone could waste time sourcing.

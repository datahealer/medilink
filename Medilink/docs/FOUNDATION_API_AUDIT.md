# MediLink — Foundation API Audit (Sprint 1)

> Scope: Splash/Onboarding, Authentication, Public Landing, and the basic **patient** Dashboard.
> Method: read-only inspection of the existing HAMS-reused backend (`backend/`), shared layer (`shared/`),
> Supabase config, and the web/mobile scaffolds. **No endpoints invented** — everything below maps to code
> that exists today. Citations are `path:symbol`.
> Date: 2026-06-23.

> **Decisions locked (2026-06-23):**
> - **Google sign-in** → use **Supabase native `signInWithOAuth({provider:'google'})`** + `/auth/callback`; enable Google in the Supabase dashboard. Existing Calendar route stays untouched. (§6-A)
> - **OTP screen** → **phone verification after signup** against the existing `send-otp`/`verify-otp` routes; SMS delivery is a documented blocker (mock in dev). (§6-B)
> - **Build status:** audit only — Steps 2 (shared stores) & 3 (screens) deferred pending go-ahead.

---

## 0. TL;DR

- **Auth = Supabase Auth only.** No custom JWT. Web uses `@supabase/ssr` cookie sessions; mobile uses a
  bearer-token client backed by SecureStore. Both hit identical RLS.
- **Login / logout / session / password-reset are NOT custom routes** — they are direct `supabase-js` calls,
  already wrapped in `shared/src/api/auth.ts`. Reusable as-is.
- **Custom backend routes exist only for privileged side-effects**: signup (admin create), phone OTP,
  set-password (invite flows), Google **Calendar** OAuth, and 2FA (staff-only).
- **Patient `profiles` + `patient_profiles` rows are auto-created by a DB trigger** (`hams_handle_new_user`) —
  the frontend does **not** need a "create profile" call after signup.
- **The patient data layer already exists** in `shared/src/api/` (profile, appointments, favourites,
  notifications, family) as typed direct-Supabase modules. Step 2's "shared API client" is ~70% done.
- **Three real gaps block the foundation** (details in §6): (1) "Sign in with Google" as an *auth* provider
  is **not** implemented — the existing Google route is Calendar-only; (2) the OTP flow is **post-login SMS
  phone-verification**, not passwordless login, and **SMS sending is commented out**; (3) state is currently
  React Context, not the Zustand stores the brief asks for.

---

## 1. Auth model

| Question | Finding | Evidence |
| --- | --- | --- |
| Supabase Auth, custom JWT, or both? | **Supabase Auth only.** No custom JWT anywhere. | `backend/src/lib/supabase/*`, `shared/src/api/auth.ts` |
| Web session transport | SSR cookies via `@supabase/ssr` `createServerClient`; refreshed in middleware. | `backend/src/lib/supabase/server.ts`, `frontend/middleware.ts` → `frontend/src/lib/supabase/middleware.ts` |
| Mobile session transport | Bearer token from persisted session (SecureStore). | `mobile/src/lib/secureStore.ts`, `mobile/src/context/AuthContext.tsx` |
| Google OAuth configured? | **As Calendar integration only**, not as a login provider. Manual OAuth code-exchange storing tokens in `user_integrations`, scope = `calendar`. Supabase social login (`signInWithOAuth`) is **not** wired. | `backend/src/app/api/auth/google/route.ts`, `.../google/callback/route.ts` |
| OTP — email or SMS? | **SMS OTP**, 6-digit, stored in `otp_records` (5-min expiry, ≤5 attempts). **Requires an already-authenticated user** (it verifies a phone for an existing patient — it is NOT a passwordless login OTP). **`sendOtpSms` is commented out**, so codes are generated but never delivered. OTP stored in plaintext (TODO to hash). | `backend/src/app/api/auth/send-otp/route.ts`, `.../verify-otp/route.ts`, `.../resend-otp/route.ts` |
| 2FA | TOTP (AAL2), **staff/super-admin only**; patients never hit it. Middleware exempts `/api/auth` and patient role. | `backend/src/app/api/auth/2fa/*`, `backend/src/lib/supabase/middleware.ts` |
| Protected-route handling | `frontend/middleware.ts` runs `updateSession` (refresh + AAL2/role guards for staff). **No patient-route gate exists yet** — patient redirect logic must be added. | `backend/src/lib/supabase/middleware.ts:updateSession` |
| Patient profile after signup | **Automatic** via DB trigger `hams_handle_new_user` → inserts `profiles` + `patient_profiles`. No client call needed. | `supabase/migrations/20260319071603_hams_complete_schema.sql`, `...073405_fix_user_trigger.sql` |

---

## 2. Session & authentication APIs

| Feature | Existing route / function | Method | Request | Response | Auth req. | Reusable? | Missing work |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Current user / session | `shared/src/api/auth.ts → getSession / getUser`; SSR: `lib/auth/getServerSession.ts → getServerUserAndRole` | n/a (SDK) | — | `Session` / `User` / `{user,role,profile}` | yes | ✅ as-is | none |
| Sign up | `POST /api/auth/signup` | POST | `{email,password,full_name?,phone?,role?}` | `{success, data:{user}, message}` | no | ✅ as-is | forces `role=patient` ✔; password rules via `validatePassword` |
| Sign in (email+password) | `shared/src/api/auth.ts → signInWithPassword` | n/a (SDK) | `{email,password}` | `{user, session}` | no | ✅ as-is | none |
| Sign out | `shared/src/api/auth.ts → signOut` (+ contexts) | n/a (SDK) | — | `void` | yes | ✅ as-is | clear local store on call |
| Google login (social) | — | — | — | — | — | ❌ **missing** | Existing Google route is Calendar-only. Add `signInWithOAuth({provider:'google'})` + Supabase dashboard config + `/auth/callback`. See §6-A |
| OTP send | `POST /api/auth/send-otp` (+ `resend-otp`) | POST | `{phone?}` (uses `profile.phone` if set) | `{success:true}` | **yes** | ⚠️ partial | SMS delivery commented out; plaintext code; no rate limit. Post-login phone-verify only. |
| OTP verify | `POST /api/auth/verify-otp` | POST | `{code, phone?}` | `{success:true}` | **yes** | ⚠️ partial | sets `phone_verified`; plaintext compare |
| Password reset request | `shared/src/api/auth.ts → resetPasswordForEmail(email, redirectTo)` | n/a (SDK) | `email`, `redirectTo` | `void` | no | ✅ as-is | needs reset deep-link/redirect URL configured |
| Set new password | `shared/src/api/auth.ts → updatePassword` (recovery session) | n/a (SDK) | `newPassword` | `void` | recovery session | ✅ as-is | none for patient self-serve |
| Set password (invite) | `POST /api/auth/set-password` | POST | `{password, token?, type?}` | `{success:true}` | mixed | ➖ N/A | doctor/technician/staff invite flow — **not patient**, ignore for Sprint 1 |
| Refresh session/token | Auto: middleware `getUser()` (web) + `onAuthStateChange` (both) | n/a (SDK) | — | refreshed cookie/session | — | ✅ as-is | none |
| Auth middleware | `frontend/middleware.ts → updateSession` | — | — | redirect/next | — | ⚠️ partial | adds staff AAL2 guards only; **no patient protected-route redirect** (§6-C) |
| Patient profile creation | DB trigger `hams_handle_new_user` | — | — | rows in `profiles`+`patient_profiles` | — | ✅ automatic | none |
| Session activity log | `POST /api/auth/session-log` | POST | session metadata | `{ok}` | yes | ➖ optional | not required for foundation |

---

## 3. Patient dashboard APIs

All implemented as typed **direct-Supabase (RLS)** functions in `shared/src/api/` — callable from web (SSR/browser client) and mobile (bearer client) identically.

| Feature | Function | Returns | Auth | Reusable? | Notes |
| --- | --- | --- | --- | --- | --- |
| Logged-in patient profile | `profile.getMyProfile(db)` | `{account: profiles, patient: patient_profiles}` | RLS | ✅ | spans both identity tables |
| Update profile | `profile.updateMyProfile(db, patch)` | updated `MyProfile` | RLS | ✅ | partial patch |
| Upcoming appointments | `appointments.listMyAppointments(db, "upcoming")` | appointment rows (+doctor, facility, payments joined) | RLS | ✅ | `tab: upcoming \| past \| all` |
| Favourites / saved doctors | `favourites.listFavourites(db, "doctor"?)` | `favourites[]` | RLS | ✅ | `toggleFavourite`, `isFavourite` also exist |
| Notification unread count | `notifications.unreadCount(db)` | `number` | RLS | ✅ | `in_app_notifications` keyed by `user_id` |
| Notifications list / read | `notifications.listNotifications / markAllRead / markRead` | rows / void | RLS | ✅ | pagination built-in |
| Family members | `family.listFamily(db)` (+add/update/delete) | `family_members[]` | RLS | ✅ | keyed on `patient_profiles.id` |
| Doctor search (landing) | `doctors.search(...)` (`shared/src/api/doctors.ts`) | doctor rows | RLS/public | ⚠️ verify | confirm RLS allows anon read for the public landing search |

> Contracts are declared centrally in `shared/src/api/contracts.ts` (`PatientApi`, `BackendApi`) — use these as the type source of truth.

---

## 4. Existing frontend/mobile scaffold (what NOT to rebuild)

| Concern | Web | Mobile |
| --- | --- | --- |
| Supabase client | `frontend/src/lib/supabase/{client,server,middleware}.ts` | `mobile/src/lib/supabase` + `secureStore.ts` |
| Auth state | `frontend/src/context/AuthContext.tsx` (`useAuth`) | `mobile/src/context/AuthContext.tsx` (`useAuth`) |
| Theme (light/dark, tokens) | `frontend/src/theme/ThemeProvider.tsx` | `mobile/src/theme/ThemeProvider.tsx` |
| i18n (EN/AR + RTL) | `frontend/src/i18n/I18nProvider.tsx` + `shared/src/config/i18n/{en,ar}.ts` | `mobile/src/i18n` |
| Routing | App Router; only placeholder `app/page.tsx` | `mobile/src/navigation/RootNavigator.tsx` (Auth/App split, deep-links `medilink://`) |
| Protected routing | `frontend/middleware.ts` (staff guards only) | navigator switches on `session` |
| Stores (Zustand) | **none yet** | **none yet** |
| Screens | **placeholder only** | **placeholders only** |

---

## 5. Environment variables

From `.env.example`. **PUBLIC** = safe for browser/mobile; **SECRET** = backend only.

**Required for the foundation:**

| Var | Scope | Needed for | Present in env.local? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` | PUBLIC | all auth/data | web+backend ✔ (verify mobile) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | PUBLIC | all auth/data | web+backend ✔ (verify mobile) |
| `SUPABASE_SERVICE_ROLE_KEY` | SECRET | signup (admin create) | backend ✔ |
| `NEXT_PUBLIC_APP_URL` | PUBLIC | redirect/reset links | web+backend ✔ |
| `NEXT_PUBLIC_BACKEND_URL` / `EXPO_PUBLIC_BACKEND_URL` | PUBLIC | web/mobile → backend API | web ✔ (verify mobile) |

**Needed only if enabling the gapped features:**

| Var | Scope | Feature |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | SECRET | Google (currently Calendar; reuse/extend for social login) |
| `EMAIL_USER/PASS/FROM` | SECRET | password-reset emails (Supabase SMTP) / OTP-by-email if chosen |
| (SMS provider creds) | SECRET | **MISSING** — no SMS provider keys in `.env.example`; required to actually send OTP |
| `INVITE_SECRET` | SECRET | set-password invite flow (not patient) |

### Redirect / deep-link URLs to configure (Supabase dashboard → Auth → URL config)

- Web password-reset: `${NEXT_PUBLIC_APP_URL}/reset-password`
- Web OAuth callback (if Google social login added): `${NEXT_PUBLIC_APP_URL}/auth/callback`
- Mobile deep link scheme: `medilink://` (e.g. `medilink://reset-password`, `medilink://auth-callback`) — already declared in `RootNavigator.tsx` linking config.

---

## 6. Backend blockers / changes needed before frontend integration

### A. Google "Sign in with Google" (auth) — MISSING
The existing `/api/auth/google` route requests a **Calendar** scope and stores tokens in `user_integrations`; it is an *integration*, not a login. For social login either:
- **Preferred:** use Supabase native `supabase.auth.signInWithOAuth({ provider: 'google' })` + enable Google in the Supabase dashboard + add `/auth/callback` route. No backend route needed.
- Keep the Calendar route as-is for later booking sync.

### B. OTP flow — clarify intent + enable delivery
Current OTP is **post-login SMS phone-verification** (requires a session). It is **not** a passwordless login or signup-email-verification OTP. Blockers:
1. `sendOtpSms` is commented out → codes never sent. Need an SMS provider + creds (none in `.env.example`).
2. Codes stored/compared in plaintext (TODO to hash); no rate limit.
3. **Decision needed:** does the Sprint-1 "OTP Verification" screen mean (a) verify phone after signup [matches backend], or (b) email-verification / passwordless login [needs new backend]? Defaulting to (a).

### C. Patient protected-route redirect — MISSING
`updateSession` only guards staff (AAL2 / admin). Add: unauthenticated → redirect away from patient routes (e.g. `/dashboard`), and authenticated patient → redirect away from `/login`,`/signup`. Mobile already switches stacks on `session`.

### D. State management — Context vs Zustand
Auth/theme/i18n are React Context today; the brief asks for **Zustand** (`authStore`, `localeStore`). Decision: wrap the existing Supabase session source in Zustand stores (keep contexts as thin providers) rather than rip out working code.

### E. Public landing doctor search — verify anon RLS
Confirm `doctors.search` is readable without a session (for the public landing search), or make the landing search UI-only until a public endpoint is confirmed.

---

## 7. Verified reusable APIs (green light)

- Email/password **signup** (`POST /api/auth/signup`), **login/logout/session** (`shared/src/api/auth.ts`).
- **Password reset + update** (`resetPasswordForEmail`, `updatePassword`).
- **Patient profile, appointments (upcoming), favourites, notifications unread-count, family** — all in `shared/src/api/`.
- **Session refresh + middleware** (web), **theme + i18n (EN/AR/RTL)**, **auth contexts** (web+mobile).
- **Auto patient-profile creation** on signup (DB trigger).

## 8. Missing / blocked (must resolve before or during build)

1. Google **social login** (only Calendar exists). — §6-A
2. OTP **delivery** (SMS commented out, no provider creds) + intent decision. — §6-B
3. Patient **protected-route redirect**. — §6-C
4. **Zustand stores** (`authStore`, `localeStore`) not yet created. — §6-D
5. Public landing **doctor search** anon-read confirmation. — §6-E
6. All **foundation screens** (splash, onboarding, landing, auth, dashboard) — placeholders only.

# MediLink — Manual QA Checklist (fresh builds, commit `62a566f`)

Supersedes `MANUAL_QA_CHECKLIST_0b028bd.md`. Read the differences section first — the previous
Android build was **not** production-representative, so a few results from that round should be
treated as void rather than carried forward.

## Builds under test

| | Android | iOS |
|---|---|---|
| Build ID | `e20d7a89-1f34-472b-8d5b-f2666f6aab98` | `e5c03f01-b560-41b4-ab29-e9c81971e3c7` |
| Profile | `production-apk` | `production` |
| Distribution | internal (APK) | store (IPA) |
| Version | 1.0.0 (versionCode **4**) | 1.0.0 (build **12**) |
| Commit | `62a566f` | `62a566f` |
| Installable on a device? | **Yes** — download and sideload | **No, not yet** — see below |

Both were built from `62a566f`, which is the exact tip of `development`. Build pages live under
`https://expo.dev/accounts/ayush-inzint/projects/medilink/builds/<id>`.

Backend target for both: `https://medilink-backend-five.vercel.app`, Supabase project
`zojrwuvxrkmgnlwyuypg` — i.e. **real production data**. Treat every action as real.

## The iOS build cannot be installed yet — decision needed

`production` is store distribution, so the IPA cannot be sideloaded. No iOS test device is
registered either (`eas device:list` returns none for Apple team `3KY6V54CFS`). Two ways forward,
both needing your input:

1. **Ad-hoc** — run `npx eas device:create`, open the resulting link *on the iPhone* to register
   its UDID, then rebuild with an internal-distribution profile. Installs directly, no Apple
   review, no upload to App Store Connect.
2. **TestFlight** — `npx eas submit --platform ios --profile production` with build 12. Internal
   TestFlight needs no review, but it *does* upload to App Store Connect. **Not done** — this
   needs your explicit approval.

Until one of those happens every iOS row below is **BLOCKED**, not "passed".

## What actually changed since `0b028bd`

The only **app code** that changed for mobile is `shared/src/api/doctors.ts`:

```
Medilink/shared/src/api/doctors.ts   |  48 ++++++-
```

Everything else in the range is backend, web, tests, or build config. So mobile-side testing
should concentrate on **discovery and booking** (section D), plus a regression pass over the flows
that touch the backend routes that changed.

Two of the four fixes in this range **cannot be exercised from the mobile app at all**:

- **CORS (item #2)** is a browser mechanism. A React Native app is not a browser and does not
  enforce it, and mobile authenticates with a bearer token rather than cookies. Nothing to test
  here on device; it is a **web-only** check.
- **Contact form (item #4)** only exists on the web at `/contact`. There is no mobile screen.

### Void results from the previous round

The `0b028bd` Android build used the `preview` profile, which sets `APP_ENV=staging`, and
`src/config/env.ts` derives `isDev = APP_ENV !== "production"`. That build therefore shipped with
an **"Open dev Screen Gallery" button in the dashboard header** and reachable `/dev/*` routes.
Any earlier observation about dashboard header layout, or "dev screens are not accessible", was
measured against the wrong build and should be re-checked here. See
`mobile/docs/BUILD_PROFILES.md`.

## Blocking configuration gaps (verify before you start)

| Variable | Where | Status as of `62a566f` | Effect if unset |
|---|---|---|---|
| `FRONTEND_URL` | backend (Vercel) | ~~**NOT SET — confirmed**~~ → **SET, and working — corrected 2026-08-20** | n/a — see the correction below. Not a blocker. |
| `NEXT_PUBLIC_APP_URL` | backend (Vercel) | UNVERIFIED | Payment receipt email is skipped (logged). Payment itself still succeeds; booking confirmation still sends. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` / `_PHONE` / `_WHATSAPP` | frontend (Vercel) | UNVERIFIED | `/contact` shows "messaging isn't available yet" and the footer omits contact links. Web-only. |

> **CORRECTION — 2026-08-20. The `FRONTEND_URL` entry above was wrong, and the reasoning that
> produced it was wrong. Left in place, struck through, so the error is traceable.**
>
> The original claim was that `FRONTEND_URL` was "verified empty by probing production directly:
> an `OPTIONS` preflight to `/api/payments/verify` carrying
> `Origin: https://medilink-frontend.vercel.app` returned `204` with **no**
> `Access-Control-Allow-Origin` header."
>
> The preflight result was real. The conclusion drawn from it was not, for two reasons:
>
> 1. **`medilink-frontend.vercel.app` is not our frontend.** It serves an unrelated third-party
>    Angular application — `<base href>`, `critters`, `runtime/polyfills/main` bundles and
>    **Razorpay** checkout, with zero Next.js markers and a `<title>Project</title>`. Both bare
>    `medilink-frontend` and `medilink-backend` subdomains were already taken by other Vercel
>    accounts, so this project's deployments got suffixed. The real production frontend is
>    **`https://medilink-frontend-six.vercel.app`** (`<title>MediLink</title>`, `_next` assets,
>    real 404 on an unknown path). So that origin was correctly refused for not being ours, and
>    the origin that mattered was never tested.
>
> 2. **Both variables were already set.** `vercel env ls production` shows `FRONTEND_URL` *and*
>    `NEXT_PUBLIC_FRONTEND_URL` on the backend's Production environment, created well before the
>    probe.
>
> Verified 2026-08-20 against production, from the correct origin:
>
> | Request | Result |
> |---|---|
> | `OPTIONS /api/payments`, `/api/payments/checkout`, `/api/appointments/:id/email`, `/api/doctors` | `204` + `Access-Control-Allow-Origin: https://medilink-frontend-six.vercel.app` + `Allow-Credentials: true` + `Vary: Origin` |
> | `GET /api/payments` (real response, not preflight) | `401` **with** ACAO — the browser receives the response instead of a CORS error |
> | `POST /api/payments/checkout` | `401` with ACAO |
> | `POST /api/appointments/:id/email` | `400` (payload validation) with ACAO |
>
> And it is allow-listing, not echoing — which would have been a vulnerability given
> `Allow-Credentials: true`. Refused: the impostor host, `evil.example.com`, a
> `…-six.vercel.app.evil.com` suffix attack, `http://localhost:3000` and `null`.
>
> **No environment variable was changed**, because none needed changing. Sections E, F and I can
> be run against `https://medilink-frontend-six.vercel.app`. Item I1 below ("currently expected
> to FAIL") no longer applies.
>
> Backend deployment currency, previously listed as UNVERIFIED, is also resolved: the
> `medilink-backend` project's newest Production deployment is `Ready` and postdates the CORS
> work, so sections E and F can be trusted.

Being `NEXT_PUBLIC_*`, `NEXT_PUBLIC_APP_URL` and the support variables need a **redeploy** after
being set, not just a dashboard edit.

## How to record results

Mark each row **PASS**, **FAIL**, **BLOCKED**, or **NOT TESTED**. Add device, OS version, locale,
and a screenshot reference for anything that is not a plain PASS.

Do not mark a row PASS because the code has a unit test. These are device checks; a passing test
suite is not a substitute and is not evidence about this build.

---

## A — Build identity (do this first)

| # | Check | Expected | Result |
|---|---|---|---|
| A1 | Install the APK on a physical Android device | Installs; launches to splash | |
| A2 | Settings → About (or equivalent) shows the version | 1.0.0 | |
| A3 | **No "Screen Gallery" button in the dashboard header** | Absent. Its presence means a non-production build — stop and re-check the profile | |
| A4 | Try to reach `/dev/screen-gallery` by deep link | Redirects to splash | |
| A5 | Device log on launch shows the data mode | `DATA_MODE = production (hybrid)` | |

## B — Auth

| # | Check | Expected | Result |
|---|---|---|---|
| B1 | Sign in with an existing account | Reaches dashboard | |
| B2 | Sign in with a wrong password | Clear error, no crash, no leaked detail | |
| B3 | Kill and relaunch the app | Session persists (SecureStore) | |
| B4 | Sign out | Returns to sign-in; protected routes unreachable | |
| B5 | Login OTP / 2FA if enabled on the account | Code arrives and verifies | |
| B6 | Forgot password | Email sends, **completion is known-blocked** — no deep-link recovery session is wired. Expected to dead-end; not a new regression | |
| B7 | Guest mode: browse without signing in | Discovery works; anything patient-specific prompts sign-in | |
| B8 | Google sign-in | Android: only if `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set, else button hidden. **iOS: intentionally off** until Sign in with Apple ships (Guideline 4.8) | |

## C — Navigation & shell

| # | Check | Expected | Result |
|---|---|---|---|
| C1 | All 5 tabs load | dashboard, search, me, records, profile | |
| C2 | Tab bar is absent on splash/onboarding/auth/OTP/reset | Enforced structurally | |
| C3 | Full-screen pushes have no tab bar | edit-profile, medical-history, family/*, booking/*, payments/* | |
| C4 | Switch language to Arabic, accept the restart prompt | Relaunches into RTL; layout mirrors | |
| C5 | Arabic headings render in Zarid Sans | Bold Arabic renders as regular — known font limitation, not a bug | |
| C6 | Dark mode (system + manual) | Palette is the derived dark theme, no unreadable contrast | |
| C7 | Rotate / large font size | No clipped or overlapping text | |

## D — Discovery & booking (**the focus of this round — item #1**)

This is the fix in `shared/src/api/doctors.ts`. Production has 112 doctors, **21 of them
`is_active = false`**, and 14 of those still have availability rows, so there is real data to test
against. Ask the clinic side for the name of one deactivated doctor before starting; without a
known-inactive doctor D2–D5 cannot be verified.

| # | Check | Expected | Result |
|---|---|---|---|
| D1 | Search doctors, browse the list | Results appear; sorted by rating | |
| D2 | Search for a **known deactivated** doctor by name | **Does not appear** anywhere in results | |
| D3 | Open a deactivated doctor by direct deep link / stale id | Shows the normal "couldn't load" error state — **never** a bookable profile | |
| D4 | Favourite an active doctor, have them deactivated, reopen Favourites | Entry drops out of the list | |
| D5 | Deactivated doctor via "recent doctors" on the dashboard | Not offered; or errors cleanly if opened | |
| D6 | Active doctor detail | Loads, availability shows, fee shows | |
| D7 | Pick a slot for an active doctor | Slot picker lists real availability | |
| D8 | Filters sheet (search/filters) | Opens as a bottom sheet with detents; filters apply | |
| D9 | Facility list / clinic detail | Only `status = 'active'` facilities appear | |
| D10 | Nearby clinics map | Loads tiles; markers plausible; permission prompt handled | |
| D11 | A doctor's reviews still show the doctor's name | Reviews are **deliberately not** filtered by `is_active` — a past review must still name its doctor. Absence here is a bug | |

**Known-open, do not file as new:** the RPC layer is still exposed. `doctors_available_today` and
`get_available_slots` are granted to `anon` and do **not** filter `is_active`, so anyone holding a
doctor id can still be told slots exist for a deactivated doctor. Booking additionally requires
`book_appointment_atomic`, which is authenticated-only. The SQL fix is written and reviewed but
held unapplied in `supabase/planned/`, pending HAMS confirming what `is_active = false` means for
their roster. No UI path reaches it — that is what D2–D5 verify.

## E — Appointments

| # | Check | Expected | Result |
|---|---|---|---|
| E1 | Upcoming list | Cancelled appointments excluded | |
| E2 | Past list | Renders; empty state is honest | |
| E3 | Appointment detail | Reference number, doctor, facility, time all correct | |
| E4 | Reschedule | Slot picker opens; controls mirror correctly in RTL | |
| E5 | Cancel | Status updates; confirmation email arrives | |
| E6 | Queue / live status if the appointment is today | Polls and updates | |

## F — Payments (**item #3 — but see the exclusion**)

**Thawani production verification is explicitly out of scope for this round.** Do not attempt a
real card payment. Every row here is **NOT TESTED** unless you decide otherwise.

The fix in this range is that a *settled* payment can no longer be reported as failed by the email
path: `NEXT_PUBLIC_APP_URL` being unset used to throw and return 500 for a payment that had
actually succeeded, losing both emails. Exercising it needs a real settled payment, so:

| # | Check | Expected | Result |
|---|---|---|---|
| F1 | Payment method screen renders | Real fee from the doctor's `fees`, never a hardcoded price | |
| F2 | Checkout requires auth | Unauthenticated checkout is refused | NOT TESTED |
| F3 | Complete a payment, return to the app | Confirmation screen shows paid; polling does **not** show a failure | NOT TESTED |
| F4 | Receipt email | Arrives **if** `NEXT_PUBLIC_APP_URL` is set; if unset the payment still succeeds and only the receipt is skipped | NOT TESTED |
| F5 | Booking confirmation email | Arrives **even when** the receipt is skipped | NOT TESTED |
| F6 | Invoice opens from the app | Authenticated route, never a public storage URL | NOT TESTED |
| F7 | Patient A cannot verify patient B's payment | 404 | NOT TESTED |

## G — Patient data (PHI — handle carefully)

| # | Check | Expected | Result |
|---|---|---|---|
| G1 | Profile loads own data only | | |
| G2 | Edit profile saves | | |
| G3 | Family members list | Empty is legitimate if the `patient_profiles` row was never created by the trigger | |
| G4 | Add a family member | | |
| G5 | Patient switcher | Switches context; no cross-patient leakage | |
| G6 | Medical history | Same `patient_profiles.id` caveat as G3 | |
| G7 | Records: lab results, prescriptions | Only the signed-in patient's | |
| G8 | Document vault: upload, then re-open | Upload succeeds; document is private to the patient | |
| G9 | Sign out, then try a stored document URL | Not publicly readable — all four buckets are private | |

## H — Notifications & AI

| # | Check | Expected | Result |
|---|---|---|---|
| H1 | Push permission prompt on first launch | | |
| H2 | Notification arrives for a booking/cancellation | | |
| H3 | Tapping a notification deep-links correctly | | |
| H4 | Notification preferences persist | | |
| H5 | AI assistant / symptom checker | Requires a real `GROQ_API_KEY`; a missing key must give a graceful error, **never** fabricated medical content | |
| H6 | AI rate limiting | Rapid repeat requests are throttled, not 500 | |

## I — Web checks (not on device — run in a browser)

Listed here so they are not lost; none of these are testable from the mobile build.

| # | Check | Expected | Result |
|---|---|---|---|
| I1 | Web sign-in from `https://medilink-frontend-six.vercel.app`, then any backend-backed action | **Expected to SUCCEED** — corrected 2026-08-20; the earlier "expected to FAIL" was based on probing a third-party host. CORS is verified working from this origin | |
| I2 | Same action, checking headers in devtools | Response carries `Access-Control-Allow-Origin: https://medilink-frontend-six.vercel.app` and `Vary: Origin`. Already confirmed server-side by curl; this row is the in-browser confirmation | |
| I3 | `/contact` with support vars unset | Shows "Messaging isn't available yet" and **no form** — never a fake "Message sent!" | |
| I4 | `/contact` with `NEXT_PUBLIC_SUPPORT_EMAIL` set (after redeploy) | Form appears; submitting opens the mail client pre-filled; confirmation claims only that the draft was prepared | |
| I5 | Footer contact links | Only configured channels appear; no `hello@medilink.om`, no `+968 9000 0000` anywhere | |
| I6 | Web favourites containing a deactivated doctor | Entry drops out | |
| I7 | Arabic web pages | `lang`/`dir` correct from the server on first paint | |

## Sign-off

| Field | Value |
|---|---|
| Commit | `62a566f` |
| Android build / versionCode | `e20d7a89` / 4 |
| iOS build / build number | `e5c03f01` / 12 (**install path not yet chosen**) |
| Android device + OS | |
| iOS device + OS | |
| Locales exercised | |
| Tester | |
| Date | |
| PASS / FAIL / BLOCKED counts | |

Do not treat this round as a release gate while either of these is true: the iOS build
uninstallable, or Thawani production payment unverified. (`FRONTEND_URL` was previously listed
here; it was never actually unset -- see the 2026-08-20 correction above.)

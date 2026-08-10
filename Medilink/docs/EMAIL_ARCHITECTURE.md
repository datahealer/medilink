# Email — two systems, one rule

MediLink sends email through **two completely separate systems**, and the boundary between
them is the single most important thing on this page. Putting a message on the wrong side
is the failure mode this document exists to prevent.

| | **Authentication email** | **Application email** |
|---|---|---|
| Sender | **Supabase Auth (GoTrue)** | **Nodemailer → Microsoft 365** |
| Configured in | Supabase dashboard | `SMTP_*` env vars |
| Code | none — Supabase owns it end to end | `backend/src/lib/email/*` |
| Examples | signup verification OTP, email confirmation, password reset, login OTP | booking confirmation, cancellation, reschedule, payment receipt, invitations |

**Never move an authentication email into Nodemailer.** Supabase generates the token,
templates the link, enforces the redirect allow-list and applies the rate limit. Sending
those ourselves would mean re-implementing all four, duplicating delivery, and silently
losing the rate limit that protects the project from OTP abuse.

---

## 1. Authentication email — Supabase Auth

Every auth email is triggered by a client-side `supabase.auth.*` call in
`shared/src/api/auth.ts`. Nothing server-side is involved and no SMTP variable is read.

| Flow | Call | Confirmed by |
|---|---|---|
| Signup verification | `signUp()` | `verifyEmailOtp({ type: "signup" })` |
| Resend verification | `resendSignupOtp()` | same |
| Passwordless login code | `signInWithEmailOtp()` | `verifyEmailOtp({ type: "email" })` |
| Password reset | `resetPasswordForEmail()` | `verifyEmailOtp({ type: "recovery" })` → `updatePassword()` |

Both platforms call the same functions: web from `frontend/src/app/(auth)/*`, mobile
through `mobile/src/services/authService.ts`.

> `backend/src/app/api/auth/{send,resend,verify}-otp` are a **phone/SMS** OTP path against
> the `otp_records` table, inherited from HAMS. They send no email and are not part of
> either system described here.

### Dashboard configuration

*Authentication → URL Configuration*

```
Site URL:       https://<PRODUCTION_FRONTEND_URL>

Redirect URLs:  https://<PRODUCTION_FRONTEND_URL>/auth/callback
                https://<PRODUCTION_FRONTEND_URL>/reset-password
                http://localhost:3000/auth/callback
                http://localhost:3000/reset-password
```

- `/auth/callback` receives the PKCE code from Google sign-in **and** from the signup
  confirmation link (`emailRedirectTo` in `frontend/src/app/(auth)/sign-up/page.tsx`).
- `/reset-password` is required by `frontend/src/app/(auth)/forgot-password/page.tsx`.
  Omit it and password reset silently falls back to the Site URL.
- **No `medilink://` entry.** Mobile verifies OTP codes typed into the app rather than
  following a link, and native Google sign-in performs no redirect at all.
- **No `**` wildcard.** `next` is caller-supplied and reaches `redirectTo`; the allow-list
  is a security control, not a convenience.

### Mobile caveat, unchanged by this work

Mobile password reset **sends** but cannot **complete**: finishing it needs a recovery
session, which needs a deep link the app does not handle. Web completes normally. Do not
"fix" mobile by faking success.

---

## 2. Application email — Nodemailer over Microsoft 365

### The transporter

`backend/src/lib/email/transporter.ts` is the **only** place a transport is constructed.
There used to be three (`sendInvite`, `sendInvoice`, `sendNotification` each built its
own with `service: "gmail"`), which meant three connection pools and a provider change
that had to be made in three files.

```
smtp.office365.com : 587, STARTTLS (secure=false, requireTLS=true)
```

`SMTP_SECURE=true` on port 587 is the classic misconfiguration — implicit TLS against a
port expecting a STARTTLS upgrade hangs until timeout rather than failing cleanly. Set it
`true` only together with `SMTP_PORT=465`.

`sendMail()` **never throws**. Every caller is a side effect of an operation that already
committed — the payment is captured, the appointment is cancelled — so a dead SMTP host
must not turn that into an error the user sees.

### Modules

| File | Sends |
|---|---|
| `transporter.ts` | the shared transport, `sendMail`, `verifyTransport` |
| `layout.ts` | HTML shell, `escapeHtml`, `detailRows`, `ctaButton` |
| `sendAppointment.ts` | booking confirmed / cancelled / rescheduled |
| `appointmentEmailForUser.ts` | service-role variant for the payment paths |
| `sendInvoice.ts` | payment receipt + invoice PDF link |
| `sendNotification.ts` | generic notification mirror |
| `sendInvite.ts` | staff invitation, announcement (no MediLink call site) |

All interpolation goes through `escapeHtml`. The previous templates injected values
straight into markup, so a patient name containing `<` corrupted the message and an
operator-authored announcement body was raw HTML into every recipient's inbox.

### Where each email is triggered

| Email | Trigger | Why there |
|---|---|---|
| Payment receipt / invoice | `payments/webhook` and `payments/verify` | server-side, at the moment the payment is confirmed |
| Appointment **confirmed** | same two routes | booking creates the appointment as `pending`; **payment** is what confirms it. Sending at booking time would confirm a hold the TTL sweeper may release minutes later |
| Appointment **cancelled** / **rescheduled** | `POST /api/appointments/:id/email`, called fire-and-forget by the clients | these RPCs run entirely client-side under RLS, so there is no server moment to hook — and SMTP credentials cannot live in a browser or an Expo bundle |

`payments/verify` matters more than it looks: the Thawani webhook cannot reach a local or
LAN backend, so during development and demos `verify` is the *only* path that runs. Both
paths are gated so exactly one sends for a given payment.

### `POST /api/appointments/:id/email`

- Body: `{ "kind": "booked" | "cancelled" | "rescheduled" }`
- Reads the appointment through the **caller's own session**, so the existing RLS policy
  decides visibility. Someone else's appointment id yields a 404 — no service-role client
  is in the path, which would otherwise make this an appointment-detail oracle.
- The recipient is `user.email` from the verified session, **never** caller-supplied.
  Accepting a `to` field would make this an open relay for MediLink-branded mail.
- Returns `200 { sent: boolean }` once authorised; a bounced email must not read as a
  failed cancellation.

### Verifying SMTP

```bash
node scripts/smtp-check.mjs                  # connect + authenticate only
node scripts/smtp-check.mjs you@example.com  # …and send one test message
```

### TLS: "self-signed certificate in certificate chain"

This is a **trust** failure, not an authentication one, and it happens *earlier* in the
handshake — so it **masks the auth state entirely**. Seeing it replace a 535 does not mean
the credentials started working; it means the conversation now stops before AUTH.

Cause: endpoint security software or a corporate proxy terminates outbound TLS and re-signs
it with a private root installed in the OS store. **Node does not read the OS store** — it
carries its own bundled CA list — so the chain ends in an unknown self-signed root.

Observed here: `smtp.office365.com:587` presented a leaf for `outlook.com` issued by
`Norton Web/Mail Shield Root`, self-signed, absent from Node's 120-cert bundle.

Fix, without weakening TLS:

```bash
# backend/.env.local  (local dev only — never in staging/production)
SMTP_CA_FILE=<absolute path to the interception root, as PEM>
```

Export that root from the OS trust store — it is already installed there, which is why a
browser shows no warning. The exact path is product-specific (endpoint-security vendors ship
their own `.pem`; a corporate proxy root usually comes from IT). Use forward slashes on
Windows: dotenv does not unescape backslashes.

Then restart the backend — the transporter is cached per process, so a running server keeps
its old TLS configuration.

`rejectUnauthorized` is **never** set in this codebase; verification stays on. `SMTP_CA_FILE`
only *adds* a root, and the bundled roots are always kept — passing `ca` to Node **replaces**
the trust store, so supplying only the proxy root would break every ordinary Office 365
chain the moment the app ran somewhere without that proxy. That mistake is the usual way this
workaround becomes a production outage.

Alternatives, both requiring the value to exist *before* Node starts: run with
`--use-system-ca` (Node 22.15+), or set `NODE_EXTRA_CA_CERTS` in the launching shell.
`NODE_EXTRA_CA_CERTS` **cannot** live in `.env.local` — Node reads it at process start,
before Next loads dotenv. Relying on the shell is also what made this fail in the first
place: the backend was restarted from a shell that lacked it and email broke with no code
change. `SMTP_CA_FILE` is read when the transporter is built, so it survives restarts.

> ⚠️ Worth knowing: while interception is active, the antivirus is decrypting this SMTP
> session — patient names, appointment details and the SMTP credentials. Acceptable on a dev
> machine; it must never be true of a production host.

### Authentication: Microsoft Entra OAuth2, not a password

Basic SMTP authentication is **refused** by Microsoft whenever Entra **Security Defaults**
are enabled:

```
535 5.7.139 Authentication unsuccessful, user is locked by
your organization's security defaults policy.
```

Security Defaults stay **ON**. The transport authenticates with an Entra **app-only token**
over XOAUTH2 instead — no user password is involved, so the legacy-auth policy does not
apply.

```
POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
grant_type=client_credentials
scope=https://outlook.office365.com/.default
```

The resource must be `outlook.office365.com`. **A Microsoft Graph token is rejected by
SMTP** — different audience, different permission model. `scripts/smtp-check.mjs` asserts the
`aud` claim for exactly this reason.

#### How token expiry is handled

An access token lives ~1 hour; the transporter is a long-lived pooled singleton. Baking a
token in at construction would send mail for an hour and then fail permanently until the
process restarted.

Instead the transporter registers nodemailer's OAuth2 provisioning hook:

```ts
transporter.set("oauth2_provision_cb", (user, renew, callback) => { … })
```

- nodemailer reuses its copy while `expires > Date.now()`, so this is **not** called per
  message — only when the token is actually stale.
- On an auth failure nodemailer passes `renew=true`; we drop our cached token so a genuinely
  new one is fetched rather than replaying a dead one.
- `smtp-pool` reads the callback per connection, so **new connections pick up rotated tokens
  without rebuilding the transporter**.
- `expires` must be **absolute epoch ms** — nodemailer stores it verbatim and compares against
  `Date.now()`. A relative value makes every token look expired.

Our own helper caches with a 5-minute safety margin and de-duplicates concurrent requests, so
a burst of appointment emails makes **one** token call.

#### OAuth2 is always preferred

`resolveAuthMode()` picks OAuth2 whenever the three `MICROSOFT_*` variables are complete —
even if `SMTP_PASS` is still present. A **partial** OAuth config is reported as
not-configured, naming the missing variable, rather than silently downgrading to Basic. That
downgrade is exactly what reintroduces the 535 while looking healthy.

The log states the mode unambiguously:

```
[email] auth mode: Microsoft OAuth2
[email] transporter ready: smtp.office365.com:587 (STARTTLS, OAuth2, verify=on) as alerts@medilink.om
```

#### Required Microsoft tenant configuration

Code alone is not enough. All of these are needed, and none can be done from the repo:

| # | Setting | Where |
|---|---|---|
| 1 | **Office 365 Exchange Online** → `SMTP.SendAsApp` **Application** permission | Entra → App registrations → API permissions → *APIs my organization uses* |
| 2 | **Admin consent** granted for that permission | same screen → "Grant admin consent" |
| 3 | Exchange **service principal** registered | `New-ServicePrincipal -AppId <client-id> -ObjectId <entra-object-id>` |
| 4 | Service principal granted rights on the mailbox | `Add-MailboxPermission -Identity alerts@medilink.om -User <sp-object-id> -AccessRights FullAccess` |
| 5 | SMTP AUTH enabled on the mailbox | `Set-CASMailbox -Identity alerts@medilink.om -SmtpClientAuthenticationDisabled $false` |

⚠️ Step 1 is the usual mix-up: **Microsoft Graph `Mail.Send` does not enable SMTP
submission.** It must be the *Office 365 Exchange Online* API.

You can verify steps 1–2 without Exchange access: `scripts/smtp-check.mjs` decodes the
token's `roles` claim. If `SMTP.SendAsApp` is absent, the permission was never granted or
consented, and SMTP will return 535 regardless of everything else. Exchange changes can take
15–60 minutes to propagate.

### Authentication troubleshooting

If `verify()` fails, the usual causes are:

1. **SMTP AUTH disabled tenant-wide** in Microsoft 365 — the most common one. Exchange
   admin centre → the mailbox → Mail flow settings → enable authenticated SMTP.
2. MFA on the account without an app password.
3. Wrong port/TLS combination (see above).

---

## 3. Known gap — the HAMS announcement edge function

`supabase/functions/broadcast-announcement/index.ts` still builds its own
`service: "gmail"` transport from `EMAIL_USER` / `EMAIL_PASS` Deno secrets. It is a HAMS
super-admin mass-mail feature with no MediLink patient call site, it is deployed
separately from this repo, and it runs against the shared live Supabase project — so
repointing its SMTP from here would change a live HAMS feature without a deploy.

Migrating it is a deliberate follow-up: update the transport, then
`supabase secrets set` the `SMTP_*` values and redeploy the function.

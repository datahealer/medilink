# MediLink — Internal API Documentation

Interactive, OpenAPI-3.1-backed reference for the MediLink (HAMS-reused) Next.js backend,
served with [Scalar](https://github.com/scalar/scalar).

- **Interactive docs (Scalar, with "Try it out"):** `GET /api/docs`
- **Raw OpenAPI 3.1 spec:** `GET /api/openapi.json`
- Backend dev origin: **`http://localhost:3001`** (the backend workspace runs on port 3001).
  → Docs URL in dev: **http://localhost:3001/api/docs**

> Generated from the live route handlers under `backend/src/app/api/**`. No endpoints were
> invented. Implementation: `backend/src/lib/openapi/{spec,schemas,access}.ts`.

---

## 1. Access & security (important)

Both `/api/docs` and `/api/openapi.json` are gated by `denyDocsAccess`
([access.ts](../backend/src/lib/openapi/access.ts)):

| Environment | `ENABLE_API_DOCS` | Result |
| --- | --- | --- |
| any | unset / not `"true"` | **404** (docs fully disabled) |
| development / staging (`NODE_ENV !== production`) | `"true"` | ✅ open |
| production (`NODE_ENV === production`) | `"true"` | ✅ **only** for an authenticated internal admin (`super_admin` / `facility_admin`); everyone else **404** |

A 404 (not 403) is returned on denial so the docs' existence isn't leaked in production.

**Env var to add** (already in `.env.example`):

```bash
ENABLE_API_DOCS=true     # dev/staging only; keep false/unset in production
```

### Secrets are never exposed
The spec documents only client-visible request/response contracts. It never contains:
Supabase **service-role key**, **Thawani** secret/API keys, **Google client secret**,
**OTP/SMS provider** secrets, or the **internal webhook / push** secret (`INVITE_SECRET`).
The push route documents only that an `x-internal-secret` header is *required* — not its value.

---

## 2. Authentication model

- Auth is **Supabase Auth access tokens (JWT)** — there is **no custom JWT**.
- Send as `Authorization: Bearer <access_token>`.
- Security scheme in the spec: `bearerAuth` (`type: http, scheme: bearer, bearerFormat: JWT`).
- The **Authorize** button in Scalar lets you paste a token once; it's attached to every
  authed "Try it out" call.
- One route (`/api/notifications/push`) is server-to-server and uses the `internalSecret`
  (`x-internal-secret` header) scheme instead — not for client/browser use.

> Web clients normally carry the session as an HttpOnly cookie (set by middleware). For
> "Try it out" you need a **raw access token** — see §6.

---

## 3. Documented endpoints (37 operations across 36 paths)

> Auth legend: 🔓 public · 🔑 Bearer (Supabase) · 🛡️ Bearer + AAL2 for staff w/ 2FA · 🤖 internal secret · 🔁 gateway callback

### Authentication
| Method | Path | Auth | Summary |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | 🔓 | Register a patient (forces `role=patient`) |
| POST | `/api/auth/send-otp` | 🔑 | Send phone-verification OTP (SMS delivery disabled in code) |
| POST | `/api/auth/resend-otp` | 🔑 | Resend OTP (echoes code in dev only) |
| POST | `/api/auth/verify-otp` | 🔑 | Verify 6-digit phone OTP |
| POST | `/api/auth/set-password` | 🔑 | Set/change password (self or invite-token flow) |
| GET | `/api/auth/google` | 🔓 | Begin Google **Calendar** connect (not social login) |
| GET | `/api/auth/google/callback` | 🔑 | Google OAuth callback → stores Calendar tokens |
| POST | `/api/auth/session-log` | 🔑 | Audit-log a successful login |
| POST | `/api/auth/2fa/setup` | 🔑 | Enroll TOTP (staff only) |
| POST | `/api/auth/2fa/challenge` | 🔑 | Create a 2FA challenge |
| POST | `/api/auth/2fa/verify` | 🔑 | Verify a 2FA code (5/5min) |
| POST | `/api/auth/2fa/disable` | 🔑 | Disable 2FA (requires current code) |
| POST | `/api/auth/2fa/recovery/generate` | 🔑 | Generate 10 recovery codes |
| POST | `/api/auth/2fa/recovery/use` | 🔑 | Use a recovery code (5/10min) |

### Patient Profile
| POST | `/api/patients/me/profile-photo` | 🛡️ | Upload profile photo (multipart, ≤5MB) |

### Patients (records)
| GET | `/api/patients/{id}/medical-history/pdf` | 🛡️ | Generate medical-history PDF (own record / staff) |

### Appointments
| POST | `/api/appointments/{id}/google` | 🛡️ | Add appointment to Google Calendar |

### Payments
| GET | `/api/payments` | 🛡️ | List my payments (`?status=`) |
| POST | `/api/payments/checkout` | 🛡️ | Create Thawani checkout session |
| GET | `/api/payments/unpaid` | 🛡️ | List unpaid appointments |
| GET | `/api/payments/{id}/invoice` | 🔓 | Redirect to invoice PDF |
| POST | `/api/payments/{id}/refund` | 🛡️ | Refund a payment |
| GET | `/api/payments/get-appointment/{id}` | 🛡️ | Get payable amount for an appointment |
| POST | `/api/payments/webhook` | 🔁 | Thawani payment webhook |

### Prescriptions / Documents
| GET | `/api/prescriptions/{id}/download` | 🛡️ | Signed prescription PDF URL |
| POST | `/api/prescriptions/{id}/generate-pdf` | 🛡️ | Generate prescription PDF (doctor) |
| GET | `/api/prescriptions/{id}/share-link` | 🛡️ | Create/return 24h share link |

### Notifications
| POST | `/api/notifications/push` | 🤖 | Dispatch push (server-to-server) |

### AI Features
| POST | `/api/ai/symptom-check` | 🔓 | Symptom triage (SSE stream) |
| POST | `/api/ai/suggest-doctor` | 🔑 | Doctor suggestion (5/hr) |
| POST | `/api/ai/scan-prescription` | 🔑 | Prescription OCR (multipart image) |
| POST | `/api/ai/schedule-assist` | 🔑 | Conversational scheduling assistant |

### Settings (account / GDPR)
| DELETE | `/api/users/me/account` | 🛡️ | Request account deletion (30-day grace) |
| POST | `/api/users/me/account/cancel-deletion` | 🛡️ | Cancel pending deletion |
| GET | `/api/users/me/data-export` | 🛡️ | List export requests |
| POST | `/api/users/me/data-export` | 🛡️ | Request a data export (2/24h) |
| GET | `/api/users/me/data-export/{id}` | 🛡️ | Get one export request |

Each operation in the spec includes: method, path, tag, summary, auth requirement,
request body / query / path params, success + error responses, and fake-data examples.

---

## 4. How to test PUBLIC endpoints

No token needed. With the backend running (`npm run dev:backend`, port 3001):

```bash
# AI symptom check (Server-Sent Events stream)
curl -N -X POST http://localhost:3001/api/ai/symptom-check \
  -H "Content-Type: application/json" \
  -d '{"symptoms":"sore throat and mild fever for 2 days","patient_age":29,"patient_gender":"female"}'

# Patient signup (creates a fake patient)
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"aisha.patient@example.com","password":"Str0ng!Pass","full_name":"Aisha Al-Hinai"}'
```

Or in Scalar: open `/api/docs` → pick the endpoint → **Try it out** → **Send**.

---

## 5. How to test AUTHENTICATED endpoints (Bearer token)

1. Open **http://localhost:3001/api/docs**.
2. Click **Authorize** (top right) → select **bearerAuth** → paste a Supabase **access token**
   (JWT, no `Bearer ` prefix) → **Authorize**.
3. Run any 🔑 / 🛡️ endpoint via **Try it out**.

Equivalent curl:

```bash
TOKEN="<supabase_access_token>"
curl http://localhost:3001/api/payments \
  -H "Authorization: Bearer $TOKEN"
```

### Getting a token safely (fake test patient)
Use the Supabase JS client against the **anon** key (never the service-role key):

```bash
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"aisha.patient@example.com","password":"Str0ng!Pass"}' | jq -r .access_token
```

Paste the resulting `access_token` into Scalar's Authorize dialog.

> ⚠️ 🛡️ endpoints additionally enforce **AAL2** for staff accounts that have 2FA enabled.
> Patients are never subject to AAL2, so a patient token works for all 🛡️ patient endpoints.

The `internalSecret` route (`/api/notifications/push`) cannot be tested from a browser — it
requires the server-only `x-internal-secret` header and is meant for server-to-server calls.

---

## 6. Endpoints NOT in the OpenAPI spec (by design)

Several patient capabilities are **not REST routes** — they are typed **direct-Supabase
(RLS)** calls in `@medilink/shared` (`shared/src/api/*`), executed by the web/mobile clients
against Supabase directly. They are intentionally excluded from this HTTP spec because no
backend route handler exists for them:

| Capability | Where it lives | Notes |
| --- | --- | --- |
| Patient profile read/update | `shared/src/api/profile.ts` | `profiles` + `patient_profiles` via RLS |
| Family members CRUD | `shared/src/api/family.ts` | RLS |
| Doctor search / detail | `shared/src/api/doctors.ts` | RLS |
| Appointment list / book / cancel / reschedule | `shared/src/api/appointments.ts` | RLS + RPCs |
| Available slots | `shared/src/api/appointments.ts` | RLS |
| Favourites | `shared/src/api/favourites.ts` | RLS |
| Labs / records / reviews | `shared/src/api/{labs,records,reviews}.ts` | RLS |
| Notifications list / read / preferences | `shared/src/api/notifications.ts` | RLS |
| Login / logout / session / password reset | `shared/src/api/auth.ts` | supabase-js SDK |

> If any of these should become first-class documented REST endpoints, they'd need new route
> handlers under `backend/src/app/api/**` first — then add them to `spec.ts`. They are listed
> here so the omission is explicit, not an oversight.

---

## 7. Known gaps / backend blockers

- **`/api/auth/google` is Calendar integration, not social login.** It requests a Calendar
  scope and stores tokens in `user_integrations`. "Sign in with Google" is not implemented.
- **OTP SMS delivery is disabled** (`sendOtpSms` commented out) and codes are stored in
  plaintext (`otp_records.hash`); `resend-otp` echoes the code in its response (dev-only —
  must be removed before production). No SMS provider keys exist.
- **2FA is staff-only.** Patient tokens are rejected by `/api/auth/2fa/setup` (403).
- The `Documents` / `Prescriptions` tags overlap (share-link is tagged `Documents`,
  download/generate are `Prescriptions`) — cosmetic grouping only.
- **Labs** and **Reviews** have no REST routes (direct-Supabase only) — see §6.

---

## 8. Maintenance

- Add/rename a route handler under `backend/src/app/api/**` → reflect it in
  [spec.ts](../backend/src/lib/openapi/spec.ts) (paths) and, if a new shape, add a schema in
  [schemas.ts](../backend/src/lib/openapi/schemas.ts).
- The spec is built at request time (`buildOpenApiSpec()`), so changes appear on reload.
- Validate quickly: `curl -s localhost:3001/api/openapi.json | jq '.paths | length'`.

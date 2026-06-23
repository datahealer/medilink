/**
 * MediLink — internal OpenAPI 3.1 specification.
 *
 * Documents ONLY the HTTP route handlers that actually exist under `src/app/api/**`.
 * It does NOT invent endpoints. Several patient-facing capabilities (profile read/update,
 * family, doctor search, appointment list/book, labs, reviews, notification list/read)
 * are implemented as direct-Supabase (RLS) calls in `@medilink/shared`, not as REST
 * routes — those are described in `docs/API_DOCUMENTATION.md`, not here.
 *
 * Auth model: Supabase Auth access tokens (JWT) sent as `Authorization: Bearer <token>`.
 * The push route is server-to-server and uses an `x-internal-secret` header instead.
 *
 * Built from `schemas.ts`. Served (gated) by `app/api/openapi.json/route.ts`.
 */
import { schemas } from "./schemas";

const ref = (name: keyof typeof schemas) => ({ $ref: `#/components/schemas/${name}` });

const bearer = [{ bearerAuth: [] as string[] }];

/** 401 + 500 attached to most authed routes. */
const commonErrors = {
  "401": { description: "Unauthorized (missing/invalid session).", content: { "application/json": { schema: ref("Error") } } },
  "500": { description: "Server error.", content: { "application/json": { schema: ref("Error") } } },
};
const commonErrorsSuccessShape = {
  "401": { description: "Unauthorized.", content: { "application/json": { schema: ref("SuccessError") } } },
  "500": { description: "Server error.", content: { "application/json": { schema: ref("SuccessError") } } },
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
  description: "Resource UUID.",
};

const json = (schemaRef: object) => ({ content: { "application/json": { schema: schemaRef } } });

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "MediLink Internal API",
      version: "1.0.0",
      description:
        "Internal API documentation for the MediLink (HAMS-reused) backend. " +
        "**Patient-only platform.** Authenticate with a Supabase access token via the " +
        "**Authorize** button (Bearer). Examples use fake data only — never real PHI.\n\n" +
        "> Many patient data operations (profile, family, appointments, favourites, labs, " +
        "reviews, notifications list) are direct-Supabase RLS calls, not REST endpoints — " +
        "see `docs/API_DOCUMENTATION.md`.",
    },
    servers: [
      { url: "/", description: "Same origin (backend runs on port 3001 in dev)" },
    ],
    tags: [
      { name: "Authentication", description: "Signup, OTP, password, Google connect, 2FA." },
      { name: "Patient Profile", description: "Patient account/profile media." },
      { name: "Patients", description: "Patient medical records (PDF)." },
      { name: "Appointments", description: "Appointment integrations." },
      { name: "Payments", description: "Thawani checkout, invoices, refunds, webhook." },
      { name: "Documents", description: "Prescription PDFs & share links." },
      { name: "Prescriptions", description: "Prescription generation & download." },
      { name: "Notifications", description: "Push dispatch (server-to-server)." },
      { name: "AI Features", description: "Symptom check, doctor suggestion, prescription scan, scheduling." },
      { name: "Settings", description: "Account deletion & data export (GDPR)." },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Supabase Auth access token. Paste the JWT (without the `Bearer ` prefix) " +
            "into the Authorize dialog. Web clients normally send it as an HttpOnly cookie; " +
            "for 'Try it out' use a raw access token.",
        },
        internalSecret: {
          type: "apiKey",
          in: "header",
          name: "x-internal-secret",
          description: "Server-to-server shared secret. Not for client use.",
        },
      },
      schemas,
    },
    security: bearer,
    paths: {
      /* ═══════════════════════ Authentication ═══════════════════════ */
      "/api/auth/signup": {
        post: {
          tags: ["Authentication"], summary: "Register a patient account",
          description: "Creates a Supabase auth user (email confirmed). Forces `role=patient`. A DB trigger auto-creates `profiles` + `patient_profiles`.",
          security: [],
          requestBody: { required: true, ...json(ref("SignupRequest")) },
          responses: {
            "200": { description: "Created.", ...json(ref("SignupResponse")) },
            "400": { description: "Validation failed / email already registered.", ...json(ref("SuccessError")) },
            "403": { description: "Non-patient role rejected.", ...json(ref("SuccessError")) },
            "500": { description: "Server error.", ...json(ref("SuccessError")) },
          },
        },
      },
      "/api/auth/send-otp": {
        post: {
          tags: ["Authentication"], summary: "Send phone-verification OTP", security: bearer,
          description: "Generates a 6-digit SMS OTP for the authenticated patient (5-min expiry). NOTE: SMS delivery is currently disabled in code.",
          requestBody: { required: false, ...json(ref("SendOtpRequest")) },
          responses: {
            "200": { description: "OTP generated.", ...json(ref("Ok")) },
            "400": { description: "Phone required / invalid format.", ...json(ref("Error")) },
            "403": { description: "Not a patient.", ...json(ref("Error")) },
            "404": { description: "Profile not found.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/auth/resend-otp": {
        post: {
          tags: ["Authentication"], summary: "Resend OTP", security: bearer,
          description: "Regenerates a 6-digit OTP (10-min expiry). Echoes the code in dev only.",
          requestBody: { required: true, ...json(ref("ResendOtpRequest")) },
          responses: {
            "200": { description: "OTP sent.", ...json(ref("ResendOtpResponse")) },
            "400": { description: "Phone required.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },
      "/api/auth/verify-otp": {
        post: {
          tags: ["Authentication"], summary: "Verify phone OTP", security: bearer,
          description: "Verifies the 6-digit code; sets `phone_verified` on success.",
          requestBody: { required: true, ...json(ref("VerifyOtpRequest")) },
          responses: {
            "200": { description: "Verified.", ...json(ref("Ok")) },
            "400": { description: "Invalid / expired / not found.", ...json(ref("Error")) },
            "403": { description: "Not a patient.", ...json(ref("Error")) },
            "404": { description: "Profile not found.", ...json(ref("Error")) },
            "429": { description: "Too many attempts.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/auth/set-password": {
        post: {
          tags: ["Authentication"], summary: "Set / change password",
          description: "Self-service (uses caller session) OR invite-token flow for doctor/technician/staff (NOT patient).",
          security: bearer,
          requestBody: { required: true, ...json(ref("SetPasswordRequest")) },
          responses: {
            "200": { description: "Password set.", ...json(ref("Ok")) },
            "400": { description: "Validation failed.", ...json(ref("Error")) },
            "404": { description: "Invalid invitation / auth account not found.", ...json(ref("Error")) },
            "409": { description: "Invitation already used.", ...json(ref("Error")) },
            "410": { description: "Invitation expired.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/auth/google": {
        get: {
          tags: ["Authentication"], summary: "Begin Google Calendar connect",
          description: "Redirects to Google's OAuth consent screen requesting **Calendar** scope. This is a calendar integration, NOT social login.",
          security: [],
          responses: { "302": { description: "Redirect to Google OAuth." } },
        },
      },
      "/api/auth/google/callback": {
        get: {
          tags: ["Authentication"], summary: "Google OAuth callback", security: bearer,
          description: "Exchanges the auth code, stores Google Calendar tokens in `user_integrations`, then redirects back to the app.",
          parameters: [{ name: "code", in: "query", required: true, schema: { type: "string" } }],
          responses: {
            "302": { description: "Redirect back to app with `?connected=google`." },
            "400": { description: "Missing code / token exchange failed.", ...json(ref("Error")) },
            "500": { description: "Server error.", ...json(ref("Error")) },
          },
        },
      },
      "/api/auth/session-log": {
        post: {
          tags: ["Authentication"], summary: "Log a successful login", security: bearer,
          description: "Client calls this after the SIGNED_IN event so the login is audit-logged (auth events aren't captured by DB triggers).",
          responses: {
            "200": { description: "Logged (always returns success, even on failure).", ...json(ref("Ok")) },
            "401": { description: "No session.", ...json(ref("Ok")) },
          },
        },
      },
      "/api/auth/2fa/setup": {
        post: {
          tags: ["Authentication"], summary: "Enroll TOTP 2FA (staff only)", security: bearer,
          description: "Begins TOTP enrollment. Patients are rejected (403) — 2FA is staff-only. Returns QR code; never the raw secret.",
          responses: {
            "200": { description: "Enrollment started.", ...json(ref("TwoFASetupResponse")) },
            "403": { description: "Staff-only.", ...json(ref("SuccessError")) },
            "404": { description: "Profile not found.", ...json(ref("SuccessError")) },
            "400": { description: "Enroll failed.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },
      "/api/auth/2fa/challenge": {
        post: {
          tags: ["Authentication"], summary: "Create a 2FA challenge", security: bearer,
          requestBody: { required: true, ...json(ref("TwoFAChallengeRequest")) },
          responses: {
            "200": { description: "Challenge created.", ...json(ref("Ok")) },
            "400": { description: "factorId required.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },
      "/api/auth/2fa/verify": {
        post: {
          tags: ["Authentication"], summary: "Verify a 2FA code", security: bearer,
          description: "Verifies a TOTP code for a challenge. Rate-limited to 5/5min per user.",
          requestBody: { required: true, ...json(ref("TwoFAVerifyRequest")) },
          responses: {
            "200": { description: "Verified.", ...json(ref("Ok")) },
            "400": { description: "Invalid/expired or missing fields.", ...json(ref("SuccessError")) },
            "429": { description: "Too many attempts.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },
      "/api/auth/2fa/disable": {
        post: {
          tags: ["Authentication"], summary: "Disable 2FA", security: bearer,
          description: "Requires a valid current TOTP code; unenrolls all factors and clears recovery codes.",
          requestBody: { required: true, ...json(ref("TwoFADisableRequest")) },
          responses: {
            "200": { description: "Disabled.", ...json(ref("Ok")) },
            "400": { description: "Code required / no factor.", ...json(ref("SuccessError")) },
            "403": { description: "Invalid authenticator code.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },
      "/api/auth/2fa/recovery/generate": {
        post: {
          tags: ["Authentication"], summary: "Generate recovery codes", security: bearer,
          description: "Returns 10 single-use recovery codes ONCE (bcrypt-hashed server-side). Requires 2FA enabled.",
          responses: {
            "200": { description: "Codes generated.", ...json(ref("RecoveryCodesResponse")) },
            "403": { description: "2FA not enabled.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },
      "/api/auth/2fa/recovery/use": {
        post: {
          tags: ["Authentication"], summary: "Use a recovery code", security: bearer,
          description: "Consumes one recovery code (rate-limited 5/10min).",
          requestBody: { required: true, ...json(ref("RecoveryUseRequest")) },
          responses: {
            "200": { description: "Accepted.", ...json(ref("Ok")) },
            "400": { description: "Invalid / no codes.", ...json(ref("SuccessError")) },
            "429": { description: "Too many attempts.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },

      /* ═══════════════════════ Patient Profile ═══════════════════════ */
      "/api/patients/me/profile-photo": {
        post: {
          tags: ["Patient Profile"], summary: "Upload patient profile photo", security: bearer,
          description: "Multipart upload (`file`). Max 5MB; JPEG/PNG/WebP. Stored in the `account_image` bucket.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: { type: "object", properties: { file: { type: "string", format: "binary" } }, required: ["file"] },
              },
            },
          },
          responses: {
            "200": { description: "Uploaded.", ...json(ref("ProfilePhotoResponse")) },
            "400": { description: "No file / invalid type / too large.", ...json(ref("SuccessError")) },
            "404": { description: "Patient profile not found.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },

      /* ═══════════════════════ Patients (records) ═══════════════════════ */
      "/api/patients/{id}/medical-history/pdf": {
        get: {
          tags: ["Patients"], summary: "Generate patient medical-history PDF", security: bearer,
          description: "Patients may only access their own record (`id` = their `patient_profiles.id`). Staff/technician access is role-scoped. Proxies a Supabase Edge Function.",
          parameters: [idParam],
          responses: {
            "200": { description: "PDF / generation result." },
            "403": { description: "Forbidden.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },

      /* ═══════════════════════ Appointments ═══════════════════════ */
      "/api/appointments/{id}/google": {
        post: {
          tags: ["Appointments"], summary: "Add appointment to Google Calendar", security: bearer,
          description: "Creates a Google Calendar event for the appointment using the user's stored Calendar tokens.",
          parameters: [idParam],
          responses: {
            "200": { description: "Event created.", ...json(ref("Ok")) },
            "400": { description: "Google not connected / invalid time.", ...json(ref("SuccessError")) },
            "404": { description: "Appointment not found.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },

      /* ═══════════════════════ Payments ═══════════════════════ */
      "/api/payments": {
        get: {
          tags: ["Payments"], summary: "List my payments", security: bearer,
          description: "Returns the authenticated patient's payments (newest first). Staff with 2FA must be AAL2.",
          parameters: [{
            name: "status", in: "query", required: false,
            schema: { type: "string", enum: ["unpaid", "pending", "paid", "failed", "refunded", "partial_refund"] },
          }],
          responses: {
            "200": { description: "Payment list.", ...json({ type: "array", items: ref("Payment") }) },
            "403": { description: "2FA verification required.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/payments/checkout": {
        post: {
          tags: ["Payments"], summary: "Create a Thawani checkout session", security: bearer,
          requestBody: { required: true, ...json(ref("CheckoutRequest")) },
          responses: {
            "200": { description: "Checkout URL.", ...json(ref("CheckoutResponse")) },
            "400": { description: "Missing data / emergency not approved / already paid.", ...json(ref("Error")) },
            "404": { description: "Appointment not found.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/payments/unpaid": {
        get: {
          tags: ["Payments"], summary: "List unpaid appointments", security: bearer,
          responses: {
            "200": { description: "Unpaid appointments.", ...json(ref("UnpaidResponse")) },
            "404": { description: "Patient not found.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/payments/{id}/invoice": {
        get: {
          tags: ["Payments"], summary: "Redirect to invoice PDF", security: [],
          description: "Public redirect to the stored invoice URL for a payment id.",
          parameters: [idParam],
          responses: {
            "302": { description: "Redirect to invoice URL." },
            "404": { description: "Invoice not found.", ...json(ref("Error")) },
          },
        },
      },
      "/api/payments/{id}/refund": {
        post: {
          tags: ["Payments"], summary: "Refund a payment", security: bearer,
          description: "Issues a Thawani refund (cutoff/percent rules apply). One refund per payment.",
          parameters: [idParam],
          responses: {
            "200": { description: "Refund created.", ...json(ref("RefundResponse")) },
            "400": { description: "Not eligible / refund already exists.", ...json(ref("Error")) },
            "404": { description: "Payment not found.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/payments/get-appointment/{id}": {
        get: {
          tags: ["Payments"], summary: "Get appointment payable amount", security: bearer,
          parameters: [idParam],
          responses: {
            "200": { description: "Amount.", ...json(ref("GetAppointmentAmountResponse")) },
            "404": { description: "Appointment not found.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/payments/webhook": {
        post: {
          tags: ["Payments"], summary: "Thawani payment webhook", security: [],
          description: "Gateway-to-server callback. Marks payment paid, confirms appointment, generates invoice, sends notifications. Body shape is gateway-defined (`{ data: { client_reference_id } }`).",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
          responses: {
            "200": { description: "Processed.", ...json({ type: "object", properties: { success: { type: "boolean" }, payment_id: { type: "string" } } }) },
            "400": { description: "Missing client_reference_id.", ...json(ref("Error")) },
            "404": { description: "Payment not found.", ...json(ref("Error")) },
            "500": { description: "Webhook failed.", ...json(ref("Error")) },
          },
        },
      },

      /* ═══════════════════════ Prescriptions / Documents ═══════════════════════ */
      "/api/prescriptions/{id}/download": {
        get: {
          tags: ["Prescriptions"], summary: "Get signed prescription PDF URL", security: bearer,
          description: "Returns a 1-hour signed URL. Patient/doctor ownership enforced; admins allowed.",
          parameters: [idParam],
          responses: {
            "200": { description: "Signed URL.", ...json(ref("SignedUrlResponse")) },
            "403": { description: "Forbidden.", ...json(ref("Error")) },
            "404": { description: "Not found / PDF not generated.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/prescriptions/{id}/generate-pdf": {
        post: {
          tags: ["Prescriptions"], summary: "Generate prescription PDF (doctor)", security: bearer,
          description: "Doctor-only. Generates and stores the PDF (skips if already present), returns a signed URL.",
          parameters: [idParam],
          responses: {
            "200": { description: "Signed URL.", ...json(ref("SignedUrlResponse")) },
            "403": { description: "Forbidden (not the owning doctor).", ...json(ref("Error")) },
            "404": { description: "Prescription not found.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/prescriptions/{id}/share-link": {
        get: {
          tags: ["Documents"], summary: "Create/return a prescription share link", security: bearer,
          description: "Returns a 24-hour share token URL (reused while valid). Patient/doctor ownership enforced.",
          parameters: [idParam],
          responses: {
            "200": { description: "Share link.", ...json(ref("ShareLinkResponse")) },
            "403": { description: "Forbidden.", ...json(ref("Error")) },
            "404": { description: "Not found.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },

      /* ═══════════════════════ Notifications ═══════════════════════ */
      "/api/notifications/push": {
        post: {
          tags: ["Notifications"], summary: "Dispatch a push notification (internal)",
          description: "Server-to-server only. Requires `x-internal-secret` header. Respects the user's push opt-in and their registered device tokens.",
          security: [{ internalSecret: [] }],
          requestBody: { required: true, ...json(ref("PushRequest")) },
          responses: {
            "200": { description: "Dispatched / skipped / no devices.", ...json(ref("PushResponse")) },
            "400": { description: "Invalid JSON / missing fields.", ...json(ref("Error")) },
            "401": { description: "Bad/missing internal secret.", ...json(ref("Error")) },
            "500": { description: "Server error.", ...json(ref("Error")) },
          },
        },
      },

      /* ═══════════════════════ AI Features ═══════════════════════ */
      "/api/ai/symptom-check": {
        post: {
          tags: ["AI Features"], summary: "AI symptom triage (SSE stream)", security: [],
          description: "Returns a `text/event-stream`: a `meta` event (urgency/conditions) then streamed explanation text, ending with `[DONE]`. Rejects non-medical input with 400.",
          requestBody: { required: true, ...json(ref("SymptomCheckRequest")) },
          responses: {
            "200": { description: "SSE stream.", content: { "text/event-stream": { schema: { type: "string" } } } },
            "400": { description: "Symptoms required / not a medical symptom.", ...json(ref("SuccessError")) },
            "429": { description: "AI rate limit.", ...json(ref("SuccessError")) },
            "500": { description: "Server error.", ...json(ref("SuccessError")) },
          },
        },
      },
      "/api/ai/suggest-doctor": {
        post: {
          tags: ["AI Features"], summary: "AI doctor suggestion", security: bearer,
          description: "Maps symptoms to specialties and returns bookable doctors. Rate-limited to 5/hour per user.",
          requestBody: { required: true, ...json(ref("SuggestDoctorRequest")) },
          responses: {
            "200": { description: "Suggestions.", ...json(ref("SuggestDoctorResponse")) },
            "400": { description: "Symptoms required / not medical.", ...json(ref("SuccessError")) },
            "429": { description: "Rate limit exceeded.", ...json(ref("SuccessError")) },
            "503": { description: "AI service unavailable.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },
      "/api/ai/scan-prescription": {
        post: {
          tags: ["AI Features"], summary: "AI prescription OCR (image)", security: bearer,
          description: "Multipart upload (`image`). Extracts medications via a vision model; validates names against the drug list.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: { type: "object", properties: { image: { type: "string", format: "binary" } }, required: ["image"] },
              },
            },
          },
          responses: {
            "200": { description: "Extraction result.", ...json(ref("ScanPrescriptionResponse")) },
            "400": { description: "No image / not an image.", ...json(ref("SuccessError")) },
            "422": { description: "Unreadable / unparseable.", ...json(ref("SuccessError")) },
            "429": { description: "AI rate limit.", ...json(ref("SuccessError")) },
            "503": { description: "AI service unavailable.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },
      "/api/ai/schedule-assist": {
        post: {
          tags: ["AI Features"], summary: "AI scheduling assistant", security: bearer,
          description: "Conversational booking helper: classifies intent, extracts doctor type/date/time, returns matching doctors + slots or a clarifying question.",
          requestBody: { required: true, ...json(ref("ScheduleAssistRequest")) },
          responses: {
            "200": { description: "Assistant response.", ...json(ref("ScheduleAssistResponse")) },
            "400": { description: "query required.", ...json(ref("SuccessError")) },
            "429": { description: "AI rate limit.", ...json(ref("SuccessError")) },
            ...commonErrorsSuccessShape,
          },
        },
      },

      /* ═══════════════════════ Settings (account) ═══════════════════════ */
      "/api/users/me/account": {
        delete: {
          tags: ["Settings"], summary: "Request account deletion", security: bearer,
          description: "Soft-deletes the patient account (30-day grace), cancels active appointments. Requires `{confirmation:'DELETE'}`. Staff cannot self-delete.",
          requestBody: { required: true, ...json(ref("DeleteAccountRequest")) },
          responses: {
            "200": { description: "Deletion scheduled." },
            "400": { description: "Confirmation missing.", ...json(ref("Error")) },
            "403": { description: "Staff must request via admin.", ...json(ref("Error")) },
            "409": { description: "Deletion already pending.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/users/me/account/cancel-deletion": {
        post: {
          tags: ["Settings"], summary: "Cancel pending account deletion", security: bearer,
          responses: {
            "200": { description: "Reactivated.", ...json({ type: "object", properties: { status: { type: "string", example: "active" } } }) },
            "400": { description: "No pending deletion.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/users/me/data-export": {
        get: {
          tags: ["Settings"], summary: "List my data-export requests", security: bearer,
          responses: { "200": { description: "Export requests.", ...json(ref("DataExportListResponse")) }, ...commonErrors },
        },
        post: {
          tags: ["Settings"], summary: "Request a data export (GDPR)", security: bearer,
          description: "Creates a pending export (rate-limited 2/24h) and triggers an Edge Function.",
          responses: {
            "200": { description: "Export request created.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
            "429": { description: "Rate limit exceeded.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
      "/api/users/me/data-export/{id}": {
        get: {
          tags: ["Settings"], summary: "Get a data-export request", security: bearer,
          description: "Returns one export request (ownership enforced). Logs the download once when ready.",
          parameters: [idParam],
          responses: {
            "200": { description: "Export request.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
            "404": { description: "Not found.", ...json(ref("Error")) },
            ...commonErrors,
          },
        },
      },
    },
  } as const;
}

export type OpenApiSpec = ReturnType<typeof buildOpenApiSpec>;

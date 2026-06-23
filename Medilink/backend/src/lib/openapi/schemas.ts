/**
 * Reusable OpenAPI 3.1 component schemas for the MediLink internal API docs.
 *
 * These are JSON-Schema objects (OpenAPI 3.1 is a superset of JSON Schema 2020-12).
 * They mirror the request/response shapes used by the real route handlers under
 * `src/app/api/**` and the generated Supabase types in `@medilink/shared` — but are
 * declared explicitly here because OpenAPI cannot consume TypeScript types directly.
 *
 * SECURITY: never describe service-role keys, payment secret keys, Google client
 * secrets, OTP/SMS provider secrets, or internal webhook secrets here. Only the
 * request/response contracts a client legitimately sees are documented.
 */

export const schemas = {
  /* ─────────────────────────── Shared envelopes ─────────────────────────── */

  Error: {
    type: "object",
    description: "Standard error envelope (`{ error }` convention).",
    properties: { error: { type: "string", example: "Something went wrong" } },
    required: ["error"],
  },

  SuccessError: {
    type: "object",
    description:
      "Alternate error envelope used by auth / upload routes (`{ success: false, error }`).",
    properties: {
      success: { type: "boolean", example: false },
      error: { type: "string", example: "Invalid OTP" },
    },
    required: ["success", "error"],
  },

  Ok: {
    type: "object",
    description: "Minimal success envelope.",
    properties: { success: { type: "boolean", example: true } },
    required: ["success"],
  },

  /* ───────────────────────────── Auth domain ───────────────────────────── */

  SignupRequest: {
    type: "object",
    properties: {
      email: { type: "string", format: "email", example: "aisha.patient@example.com" },
      password: {
        type: "string",
        format: "password",
        description:
          "Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.",
        example: "Str0ng!Pass",
      },
      full_name: { type: "string", example: "Aisha Al-Hinai" },
      phone: {
        type: "string",
        description: "E.164 format.",
        example: "+96890000000",
        nullable: true,
      },
      role: {
        type: "string",
        description:
          "Only `patient` is accepted; any other value is rejected with 403.",
        enum: ["patient"],
        example: "patient",
      },
    },
    required: ["email", "password"],
  },

  SignupResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      message: { type: "string", example: "Signup successful" },
      data: {
        type: "object",
        description: "Supabase admin createUser result (user object).",
        properties: {
          user: { $ref: "#/components/schemas/AuthUser" },
        },
      },
    },
    required: ["success"],
  },

  AuthUser: {
    type: "object",
    description: "Supabase auth user (subset).",
    properties: {
      id: { type: "string", format: "uuid", example: "11111111-1111-1111-1111-111111111111" },
      email: { type: "string", format: "email", example: "aisha.patient@example.com" },
      role: { type: "string", example: "authenticated" },
      user_metadata: { type: "object", additionalProperties: true },
    },
  },

  SendOtpRequest: {
    type: "object",
    description:
      "Phone is optional when `profiles.phone` is already set; required otherwise (E.164).",
    properties: {
      phone: { type: "string", example: "+96890000000", nullable: true },
    },
  },

  ResendOtpRequest: {
    type: "object",
    properties: { phone: { type: "string", example: "+96890000000" } },
    required: ["phone"],
  },

  ResendOtpResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      message: { type: "string", example: "OTP sent successfully" },
      otp: {
        type: "string",
        description: "DEV-ONLY echo of the code. Must be removed before production.",
        example: "482915",
      },
    },
    required: ["success"],
  },

  VerifyOtpRequest: {
    type: "object",
    properties: {
      code: { type: "string", minLength: 6, maxLength: 6, example: "482915" },
      phone: { type: "string", example: "+96890000000", nullable: true },
    },
    required: ["code"],
  },

  SetPasswordRequest: {
    type: "object",
    description:
      "Self-service password set uses the caller's session (no token). Invite flows " +
      "(doctor/technician/staff — NOT patient) pass `token` + `type`.",
    properties: {
      password: { type: "string", format: "password", example: "Str0ng!Pass" },
      token: { type: "string", description: "Raw invite token (invite flows only).", nullable: true },
      type: { type: "string", enum: ["facility_admin", "doctor", "technician", "staff"], nullable: true },
    },
    required: ["password"],
  },

  TwoFAChallengeRequest: {
    type: "object",
    properties: { factorId: { type: "string", example: "totp_factor_abc123" } },
    required: ["factorId"],
  },

  TwoFAVerifyRequest: {
    type: "object",
    properties: {
      factorId: { type: "string", example: "totp_factor_abc123" },
      challengeId: { type: "string", example: "challenge_xyz789" },
      code: { type: "string", example: "123456" },
    },
    required: ["factorId", "challengeId", "code"],
  },

  TwoFADisableRequest: {
    type: "object",
    properties: { code: { type: "string", minLength: 6, maxLength: 6, example: "123456" } },
    required: ["code"],
  },

  TwoFASetupResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      message: { type: "string", example: "MFA enrollment started" },
      data: {
        type: "object",
        properties: {
          id: { type: "string", example: "totp_factor_abc123" },
          qr_code: {
            type: "string",
            description: "SVG/data-URI QR code. The raw TOTP secret/URI is never returned.",
            example: "data:image/svg+xml;base64,PHN2Zy4uLg==",
          },
        },
      },
    },
  },

  RecoveryCodesResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      codes: {
        type: "array",
        description: "Plain recovery codes — shown ONCE, never retrievable again.",
        items: { type: "string", example: "A1B2-C3D4-E5F6" },
      },
    },
  },

  RecoveryUseRequest: {
    type: "object",
    properties: { recoveryCode: { type: "string", example: "A1B2-C3D4-E5F6" } },
    required: ["recoveryCode"],
  },

  /* ─────────────────────────── Patient profile ─────────────────────────── */

  ProfilePhotoResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      url: {
        type: "string",
        format: "uri",
        example:
          "https://your-project.supabase.co/storage/v1/object/public/account_image/patient-profiles/.../photo.jpg",
      },
    },
  },

  /* ───────────────────────────── Payments ──────────────────────────────── */

  Payment: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid", example: "22222222-2222-2222-2222-222222222222" },
      amount: { type: "number", example: 15 },
      currency: { type: "string", example: "OMR" },
      status: {
        type: "string",
        enum: ["unpaid", "pending", "paid", "failed", "refunded", "partial_refund"],
        example: "paid",
      },
      created_at: { type: "string", format: "date-time", example: "2026-06-20T09:30:00Z" },
      invoice_url: { type: "string", format: "uri", nullable: true },
    },
  },

  CheckoutRequest: {
    type: "object",
    properties: {
      appointment_id: {
        type: "string",
        format: "uuid",
        example: "33333333-3333-3333-3333-333333333333",
      },
      amount: { type: "number", description: "Amount in OMR (major units).", example: 15 },
    },
    required: ["appointment_id", "amount"],
  },

  CheckoutResponse: {
    type: "object",
    properties: {
      checkoutUrl: {
        type: "string",
        format: "uri",
        example: "https://uatcheckout.thawani.om/pay/sess_123?key=pk_test_xxx",
      },
    },
  },

  UnpaidResponse: {
    type: "object",
    properties: {
      appointments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            slot_date: { type: "string", format: "date", example: "2026-06-25" },
            slot_start: { type: "string", example: "10:00:00" },
            payment_status: { type: "string", example: "unpaid" },
            is_emergency: { type: "boolean", example: false },
            status: { type: "string", example: "confirmed" },
            doctors: {
              type: "object",
              properties: {
                full_name: { type: "string", example: "Dr. Salim Al-Busaidi" },
                fees: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
    },
  },

  GetAppointmentAmountResponse: {
    type: "object",
    properties: {
      appointment_id: { type: "string", format: "uuid" },
      amount: { type: "number", example: 15 },
    },
  },

  RefundResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      refund: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          payment_id: { type: "string", format: "uuid" },
          amount: { type: "number", example: 7.5 },
          status: { type: "string", example: "pending" },
        },
      },
    },
  },

  /* ─────────────────────────── Prescriptions ───────────────────────────── */

  SignedUrlResponse: {
    type: "object",
    properties: {
      signed_url: {
        type: "string",
        format: "uri",
        nullable: true,
        example: "https://your-project.supabase.co/storage/v1/object/sign/prescriptions/...",
      },
    },
  },

  ShareLinkResponse: {
    type: "object",
    properties: {
      url: { type: "string", example: "/prescription/4f3c...-share-token" },
      expires_at: { type: "string", format: "date-time", example: "2026-06-24T09:30:00Z" },
    },
  },

  /* ─────────────────────────── Notifications ───────────────────────────── */

  PushRequest: {
    type: "object",
    properties: {
      userId: { type: "string", format: "uuid", example: "11111111-1111-1111-1111-111111111111" },
      title: { type: "string", example: "Appointment confirmed" },
      body: { type: "string", example: "Your appointment on 25 Jun at 10:00 is confirmed." },
      data: { type: "object", additionalProperties: true, nullable: true },
    },
    required: ["userId", "title", "body"],
  },

  PushResponse: {
    type: "object",
    description:
      "One of: `{sent,result}` on dispatch, `{skipped}` if user disabled push, " +
      "or `{sent:0,reason}` if no registered devices.",
    properties: {
      sent: { type: "integer", example: 1 },
      result: { type: "object", additionalProperties: true },
      skipped: { type: "string", example: "push disabled by user" },
      reason: { type: "string", example: "no registered devices" },
    },
  },

  /* ───────────────────────────── AI domain ─────────────────────────────── */

  SymptomCheckRequest: {
    type: "object",
    properties: {
      symptoms: { type: "string", example: "I have a sore throat and mild fever for 2 days" },
      patient_age: { type: "integer", example: 29, nullable: true },
      patient_gender: { type: "string", example: "female", nullable: true },
    },
    required: ["symptoms"],
  },

  SuggestDoctorRequest: {
    type: "object",
    properties: {
      symptoms: { type: "string", example: "persistent skin rash on my arm" },
    },
    required: ["symptoms"],
  },

  SuggestDoctorResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      data: {
        type: "object",
        properties: {
          is_medical: { type: "boolean", example: true },
          ai_reasoning: { type: "string", example: "Skin symptoms suggest dermatology." },
          urgency_level: { type: "string", enum: ["low", "medium", "high", "emergency"], example: "low" },
          suggested_specialties: { type: "array", items: { type: "string" }, example: ["Dermatologist"] },
          recommended_doctors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                full_name: { type: "string", example: "Dr. Salim Al-Busaidi" },
                specialty: { type: "string", example: "Dermatologist" },
                avg_rating: { type: "number", nullable: true, example: 4.6 },
                booking_url: { type: "string", example: "/dashboard/dashboardpages/patient/book?doctorId=..." },
              },
            },
          },
        },
      },
    },
  },

  ScanPrescriptionResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      data: {
        type: "object",
        properties: {
          medications: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", example: "Amoxicillin" },
                dosage: { type: "string", example: "500mg" },
                frequency: { type: "string", example: "twice daily" },
                duration: { type: "string", example: "7 days" },
                recognized: { type: "boolean", example: true },
              },
            },
          },
          doctor_name: { type: "string", nullable: true, example: "Dr. Salim Al-Busaidi" },
          date: { type: "string", nullable: true, example: "2026-06-18" },
          unrecognized_count: { type: "integer", example: 0 },
          image_data: { type: "string", description: "base64 data URI of the compressed image." },
        },
      },
    },
  },

  ScheduleAssistRequest: {
    type: "object",
    properties: {
      query: { type: "string", example: "I need a cardiologist next Monday morning" },
      patient_location: {
        type: "object",
        nullable: true,
        properties: { lat: { type: "number", example: 23.588 }, lng: { type: "number", example: 58.408 } },
      },
      history: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string" },
          },
        },
      },
      client_date: { type: "string", format: "date", example: "2026-06-23", nullable: true },
      pending_entities: { type: "object", additionalProperties: true, nullable: true },
    },
    required: ["query"],
  },

  ScheduleAssistResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: true },
      data: {
        type: "object",
        description:
          "Discriminated by `type`: `results` | `clarifying_question` | `info` | `no_results`.",
        properties: {
          type: { type: "string", enum: ["results", "clarifying_question", "info", "no_results"] },
          question: { type: "string", nullable: true },
          message: { type: "string", nullable: true },
          results: { type: "array", items: { type: "object", additionalProperties: true } },
          extracted_entities: { type: "object", additionalProperties: true },
        },
      },
    },
  },

  /* ───────────────────────────── Settings ──────────────────────────────── */

  DeleteAccountRequest: {
    type: "object",
    properties: {
      confirmation: { type: "string", enum: ["DELETE"], example: "DELETE" },
    },
    required: ["confirmation"],
  },

  DataExportListResponse: {
    type: "object",
    properties: {
      exports: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            status: { type: "string", example: "ready" },
            download_url: { type: "string", nullable: true },
            expires_at: { type: "string", format: "date-time", nullable: true },
            created_at: { type: "string", format: "date-time" },
            completed_at: { type: "string", format: "date-time", nullable: true },
            file_size_bytes: { type: "integer", nullable: true },
          },
        },
      },
    },
  },
} as const;

export type SchemaName = keyof typeof schemas;

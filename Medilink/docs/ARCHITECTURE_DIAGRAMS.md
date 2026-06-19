# MediLink — Architecture Diagrams

Mermaid diagrams of the real system. Renders on GitHub and in Mermaid-aware viewers. Every node maps to an actual workspace, module, route, or RPC.

## 1. Monorepo architecture
```mermaid
graph TD
  subgraph Clients
    FE["frontend/ (Next.js web :3000)\nSSR + cookie session"]
    MO["mobile/ (Expo RN)\nSecureStore + bearer session"]
  end

  subgraph Shared["shared/ (@medilink/shared)"]
    API["src/api/* (13 modules, 49 fns)\nauth profile family doctors favourites\nfacilities appointments records labs\nprescriptions notifications reviews"]
    TYPES["src/types (Database)"]
    CFG["src/config (i18n EN/AR, clinicTypes)"]
  end

  subgraph Backend["backend/ (Next.js API :3001)"]
    PAY["payments/* (Thawani, Stripe)"]
    AI["ai/* (Gemini, Groq)"]
    PDF["prescriptions + medical-history PDF (pdfkit)"]
    AUTHR["auth/* (signup, OTP, 2FA, Google)"]
    PUSH["notifications/push (dispatch)"]
    GDPR["users/me/* (export, delete)"]
    LIB["src/lib (supabase clients, auth guards, email, sms, audit)"]
  end

  subgraph Supabase["Supabase (cloud, reused HAMS project)"]
    PG["Postgres + RLS\n123 migrations"]
    AUTHS["Auth (password, OAuth, OTP, 2FA)"]
    STG["Storage (patient-docs, lab-results)"]
    RPC["RPCs (book_appointment_atomic, ...)"]
    EDGE["13 Edge Functions"]
  end

  FE -->|direct RLS| API
  MO -->|direct RLS| API
  FE -->|privileged fetch + cookie| Backend
  MO -->|privileged fetch + Bearer| Backend
  API --> TYPES
  API -->|supabase-js| PG
  API -->|rpc| RPC
  API -->|storage| STG
  Backend --> LIB
  LIB -->|service role| PG
  Backend --> AUTHS
  Backend --> RPC
  PG --> EDGE
  EDGE --> STG
```

## 2. Authentication flow
```mermaid
sequenceDiagram
  participant U as User
  participant C as Client (web/mobile)
  participant SA as shared/api/auth.ts
  participant B as backend/api/auth/*
  participant SB as Supabase Auth

  Note over U,SB: Sign up (backend, privileged)
  U->>C: enter email/password
  C->>B: POST /api/auth/signup
  B->>SB: admin.createUser(role=patient)
  SB-->>B: user
  B-->>C: created

  Note over U,SB: Sign in (direct, shared)
  U->>C: submit credentials
  C->>SA: signInWithPassword(db, {email,password})
  SA->>SB: auth.signInWithPassword
  SB-->>SA: user + session
  SA-->>C: session (cookie web / SecureStore mobile)

  Note over U,SB: Phone verify (OTP, backend)
  C->>B: POST /api/auth/send-otp (session)
  B->>SB: write otp_records + send SMS
  C->>B: POST /api/auth/verify-otp {code}
  B->>SB: set profiles.phone_verified
  B-->>C: success

  Note over C,SB: Session kept fresh
  C->>SA: onAuthStateChange(db, cb)
  SB-->>C: token refresh (middleware web / AppState mobile)
```

## 3. Appointment booking flow
```mermaid
sequenceDiagram
  participant U as User
  participant C as Client
  participant AP as shared/api/appointments.ts
  participant SB as Supabase (RLS)
  participant RPC as RPC book_appointment_atomic
  participant PAY as backend/api/payments
  participant EF as Edge: send-booking-confirmation

  U->>C: pick doctor + date
  C->>AP: getAvailableSlots(db,{doctorId,date})
  AP->>SB: doctor_availability (weekday) minus booked appointments
  SB-->>C: free slots
  U->>C: choose slot, confirm
  C->>AP: bookAppointment(db,{doctorId,facilityId,slotDate,slotStart,type,forFamilyMemberId?})
  AP->>RPC: rpc(book_appointment_atomic, ...)
  RPC->>SB: insert appointment (slot-uniqueness guard)
  RPC-->>AP: { appointment_id }
  AP-->>C: booked
  SB-->>EF: trigger booking confirmation
  EF-->>U: email / notification

  opt Payment required
    C->>PAY: POST /api/payments/checkout {appointment_id}
    PAY-->>C: checkoutUrl
  end

  opt Cancel / reschedule
    C->>AP: cancelAppointment(db,id) / rescheduleAppointment(db,id,slot)
    AP->>SB: rpc cancel_appointment_safe / reschedule_appointment_atomic
  end
```

## 4. Notification flow
```mermaid
sequenceDiagram
  participant SRC as Event source (booking, lab result, waitlist)
  participant SB as Supabase (in_app_notifications)
  participant EF as Edge (notify-lab-result / notify-waitlist)
  participant API as shared/api/notifications.ts
  participant C as Client
  participant PUSH as backend/api/notifications/push
  participant DEV as Device (Expo/FCM/APNs)

  Note over C,DEV: Mobile registers a device token
  C->>SB: device_tokens upsert (mobile/services/push.ts)

  Note over SRC,SB: An event creates an in-app notification
  SRC->>SB: insert in_app_notifications
  SB->>EF: trigger (lab result / waitlist)

  Note over C,SB: Client reads notifications (direct, RLS)
  C->>API: listNotifications(db) / unreadCount(db)
  API->>SB: select in_app_notifications (user_id)
  SB-->>C: items + unread count
  C->>API: markAllRead(db) / markRead(db,id)

  Note over PUSH,DEV: Server-to-server push dispatch
  EF->>PUSH: POST /api/notifications/push (x-internal-secret)
  PUSH->>SB: check notification_preferences.push + read device_tokens (service role)
  PUSH->>DEV: Expo push -> FCM/APNs
  DEV-->>C: push received
```

## 5. Payment flow
```mermaid
sequenceDiagram
  participant U as User
  participant C as Client
  participant CO as backend/api/payments/checkout
  participant GW as Thawani (primary) / Stripe
  participant WH as backend/api/payments/webhook
  participant RPC as RPC enqueue_appointment
  participant SB as Supabase (service role)
  participant EF as Edge: generate-invoice / poll-refund-status

  U->>C: confirm appointment payment
  C->>CO: POST /api/payments/checkout {appointment_id} (Bearer/cookie)
  CO->>GW: create checkout session
  GW-->>CO: checkoutUrl / sessionId
  CO-->>C: checkoutUrl
  U->>GW: complete payment
  GW->>WH: webhook event (signed)
  WH->>SB: mark payment paid (service role)
  WH->>RPC: enqueue_appointment (emergency path)
  WH-->>GW: 200
  SB->>EF: generate-invoice
  EF-->>U: invoice

  opt Refund
    C->>WH: POST /api/payments/{id}/refund
    EF->>GW: poll-refund-status (scheduled)
  end
```

## 6. AI service flow
```mermaid
sequenceDiagram
  participant U as User
  participant C as Client
  participant AIR as backend/api/ai/*
  participant LLM as Gemini / Groq (or MOCK_AI stub)
  participant CH as chrono-node (schedule-assist)
  participant RPC as RPC get_available_slots
  participant SB as Supabase (ai_request_logs)

  U->>C: describe symptoms / scan Rx / "book next monday"
  C->>AIR: POST /api/ai/{symptom-check|suggest-doctor|scan-prescription|schedule-assist} (auth)
  alt symptom-check / suggest-doctor / scan-prescription
    AIR->>LLM: prompt (skipped if MOCK_AI=true)
    LLM-->>AIR: structured result
  else schedule-assist
    AIR->>CH: parse natural-language date
    AIR->>RPC: get_available_slots(p_doctor_id,p_date)
    RPC-->>AIR: slots
  end
  AIR->>SB: log request (ai_request_logs / symptom_check_logs)
  AIR-->>C: JSON (triage / specialty / parsed meds / date+slots)
  C->>U: render suggestion
```

> Note: `MOCK_AI=true` short-circuits the LLM calls with deterministic stubs for keyless local development (see [RUNBOOK.md](./RUNBOOK.md) §2 and [TESTING_GUIDE.md](./TESTING_GUIDE.md) §6).

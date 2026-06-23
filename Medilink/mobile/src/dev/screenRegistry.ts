/**
 * Canonical registry of all 50 MediLink PDF screens (see docs/FULL_SCREEN_INVENTORY.md).
 * Drives the dev-only Screen Gallery and the PDF-styled ScreenPreview placeholders.
 * `built: true` opens the real screen; otherwise the route renders a branded preview.
 *
 * DEV-ONLY metadata — intentionally plain English (not i18n); it never ships to users.
 */
export interface ScreenEntry {
  id: string;
  /** Inventory number (1–50). */
  n: number;
  title: string;
  flow: string;
  /** PDF page of the EN-Light artboard. */
  pdfPage: number;
  /** Route to open (absolute Expo Router path). */
  route: string;
  /** True when the real screen is implemented; false → PDF-styled preview. */
  built: boolean;
  /** Batch in which the real build is scheduled (for preview copy). */
  batch?: number;
}

export const SCREENS: ScreenEntry[] = [
  // 01 — Splash & Onboarding
  { id: "splash", n: 1, title: "Splash", flow: "01 Splash & Onboarding", pdfPage: 10, route: "/splash", built: true },
  { id: "welcome", n: 2, title: "Welcome", flow: "01 Splash & Onboarding", pdfPage: 10, route: "/welcome", built: true },
  { id: "onboarding", n: 3, title: "Onboarding carousel", flow: "01 Splash & Onboarding", pdfPage: 11, route: "/onboarding", built: true },
  { id: "language", n: 4, title: "Language selection", flow: "01 Splash & Onboarding", pdfPage: 11, route: "/language", built: true },
  { id: "sign-in", n: 5, title: "Sign In", flow: "01 Splash & Onboarding", pdfPage: 12, route: "/auth/sign-in", built: true },
  { id: "sign-up", n: 6, title: "Sign Up", flow: "01 Splash & Onboarding", pdfPage: 12, route: "/auth/sign-up", built: true },
  { id: "otp", n: 7, title: "OTP Verification", flow: "01 Splash & Onboarding", pdfPage: 13, route: "/auth/otp", built: true },
  { id: "forgot-reset", n: 8, title: "Forgot / Reset Password", flow: "01 Splash & Onboarding", pdfPage: 13, route: "/auth/forgot-password", built: true },

  // 02 — Home Dashboard
  { id: "dashboard", n: 9, title: "Patient Dashboard", flow: "02 Home Dashboard", pdfPage: 14, route: "/dashboard", built: true },
  { id: "recents-featured", n: 10, title: "Recents & Featured", flow: "02 Home Dashboard", pdfPage: 14, route: "/dashboard", built: true },

  // 03 — Patient Profile
  { id: "profile", n: 11, title: "Personal Information", flow: "03 Patient Profile", pdfPage: 15, route: "/profile", built: true },
  { id: "edit-profile", n: 12, title: "Edit Profile", flow: "03 Patient Profile", pdfPage: 15, route: "/edit-profile", built: true },

  // 04 — Family Management
  { id: "family", n: 13, title: "Family Members", flow: "04 Family Management", pdfPage: 16, route: "/me", built: true },
  { id: "family-add", n: 14, title: "Add Family Member", flow: "04 Family Management", pdfPage: 16, route: "/family/add", built: true },
  { id: "switch-patient", n: 15, title: "Switch Active Patient", flow: "04 Family Management", pdfPage: 17, route: "/patient-switcher", built: true },

  // 05 — Doctor Discovery
  { id: "search", n: 16, title: "Search & Results", flow: "05 Doctor Discovery", pdfPage: 17, route: "/search", built: true },
  { id: "filters", n: 17, title: "Filters", flow: "05 Doctor Discovery", pdfPage: 18, route: "/search/filters", built: true },
  { id: "specialties", n: 18, title: "Specialty Categories", flow: "05 Doctor Discovery", pdfPage: 18, route: "/search/specialties", built: true },
  { id: "map", n: 19, title: "Map View", flow: "05 Doctor Discovery", pdfPage: 19, route: "/search/map", built: true },

  // 06 — Doctor Profile
  { id: "doctor-details", n: 20, title: "Doctor Details", flow: "06 Doctor Profile", pdfPage: 19, route: "/doctors/doc-khalid", built: true },
  { id: "doctor-reviews", n: 21, title: "Reviews", flow: "06 Doctor Profile", pdfPage: 20, route: "/doctors/doc-khalid/reviews", built: true },

  // 07 — Appointment Booking
  { id: "booking-schedule", n: 22, title: "Select Location & Time", flow: "07 Appointment Booking", pdfPage: 20, route: "/booking/doc-khalid/schedule", built: false, batch: 3 },
  { id: "booking-review", n: 23, title: "Review & Patient", flow: "07 Appointment Booking", pdfPage: 21, route: "/booking/doc-khalid/review", built: false, batch: 3 },
  { id: "booking-success", n: 24, title: "Appointment Success", flow: "07 Appointment Booking", pdfPage: 21, route: "/booking/success", built: false, batch: 3 },

  // 08 — Payments
  { id: "payment-summary", n: 25, title: "Payment Summary", flow: "08 Payments", pdfPage: 22, route: "/booking/payment", built: false, batch: 5 },
  { id: "add-card", n: 26, title: "Add New Card", flow: "08 Payments", pdfPage: 22, route: "/payments/add-card", built: false, batch: 5 },
  { id: "payment-confirmation", n: 27, title: "Payment Confirmation", flow: "08 Payments", pdfPage: 23, route: "/booking/payment-success", built: false, batch: 5 },
  { id: "invoice", n: 28, title: "Invoice & Receipt", flow: "08 Payments", pdfPage: 23, route: "/payments/invoice/ML-INV-48213", built: false, batch: 5 },

  // 09 — Appointments Module
  { id: "appointments", n: 29, title: "Upcoming & Past", flow: "09 Appointments Module", pdfPage: 24, route: "/appointments", built: false, batch: 3 },
  { id: "appointment-details", n: 30, title: "Appointment Details", flow: "09 Appointments Module", pdfPage: 24, route: "/appointments/mock-appt-1", built: false, batch: 3 },
  { id: "cancel-appointment", n: 31, title: "Cancel Appointment", flow: "09 Appointments Module", pdfPage: 25, route: "/appointments/mock-appt-1/cancel", built: false, batch: 3 },
  { id: "check-in", n: 32, title: "Check-in", flow: "09 Appointments Module", pdfPage: 25, route: "/appointments/mock-appt-1/check-in", built: false, batch: 3 },
  { id: "refund-policy", n: 33, title: "Refund Policy", flow: "09 Appointments Module", pdfPage: 26, route: "/appointments/refund-policy", built: false, batch: 3 },

  // 10 — AI Features
  { id: "ai-symptom", n: 34, title: "AI Symptom Checker", flow: "10 AI Features", pdfPage: 26, route: "/ai/assistant", built: false, batch: 5 },
  { id: "ai-recommendations", n: 35, title: "AI Recommendations", flow: "10 AI Features", pdfPage: 27, route: "/ai/recommendations", built: false, batch: 5 },
  { id: "ai-insights", n: 36, title: "AI Insights & Risk", flow: "10 AI Features", pdfPage: 27, route: "/ai/insights", built: false, batch: 5 },

  // 11 — Document Vault
  { id: "vault", n: 37, title: "Medical Documents (Me Vault)", flow: "11 Document Vault", pdfPage: 28, route: "/records", built: false, batch: 4 },
  { id: "upload-documents", n: 38, title: "Upload Documents", flow: "11 Document Vault", pdfPage: 28, route: "/records/upload", built: false, batch: 4 },
  { id: "document-preview", n: 39, title: "Document Preview", flow: "11 Document Vault", pdfPage: 29, route: "/records/document/blood-test", built: false, batch: 4 },

  // 12 — Lab Results
  { id: "lab-reports", n: 40, title: "Lab Reports", flow: "12 Lab Results", pdfPage: 29, route: "/records/labs", built: false, batch: 4 },
  { id: "lab-detail", n: 41, title: "Result Trends & Detail", flow: "12 Lab Results", pdfPage: 30, route: "/records/labs/lipid", built: false, batch: 4 },

  // 13 — Prescriptions
  { id: "prescriptions", n: 42, title: "Active Prescriptions", flow: "13 Prescriptions", pdfPage: 30, route: "/records/prescriptions", built: false, batch: 4 },
  { id: "medication-details", n: 43, title: "Medication Details", flow: "13 Prescriptions", pdfPage: 31, route: "/records/prescriptions/salbutamol", built: false, batch: 4 },

  // 14 — Notifications
  { id: "notifications", n: 44, title: "Notification Center", flow: "14 Notifications", pdfPage: 31, route: "/notifications", built: true },
  { id: "facility-messages", n: 45, title: "Facility Messages", flow: "14 Notifications", pdfPage: 32, route: "/notifications/messages", built: true },
  { id: "notification-prefs", n: 46, title: "Notification Preferences", flow: "14 Notifications", pdfPage: 32, route: "/settings/notifications", built: true },

  // 15 — Ratings & Reviews
  { id: "doctor-rating", n: 47, title: "Doctor Rating", flow: "15 Ratings & Reviews", pdfPage: 33, route: "/rate/mock-appt-1", built: false, batch: 5 },
  { id: "review-submission", n: 48, title: "Review Submission", flow: "15 Ratings & Reviews", pdfPage: 33, route: "/rate/success", built: false, batch: 5 },

  // 16 — Settings
  { id: "settings", n: 49, title: "Settings", flow: "16 Settings", pdfPage: 34, route: "/settings", built: true },
  { id: "appearance", n: 50, title: "Appearance & Accessibility", flow: "16 Settings", pdfPage: 34, route: "/settings/appearance", built: true },
];

export const SCREEN_BY_ID: Record<string, ScreenEntry> = Object.fromEntries(
  SCREENS.map((s) => [s.id, s])
);

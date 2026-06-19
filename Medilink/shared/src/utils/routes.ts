export const ROUTES = {
  // 🔐 Auth
  LOGIN: "/login",
  SIGNUP: "/signup",
  UNAUTHORIZED: "/unauthorized",

  // 🏠 Dashboard Root
  DASHBOARD: "/dashboard",

  // 👤 Patient
  PATIENT: {
    HOME: "/dashboard/patient", // F12 Dashboard
    FAMILY: "/dashboard/patient/family",
    APPOINTMENTS: "/dashboard/patient/appointments", // My Appointments
    APPOINTMENT_HISTORY: "/dashboard/patient/appointment-history", // F08

    DOCUMENTS: "/dashboard/patient/documents", // F09
    MEDICAL_HISTORY: "/dashboard/patient/medical-history", // F10

    // ⭐ F11
    FAVOURITES: "/dashboard/patient/favourites",

    // ➕ Booking Flow (F13)
    BOOK_APPOINTMENT: "/dashboard/patient/book",
    BOOK_FACILITY: (id: string) => `/dashboard/patient/book/${id}`,
    BOOK_DOCTOR: (id: string) => `/dashboard/patient/book/doctor/${id}`, // dynamic
  },

  // 🧑‍⚕️ Doctor (F13)
  DOCTOR: {
    HOME: "/dashboard/doctor",
    PROFILE: "/dashboard/doctor/profile",
    AVAILABILITY: "/dashboard/doctor/availability",
    APPOINTMENTS: "/dashboard/doctor/appointments",

    // 🌐 Public profile
    PUBLIC_PROFILE: (id: string) => `/doctor/${id}`,
  },
};
// RE-HOME barrel: typed direct-Supabase data modules (web + mobile share these).
// Each domain is exposed as a namespace, e.g. `api.appointments.bookAppointment(db, …)`.
export * as auth from "./auth";
export * as profile from "./profile";
export * as family from "./family";
export * as doctors from "./doctors";
export * as specialties from "./specialties";
export * as favourites from "./favourites";
export * as facilities from "./facilities";
export * as appointments from "./appointments";
export * as payments from "./payments";
export * as records from "./records";
export * as labs from "./labs";
export * as prescriptions from "./prescriptions";
export * as notifications from "./notifications";
export * as reviews from "./reviews";

export type { DB } from "./client";
export { getCurrentUserId, getMyPatientProfileId } from "./client";
export type { PatientApi, BackendApi } from "./contracts";

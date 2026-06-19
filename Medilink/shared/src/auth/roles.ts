const STAFF_ROLE_VALUES = [
  "doctor",
  "facility_admin",
  "technician",
  "super_admin",
] as const;

export type StaffRole = (typeof STAFF_ROLE_VALUES)[number];

export const STAFF_ROLES = new Set<string>(STAFF_ROLE_VALUES);

export function isStaff(role: string | null | undefined): boolean {
  return role != null && STAFF_ROLES.has(role);
}

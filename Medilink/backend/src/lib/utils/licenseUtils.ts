/**
 * Timezone-safe license expiry check.
 * Parses YYYY-MM-DD as local midnight to avoid UTC offset issues.
 */
export function isLicenseExpired(dateStr: string): boolean {
  if (!dateStr) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  const expiry = new Date(year, month - 1, day); // local midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);                    // local midnight today
  return expiry < today;
}

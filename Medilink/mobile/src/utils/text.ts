/**
 * Coerce a possibly-Json column (some patient_profiles fields like `address` /
 * `emergency_contact` are typed as Json in the generated schema, though they hold
 * plain strings) into a display string. Non-string objects fall back to "".
 */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

// Shared payment math — single source of truth for consultation fee + VAT + rounding.
// Used by the backend (server-derived checkout amount — BP-4), mobile (display), and
// any web surface. Keeping this here removes the round3/VAT duplication that lived in
// mobile payment.tsx / success.tsx / bookingStore.ts.

/** Oman VAT rate applied to consultation fees. */
export const VAT_RATE = 0.05;

/** Round to 3 decimals (OMR is quoted to 3 dp / baisa precision). */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Consultation fee for an appointment type from the doctor's `fees` JSONB
 * (`{ in_person, online }`). Falls back across keys, then to a scalar.
 */
export function feeForType(fees: unknown, type?: string | null): number {
  if (fees && typeof fees === "object") {
    const f = fees as Record<string, unknown>;
    const v = (type === "online" ? f.online : f.in_person) ?? f.in_person ?? f.online;
    return typeof v === "number" ? v : Number(v) || 0;
  }
  return Number(fees) || 0;
}

/**
 * Fee + 5% VAT breakdown, all rounded to 3 dp. The authoritative amount charged is
 * `total` (server-derived at checkout — never trust a client-sent total).
 */
export function consultationTotal(fee: number): { fee: number; vat: number; total: number } {
  const f = round3(fee);
  const vat = round3(f * VAT_RATE);
  return { fee: f, vat, total: round3(f + vat) };
}

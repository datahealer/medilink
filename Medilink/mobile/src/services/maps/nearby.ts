/**
 * Nearby-clinic search POLICY: how far we look, and what "near me" is allowed to claim.
 *
 * These constants used to be two independent literal `50000`s — one in `useDiscovery.ts`
 * and one in `real/index.ts` — and that 50 km radius was the reason the map "did not show
 * all the clinics". Measured against production on 2026-08-13, ten facilities are eligible
 * for discovery; a 50 km `ST_DWithin` around Muscat returned only SEVEN of them, silently
 * dropping Firq (113 km), Falaj Al Qabail (190 km) and Al Nahdah/Salalah (854 km). A
 * patient in Sohar or Salalah saw exactly ONE clinic and no indication that any others
 * existed.
 *
 * ── WHY THE RADIUS IS NOW COUNTRY-SCALE ──
 *
 * Truncating the RESULT SET is the wrong tool for expressing proximity. The RPC already
 * returns `distance_km` and orders by it, so the honest design is: fetch every clinic the
 * patient could discover, ordered nearest-first, and let the DISTANCE LABEL and the
 * coverage notice below communicate how near "near" actually is. Hiding a clinic 60 km
 * away — in a country where that is a normal drive — is worse than showing it with an
 * accurate "62 km" next to it.
 *
 * 1,500 km covers Oman from any point inside it (the country's longest axis is ~1,300 km),
 * so the radius is a sanity bound on the query, not a product rule. It is NOT unlimited:
 * an unbounded `ST_DWithin` would make a patient in another country see Omani clinics as
 * "nearby", which is what `coverageFor()` exists to prevent.
 */
export const NEARBY_RADIUS_M = 1_500_000;

/** At or under this, "clinics near me" is a truthful claim. */
export const NEAR_ME_KM = 50;

/**
 * Beyond this the patient is not in a served area at all, and showing them the nearest
 * Omani clinic would be the "random clinic far away" failure mode. They get an empty
 * state instead — an empty state is information; a clinic 1,800 km away is noise.
 */
export const OUT_OF_COVERAGE_KM = 300;

/**
 * What the result set means relative to where the patient actually is.
 *
 * `unknown` is the no-fix case: we queried from the Muscat fallback, so the distances are
 * real but they are measured from Muscat, and no claim about the patient's proximity can
 * be made at all. It is deliberately NOT folded into `far` — the UI copy differs.
 */
export type Coverage = "unknown" | "near" | "far" | "outOfCoverage";

export function coverageFor(
  nearestKm: number | null | undefined,
  hasFix: boolean
): Coverage {
  if (!hasFix) return "unknown";
  // A fix plus zero rows is not "we don't know" — we searched NEARBY_RADIUS_M around the
  // patient and there is genuinely nothing. Verified live: a device in Delhi returns 0 rows
  // even at 1,500 km, because the nearest Omani clinic is ~2,900 km away. Reporting that as
  // `unknown` sent the patient the "try widening your search" copy, which is advice they
  // cannot act on and which implies the app might still find something.
  if (nearestKm == null) return "outOfCoverage";
  // A row that arrived WITHOUT a usable distance is a data fault, not a coverage answer.
  if (!Number.isFinite(nearestKm) || nearestKm < 0) return "unknown";
  if (nearestKm <= NEAR_ME_KM) return "near";
  if (nearestKm <= OUT_OF_COVERAGE_KM) return "far";
  return "outOfCoverage";
}

/**
 * How a server-supplied `distance_km` is rendered.
 *
 * The value is NEVER recomputed or adjusted — only formatted. This exists because the
 * screen was printing a bare `0 km`, which reads as a bug even when it is arithmetically
 * true. It was true: three Ruwi clinics are stored at exactly 23.588,58.3829, which is
 * byte-identical to the Muscat fallback origin, so `ST_Distance` legitimately returned
 * 0.00. Fixing the origin removes almost every occurrence, but the sub-100 m case is still
 * reachable (a patient standing at the clinic), and "0 km" is the wrong words for it.
 *
 * `veryClose` therefore carries no number at all — the screen renders a phrase. Everything
 * else keeps one decimal under 10 km (where 0.1 km is a meaningful difference) and rounds
 * to whole kilometres above it (where it is not).
 */
export type DistanceLabel = { kind: "veryClose" } | { kind: "exact"; value: string };

export function formatDistanceKm(km: number | null | undefined): DistanceLabel | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  if (km < 0.1) return { kind: "veryClose" };
  if (km < 10) return { kind: "exact", value: km.toFixed(1) };
  return { kind: "exact", value: String(Math.round(km)) };
}

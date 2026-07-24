/** `doctors.specialty` is free-text (facility admins type it in), so this is a best-effort
 * EN→AR lookup for the common specialties seen in practice — anything unmapped just falls
 * back to the raw (English) value rather than showing blank. */
const SPECIALTY_AR: Record<string, string> = {
  "General Care": "طب عام",
  "General Medicine": "طب عام",
  "General Physician": "طب عام",
  "Family Medicine": "طب الأسرة",
  "Internal Medicine": "الباطنية",
  "Cardiology": "أمراض القلب",
  "Dermatology": "جلدية",
  "Gynecology": "نساء وتوليد",
  "Obstetrics and Gynecology": "نساء وتوليد",
  "Dentist": "أسنان",
  "Dentistry": "أسنان",
  "Pediatrics": "أطفال",
  "Orthopedics": "عظام",
  "Orthopedic Surgery": "عظام",
  "ENT": "أنف وأذن وحنجرة",
  "Otolaryngology": "أنف وأذن وحنجرة",
  "Ophthalmology": "عيون",
  "Psychiatry": "طب نفسي",
  "Neurology": "أعصاب",
  "Urology": "مسالك بولية",
  "Endocrinology": "الغدد الصماء",
  "Gastroenterology": "الجهاز الهضمي",
  "Pulmonology": "أمراض الصدر",
  "Nephrology": "أمراض الكلى",
  "Oncology": "الأورام",
  "Radiology": "الأشعة",
  "Physiotherapy": "العلاج الطبيعي",
  "Surgery": "الجراحة",
  "General Surgery": "الجراحة العامة",
};

// Case-insensitive index — facility admins free-type this field, so casing varies.
const SPECIALTY_AR_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(SPECIALTY_AR).map(([k, v]) => [k.toLowerCase(), v])
);

/** Arabic label for a specialty, falling back to the original (English) value if unmapped. */
export function specialtyAr(specialty: string | null | undefined): string {
  if (!specialty) return "";
  return SPECIALTY_AR_LOWER[specialty.trim().toLowerCase()] ?? specialty;
}

/** Locale-aware specialty label. */
export function specialtyLabel(specialty: string | null | undefined, isAr: boolean): string {
  if (!specialty) return "";
  return isAr ? specialtyAr(specialty) : specialty;
}

/**
 * Whether a doctor's free-text specialty belongs to a filter category (e.g. "Cardiology").
 * Exact-match filtering broke on any casing difference or synonym (a doctor stored as
 * "General Medicine" would never match the "General Care" pill) — this matches case-
 * insensitively, and treats specialties that share an Arabic translation as the same
 * category (so "General Medicine"/"General Physician" both count as "General Care").
 */
export function matchesSpecialtyCategory(specialty: string | null | undefined, category: string): boolean {
  if (category === "All") return true;
  if (!specialty) return false;
  const s = specialty.trim().toLowerCase();
  const categoryLower = category.trim().toLowerCase();
  if (s === categoryLower) return true;
  const wantedAr = SPECIALTY_AR_LOWER[categoryLower];
  return Boolean(wantedAr) && SPECIALTY_AR_LOWER[s] === wantedAr;
}

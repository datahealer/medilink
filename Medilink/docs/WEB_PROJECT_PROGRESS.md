# MediLink Web — Project Progress (Management Summary)

**Product:** MediLink Patient **Web** App (`Medilink/frontend`, Next.js 15)
**Date:** 2026-07-07 · **Branch:** `merge/vartika-ui`
**Benchmark:** Delivery Plan V2 (primary) + Phase 2 Scope doc (broader) + Requirements V1.1

> One-line status: **The core "find → book → pay → attend → records" loop is real and working. The app is ~80% of the Delivery Plan V2 patient-web scope; Settings and functional Reviews are the main missing modules, and several ready backend features are not yet surfaced.**

---

## 1. UI Progress

| Metric | Value |
|---|---:|
| Total UI pages present (`page.tsx`) | **29** |
| Dynamic routes | 2 |
| Route handlers | 1 |
| Planned web routes (Delivery Plan V2) | 15 (11 core + 4 auth) |
| Planned routes covered | ✅ met/exceeded (29 pages) |
| Additional pages required for plan completeness | **3–5** (Settings, Privacy/Data, real Reviews; optional: Facility profile, Favourites) |
| **UI completion** | **~95%** (page shells exist and are polished; gaps are whole missing destinations, chiefly Settings) |

---

## 2. Backend Progress

| Metric | Value |
|---|---:|
| Pages that call real backend | **16** |
| Pages fully working end-to-end | **14** |
| Pages partially integrated | **3** (dashboard home, doctor profile, language) |
| Pages static / needing backend (data-bearing) | **3** (lab-tests, surgeries, contact) |
| Static-by-design (marketing/content, OK) | 9 |
| Shared `api.*` domains that are real (not stubbed) | **12 / 12** |
| **Backend completion (functional surface)** | **~78%** |

Payments are **real Thawani** (checkout → hosted page → verify/webhook). Booking is **overbooking-safe** (atomic SECURITY DEFINER RPCs). Auth is **real Supabase** with working route protection.

---

## 3. Module Progress

| Module | UI | Backend | Status |
|---|:---:|:---:|:---:|
| Authentication | ✅ | ✅ | ✅ Complete |
| Dashboard home | ✅ | 🟡 | 🟡 Partial (fake vitals) |
| Patient Profile | ✅ | ✅ | ✅ Complete |
| Family Management | ✅ | ✅ | ✅ Complete |
| Medical History | ✅ | ✅ | ✅ Complete |
| Document Vault | ✅ | ✅ | ✅ Complete |
| Doctor Discovery | ✅ | ✅ | ✅ Complete |
| Doctor Profile | ✅ | 🟡 | 🟡 Partial (reviews mock) |
| Booking | ✅ | ✅ | ✅ Complete |
| Appointments | ✅ | ✅ | ✅ Complete (no check-in/waitlist) |
| Payments | ✅ | ✅ | ✅ Complete (no refund UI) |
| Lab Results (view) | ✅ | ✅ | ✅ Complete |
| Prescriptions (view) | ✅ | 🟡 | 🟡 Partial (no detail/share) |
| Notifications | ✅ | ✅ | ✅ Complete |
| AI (symptom + suggest) | ✅ | ✅ | ✅ Complete |
| Ratings & Reviews | 🟡 | ❌ | ❌ Not persisted |
| Favourites | ❌ | ⚠️ ready | ❌ Missing UI |
| Facility Profile | ❌ | ⚠️ ready | ❌ Missing UI |
| Lab Tests (catalog/order) | ✅ | ❌ | ❌ Static |
| Surgeries | ✅ | ❌ | ❌ Static |
| Settings | ❌ | ⚠️ ready | ❌ Missing |
| Privacy / Data export / Delete | ❌ | ⚠️ ready | ❌ Missing |
| Secure Messaging | ❌ | ❌ | ❌ Missing |
| Telehealth (video) | ❌ | ❌ | ❌ Missing |
| Public SEO doctor/clinic pages | ❌ | ⚠️ data ready | ❌ Missing |
| Landing / Marketing / Articles | ✅ | 🟦 | 🟦 By design |

⚠️ ready = backend endpoint/`api.*` exists but no web UI consumes it.

---

## 4. Remaining Work

### Pages left to create
1. **Settings** (theme/RTL, notification preferences) — *P0*
2. **Privacy & Data** (export data, delete account, consent) — *P0* (backend ready)
3. **Facility / clinic profile** — *P2* (`api.facilities` ready)
4. **Favourites list** — *P2* (`api.favourites` ready)
5. *(Phase 2, confirm scope)* Public SEO doctor/clinic pages, Secure messaging, Telehealth video/pre-consult/waiting-room

### Pages left to integrate (wire existing UI to existing backend)
1. **Doctor profile reviews** → `api.reviews.createReview` / `listMyReviews` — *P1*
2. **Dashboard nav bell** → `api.notifications` (remove hardcoded list) — *P1*
3. **Dashboard vitals** → remove fabricated `HEALTH_METRICS` or back with data — *P1*
4. **Prescription share/PDF** → `/api/prescriptions/[id]/*` — *P2*
5. **Refund UI** → `/api/payments/[id]/refund` — *P2*
6. **Appointment web check-in / waitlist / rebook** → existing RPCs — *P2*
7. **Lab analyte detail + mark-viewed** → `api.labs.markLabResultViewed` — *P2*
8. **Contact form** → wire or remove fake success — *P3*

### Missing backend integrations (no backend domain yet)
- **Lab-test catalog & ordering** — decide build vs informational.
- **Surgeries domain** — decide build vs informational.
- **Vitals/health-metrics source** — no table/endpoint.
- **Secure messaging + telehealth** — net-new, largest effort.

### Estimated effort to complete (patient web, against Delivery Plan V2 core)
| Work | Est. |
|---|---|
| Settings + Privacy/Data pages | ~3–4 dev-days |
| Wire Reviews (real) | ~2 dev-days |
| Consistency fixes (nav bell, vitals, contact) | ~1–2 dev-days |
| Surface unused backend (refund, rx share, check-in/waitlist, favourites, facility) | ~5–7 dev-days |
| **Subtotal to "Delivery Plan V2 complete"** | **~2–2.5 dev-weeks** |
| Phase 2 broader (messaging, telehealth, public SEO) | Additional multi-week scope — confirm first |

---

## 5. Current Status

```
Total Planned UI Pages (Delivery Plan V2):     15 web routes (11 core + 4 auth)
Current UI Pages:                              29 page.tsx (routes met/exceeded)
Additional Pages Required (core completeness):  3–5

Backend Integrated (pages calling real APIs):  16
Backend Fully Working:                         14
Partial Backend:                                3
Static UI (data-bearing, needs backend):        3
Static-by-design (marketing/content, OK):       9

Missing Modules (patient web):                  3 core (Settings, Reviews-real, Messaging)
                                                + Phase-2 broader (Telehealth, Public SEO, Favourites, Facility)

Overall UI Completion:                         ~95%
Overall Backend Completion (functional):       ~78%
Overall Project Completion (vs Delivery V2):   ~80%

Ready for Production (full patient web):        NO
Core booking+payment loop (pilot/demo):        YES
Ready for full Phase 2 Scope:                  NO
```

### Bottom line
MediLink Web is **well past prototype** — the money-making patient journey is real, integrated, and overbooking/payment safe. To call the **patient web** app *complete against Delivery Plan V2*, the team must add **Settings + Privacy/Data**, make **Ratings & Reviews** real, and **surface the backend features already built** (refunds, prescription sharing, check-in/waitlist, favourites, facility profile) — roughly **2–2.5 developer-weeks**. Full **Phase 2** (telehealth video, secure messaging, public SEO pages) is a larger, separate scope that should be confirmed before estimating.

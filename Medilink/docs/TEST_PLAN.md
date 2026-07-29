# MediLink Mobile — Test Plan

**Version:** 1.0 · **Date:** 2026-07-28 · **Owner:** QA + Mobile
**Scope:** `Medilink/mobile` (Expo SDK 54 / RN 0.81 / React 19)

Companion documents: [`MANUAL_QA_CHECKLIST.md`](./MANUAL_QA_CHECKLIST.md) ·
[`DEVICE_TEST_CHECKLIST.md`](./DEVICE_TEST_CHECKLIST.md) ·
[`PRODUCTION_LAUNCH_AUDIT.md`](./PRODUCTION_LAUNCH_AUDIT.md)

---

## 1. Testing philosophy

This is a healthcare application handling PHI, appointments and real money. The suite is
deliberately **small and high-signal** rather than broad: every test earns its place by
protecting logic where a silent regression causes real harm.

**What we automate:** pure logic whose failure is invisible in review — money arithmetic,
refund tiers, validation rules, notification routing, and the MediLink↔HAMS queue contract.

**What we do NOT automate, on purpose:**

| Not automated | Why |
|---|---|
| Screen snapshots | They fail on every intentional design tweak and assert nothing about behaviour. Zero snapshot tests exist and none should be added. |
| Every screen render | 64 screens; rendering them proves only that they mount. Visual correctness is a human judgement — that is what manual QA is for. |
| Translated string values | Asserting `t()` output couples tests to copy. We assert *key coverage and placeholder parity* instead (see §3.4). |
| Presentation helpers (`localizedName`, `specialties`, `mime`, `text`) | Pure formatting, visually obvious when wrong, cheap to eyeball. |
| Supabase RLS / DB behaviour | Cannot be asserted from the client. Belongs to the staging security tests (§5.2). |
| Native delivery (push, camera, biometrics) | Requires physical hardware. See `DEVICE_TEST_CHECKLIST.md`. |

**Coverage is a floor, not a goal.** Thresholds exist so that deleting a test fails the
build. They are not targets to raise.

---

## 2. Infrastructure

| Component | Version | Purpose |
|---|---|---|
| `jest` | 29.7.0 | runner |
| `jest-expo` | 54.0.17 | Expo SDK 54 preset (RN/Flow transform, asset stubs) |
| `@testing-library/react-native` | 13.3.3 | provider/component tests |
| `react-test-renderer` | **19.1.0** | pinned to match `react@19.1.0` exactly |
| `@types/jest` | 29.5.14 | types |

### Commands

```bash
npm test                    # from repo root (delegates to the mobile workspace)
cd mobile && npm test
cd mobile && npm run test:watch
cd mobile && npm run test:coverage
```

### Two monorepo hazards worth knowing

Both were hit while building this suite and are encoded in `jest.config.js`:

1. **Dual React identity.** The repo root hoists `react@18.3.1` (backend/frontend, Next.js)
   while mobile pins `react@19.1.0`. Without explicit `moduleNameMapper` entries,
   `react-test-renderer` loads React 19 while zustand (via `use-sync-external-store`) and
   React Query resolve the root's React 18 — two hook dispatchers, and every render dies
   with `Cannot read properties of null (reading 'useRef')`. The config pins `react`,
   `react/*` and `react-is` to mobile's copies. This is the Jest counterpart of the
   `react/jsx-runtime` pinning `tsconfig.typecheck.json` already applies for *types*
   (see `CLAUDE.md` → module resolution). **Keep all three in sync.**

2. **Aliases are declared three times.** Metro does not read `tsconfig.json` paths, and
   neither does Jest. `@/*` and `@medilink/shared*` must be kept in sync across
   `tsconfig.json`, `babel.config.js` and `jest.config.js`.

### Native mocks (`jest.setup.js`)

Only modules with no Jest-safe JS implementation are mocked: `expo-secure-store`
(in-memory map), `expo-notifications`, `expo-device`, `@react-native-community/netinfo`,
`expo-router`, and `DevSettings` (touched at import by `utils/restart.ts`). Everything
else runs real code, so a failure means the app is broken — not the mock.

`__DEV__` is set to **false** so tests exercise production code paths and the
`if (__DEV__) console.warn(...)` diagnostics stay quiet.

---

## 3. Automated test inventory — 155 tests, 10 suites

### 3.1 Money (`src/utils/__tests__/payments.test.ts` — 17 tests)

Highest-consequence pure logic in the app. OMR is quoted to 3 dp (baisa), so
half-baisa errors are real money.

- `round3` — rounding, IEEE-754 drift (`0.1 + 0.2`, `12.6 * 3`), half-away-from-zero
- `feeForType` — per-type selection, fallback chain, scalar input, **never NaN**
  (a NaN would render "OMR NaN" and could reach a payment amount)
- `consultationTotal` — 5% Oman VAT, per-component rounding, and an invariant sweep
  asserting `total === round3(fee + vat)` across representative fees
- `payCategory` — tone mapping; `unpaid`/`pending` must look identical to a patient;
  unknown status degrades to `muted` rather than crashing a payments list

### 3.2 Refunds & appointment timing (`appointments.test.ts` — 15 tests)

- `refundTier` — the 0 / 24 / 48-hour boundaries asserted **exactly**, including that each
  boundary belongs to the more generous tier, plus tier↔i18n-key pairing (a mismatch would
  show "full refund" beside a 10% amount)
- `hoursUntilAppt` — fixed clock via fake timers; future/past slots, missing date →
  `+Infinity` (unknown timing must never imply "no refund"), non-ISO input, single-digit hour
- One composed test: `hoursUntilAppt` → `refundTier` at the 48h boundary

### 3.3 Validation (`validation.test.ts` — 32 tests)

Oman-specific rules and the auth schemas.

- `isValidCivilNumber` / `isValidOmanPhone` — 8-digit rules, optional-empty, country-code
  rejection
- `extractOmanLocalPhone` — legacy `"Name · +968 9111 1111"` parsing (QA #3 back-compat),
  returns `""` rather than junk
- `isValidDob` — rejects calendar-invalid dates that pass the regex (`2026-02-31`,
  `2025-02-29`), accepts real leap days, rejects future dates
- `signInSchema` / `signUpSchema` — **client password policy must match the backend's
  `validatePassword`**, else signup fails server-side after submission; terms literal;
  8-digit phone

### 3.4 Localization & RTL (`src/i18n/__tests__/i18n.test.tsx` — 10 tests)

- Instant en↔ar switch **in the same render tree** — the proof that runtime RTL needs no
  app restart (`isRTL` context, native layout kept LTR)
- `dir`/`isRTL` flip, interpolation in both catalogs, missing-key → raw-key fallback
- **Western numerals in Arabic locked in** — `utils/format.ts` documents this as a product
  decision; the test makes a "fix" to Arabic-Indic digits a failing build
- **Catalog integrity:** every EN key exists in AR, no orphaned AR keys, and identical
  `{placeholder}` sets per key. A missing AR key silently ships the raw key string
  (e.g. `queue.title`) to Arabic users — this is the check that prevents it.

### 3.5 Theme (`src/theme/__tests__/ThemeProvider.test.tsx` — 9 tests)

- system/light/dark resolution, explicit preference overriding the OS, null OS scheme
- guard error when used outside the provider
- **palette parity** — dark defines every role light does (a missing role renders
  `undefined`, which RN treats as transparent = invisible text)

### 3.6 Queue contract (`src/data/__tests__/queueMapping.test.ts` — 17 tests)

The MediLink↔HAMS seam (`QUEUE_BACKEND_FOR_MEDILINK.md`). Guards two regression classes:
a payload field rename silently mapping to `undefined`, and anyone starting to compute
queue values on the client.

- Full-payload mapping for waiting / called / done, null doctor (reception walk-in)
- **ETA passthrough** — server says 47 while `people_ahead × avg` would be 30; 47 must win.
  If this fails, someone has begun computing ETA client-side — a contract violation.
- Zero ETA preserved (not falsy-coalesced away); `position` and `peopleAhead` kept distinct
- `queueReasonFrom` — code passthrough, both auth spellings collapsed, status 0 → `offline`
  (not "server error"), body code preferred over HTTP status

### 3.7 Queue polling (`queuePolling.test.ts` — 12 tests)

The correctness floor behind realtime.

- Interval ladder 10/30/60s, stops at `done`, never faster than 10s
- **Monotonicity** — never polls slower as the patient gets closer
- `shouldRetryQueue` — terminal reasons never retried; transient retried twice

### 3.8 Integration — Queue Status (`queueFlow.integration.test.ts` — 12 tests)

Real repository, **only the HTTP transport mocked** (`ApiError` stays the real class so the
production `instanceof` branch is genuinely exercised).

- Calls **only** `GET /api/patients/me/queue-status`, id URL-encoded
- Envelope → domain mapping; every contract error code → correct UI reason
- Transport failure (status 0) → `offline`; a `200` body reporting `success:false` honoured
- Acknowledge POSTs the exact body; failures are **never swallowed** (no false confirmation)

### 3.9 Integration — Book Appointment (`bookingFlow.integration.test.ts` — 15 tests)

- **`book_appointment_atomic` does not throw on business failure** — it resolves with
  `{success:false, error:CODE}`. Treating that as success would show "booked!" for a slot
  never taken. Asserted for `SLOT_TAKEN`, `OUTSIDE_BOOKING_WINDOW`, `ALREADY_BOOKED`,
  `DOCTOR_UNAVAILABLE`.
- Success with no appointment id → throws rather than navigating to a success screen
- Non-UUID `forFamilyMemberId` dropped (would otherwise fail the whole booking)
- Cancel refusal surfaced (no false "cancelled"); check-in sends profile name/phone

---

## 4. Coverage

Scoped to the modules the suite protects — presentation helpers and i18n-bound label
formatters are excluded by design.

| Module | Stmts | Rationale |
|---|---|---|
| `data/queueMapping.ts` | **100%** | HAMS contract seam — threshold-locked at 100% |
| `hooks/queries/queuePolling.ts` | **100%** | staleness floor — threshold-locked at 100% |
| `utils/notifications.ts` | 94% | routing |
| `utils/validation.ts` | 73% | untested remainder is `resetSchema` wiring |
| `utils/format.ts` | 100% | — |
| `utils/appointments.ts` | 39% | untested remainder is i18n-bound date/label formatting |
| `utils/payments.ts` | 40% | untested remainder is `payStatusLabel`/`payTone` (i18n + theme) |
| **Scoped total** | **~69%** | |

`shared/src/config/payments.ts` **is** covered by the money suite but cannot appear in the
report — it lives outside `rootDir`.

Global floor: 55%. Deleting a test fails the build.

---

## 5. What automation cannot cover

### 5.1 Manual functional QA
See [`MANUAL_QA_CHECKLIST.md`](./MANUAL_QA_CHECKLIST.md) — 18 areas.

### 5.2 Staging security gates (**must run before any public build**)

| Gate | Assertion |
|---|---|
| Guest-mode RLS | anon **can** read discovery/availability; **denied** on every patient table/RPC |
| Queue cross-tenant | as Patient A, `get_my_queue_position('<B's appointment>')` ⇒ `{"found":false,"reason":"forbidden"}` |
| Storage buckets | `patient-docs`, `lab-results`, `account_image` reject cross-patient reads |
| Bundle secrets | only `EXPO_PUBLIC_*` present; no service-role key |

### 5.3 Device testing
See [`DEVICE_TEST_CHECKLIST.md`](./DEVICE_TEST_CHECKLIST.md).

---

## 6. Known constraints affecting testing

| Constraint | Effect |
|---|---|
| **Queue staff transitions unbuilt (HAMS)** | `called`/`done` are unreachable in a real environment. Those states are testable only via the mock data source, which simulates the full progression. |
| **Push credentials missing (APNs/FCM)** | End-to-end delivery cannot be tested at all yet. |
| **`EXPO_PUBLIC_DATA_MODE` unset ⇒ mock** | A build with no env silently uses seeded fake data. Every manual pass **must** begin by confirming the data mode. |
| **Thawani defaults to UAT** | Payment tests hit sandbox unless `THAWANI_CHECKOUT_BASE_URL` is set. |
| No iOS hardware | iOS validation is entirely outstanding. |

---

## 7. CI recommendation

Not yet wired. Minimum gate on every PR:

```bash
npm run typecheck        # all 4 workspaces — must exit 0
cd mobile && npm run lint
npm test
```

`typecheck` is not redundant with `test`: Babel strips types, so Jest cannot catch type
errors. During authoring, `tsc` caught a test fixture missing a required contract field
that all 155 tests happily passed — **keep both gates**.

Note `lint` currently fails in `backend`/`frontend` for a pre-existing, environmental
reason (`next lint` deprecated, no ESLint config → interactive prompt). Gate on
`mobile`'s lint only until that is migrated.

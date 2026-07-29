# MediLink — Integration & Merge Strategy Audit

**Scope:** `main`, `satyam/mobile/ui`, PR #1 (`ios` → `main`), PR #2 (`ios` → `satyam/mobile/ui`), `merge/vartika-ui` (latest web/backend).
**Method:** `git fetch` of all branches and both PR heads, ancestry analysis (`git merge-base`), a non-destructive merge simulation (`git merge-tree --write-tree`), line-by-line diffing of every conflicting file across all three merge stages, and live verification against the actual Supabase project (same credential/method used in the prior `MOBILE_BACKEND_DEPLOYMENT_AUDIT.md`).
**Nothing was modified, merged, committed, or pushed.** All git operations below are read-only (`fetch`, `diff`, `merge-base`, `merge-tree`, `show`, `ls-tree`) plus temporary local refs that were deleted at the end.
**Date:** 2026-07-07

---

## 0. Critical finding up front — this reframes several conclusions from the prior deployment audit

Reading PR #1's actual file list revealed that Ayush's `ios` branch **replaces the mobile app's entire navigation foundation**: it swaps `satyam/mobile/ui`'s React Navigation v6 + empty `screens/` scaffold for **Expo Router** (`expo-router: ~6.0.0`, `"main": "expo-router/entry"`) with a real, file-based routing tree under `mobile/app/` containing **~55 real screens** covering the full patient journey (auth, dashboard, doctor search, booking, payments, records, labs, prescriptions, AI, notifications, settings). It also bumps Expo SDK **51 → 54**, sets `eas.json` build profiles (dev/preview/production) that didn't exist before, populates `extra.eas.projectId` (was empty), and changes the iOS bundle identifier to `com.inzint.medilink` (was `com.medilink.app`) — which strongly suggests this is genuinely the (or very close to the) source of the already-existing TestFlight build, since bundle-id changes like that are normally only made to match an already-provisioned App Store Connect app.

**This resolves several blockers flagged in the prior `MOBILE_BACKEND_DEPLOYMENT_AUDIT.md`** ("no product screens," "`eas.json` doesn't exist," "EAS project ID empty," "`EXPO_PUBLIC_BACKEND_URL` env mismatch" — this branch renames the convention to `EXPO_PUBLIC_API_URL` consistently, so the mismatch doesn't reoccur). That audit was accurate against `satyam/mobile/ui`/`main` at the time; it does not apply to `ios`. I'm stating this plainly rather than silently updating the old document, since you should know the earlier "no screens exist" finding is now superseded by real, evidenced work.

---

## 1. Branch Topology

```
main (5740ce7b)
  │
  ├──→ satyam/mobile/ui (2037638c)         [main IS an ancestor — clean linear descendant]
  │       │
  │       └──→ ios  (956fae89)             [satyam/mobile/ui IS an ancestor — clean linear descendant]
  │              ▲              ▲
  │              │              │
  │           PR #1          PR #2
  │        (base: main)  (base: satyam/mobile/ui)
  │        259 files       5 files
  │        +31595/-7688    +280/-8
  │
  └──→ merge/vartika-ui (current, pushed, HEAD)     [main IS an ancestor — NOT yet merged to main]
          18 commits ahead of vartikaweb's common ancestor; contains all P0 fixes +
          Phase 1 payment-notification work from this engagement.
```

**Decisive fact: PR #1 and PR #2 are the exact same commit.** Both report `headRefOid: 956fae89cefb9ba63de4bfe3c3f7fe90ff70d799`, from the same fork (`ayush-inzint/medilink`, branch `ios`). PR #2 (base `satyam/mobile/ui`) shows only 5 files changed because `ios` is a **clean linear continuation** of `satyam/mobile/ui` — confirmed via `git merge-base --is-ancestor origin/satyam/mobile/ui ios` returning true. PR #1 (base `main`) shows 259 files changed because that diff necessarily also includes everything `satyam/mobile/ui` already added on top of `main`.

**Practical consequence: there is nothing to "merge twice."** Merging `ios` (equivalently, PR #1) once brings in 100% of `satyam/mobile/ui` and 100% of PR #2's content in a single operation. Treating PR #1 and PR #2 as two separate merge steps (as the proposed workflow diagram does) is redundant — PR #2 is a strict subset of PR #1's commit.

Other web-adjacent branches, for completeness: `satyam/web-dynamic` is an ancestor of `merge/vartika-ui` (fully subsumed, no action needed). `vartikaweb` is **not** an ancestor of `merge/vartika-ui` — it diverges 2 commits ("payment history," "fixed add family member") that touch `dashboard/payments/page.tsx`, `dashboard/profile/page.tsx`, `dashboard/find-doctors/page.tsx`, etc. I inspected both: they're early, much smaller versions of files that `merge/vartika-ui` has since substantially rebuilt (e.g. a 433-line standalone payment-history page vs. `merge/vartika-ui`'s fully backend-integrated payments page from this engagement). These 2 commits are **superseded**, not additive — `merge/vartika-ui`'s versions should win outright; `vartikaweb` doesn't need to be merged anywhere.

---

## 2. Conflict Analysis

I ran `git merge-tree --write-tree origin/merge/vartika-ui ios` (real 3-way merge simulation, non-destructive). Out of 259 mobile-side files and 93 web-side files changed relative to `main`, exactly **3 files overlap**, and the merge simulation confirms all 3 as genuine conflicts:

```
CONFLICT (add/add):   Medilink/backend/src/app/api/payments/verify/route.ts
CONFLICT (content):   Medilink/package-lock.json
CONFLICT (content):   Medilink/shared/src/api/appointments.ts
```

### 2.1 `backend/src/app/api/payments/verify/route.ts` — trivial, auto-resolvable in intent (not by git, but by inspection)

**Why it conflicts:** This file doesn't exist in `main` at all (confirmed: `git ls-tree main -- .../verify/route.ts` returns nothing). Both lineages independently invented the same file path after diverging — hence git reports `add/add`, not a content conflict against a shared ancestor.

**Can git auto-merge?** No — `add/add` conflicts always require manual resolution; git has no base version to three-way-diff against.

**What's actually different:** I diffed both versions directly. They are **structurally identical** except that the web version (`merge/vartika-ui`) has the Phase 1 payment-notification fix layered on top — an extra import, `patient_id` added to the select, and an 18-line block that calls `notifyPaymentSuccess()` after a payment is confirmed via this fallback path. Every other line (Thawani session check, `getAal2UserOrThrow`, status updates, `buildRecap`) is byte-identical between the two.

**Which should win:** **Web's version, wholesale.** It is a strict superset of mobile's — mobile's version is simply this file *without* the notification fix (i.e., predates that work). There is no competing logic to reconcile.

**Why:** Keeping mobile's version would silently regress the exact bug fixed and verified in the previous session (patients not being notified when payment finalizes via this fallback path instead of the webhook).

### 2.2 `Medilink/package-lock.json` — mechanical, resolve by regenerating

**Why it conflicts:** Both branches ran `npm install` independently after diverging, producing different dependency-resolution snapshots (expected whenever two branches add different packages — mobile added `expo-router`, bumped `expo` 51→54 and related Expo packages; web added nothing to root deps in this period).

**Can git auto-merge?** No, lockfiles are almost never cleanly 3-way-mergeable at the text level.

**Which should win:** Neither — **delete the conflicted file and run `npm install` fresh** once the source-code merge (§2.1, §2.3) is resolved. This is standard practice for lockfiles; hand-merging JSON lockfile internals is not worth the effort and risks producing an internally-inconsistent file.

### 2.3 `Medilink/shared/src/api/appointments.ts` — substantive, requires a real decision

**Why it conflicts:** Both sides modified overlapping lines/regions of the same pre-existing file (unlike §2.1, this file *does* exist in `main`), so this is a genuine content conflict, not an artifact of independent invention.

**Can git auto-merge?** No — the changes touch the same functions (`cancelAppointment`, `rescheduleAppointment`) and the same import line, so a textual 3-way merge cannot resolve it automatically.

**What each side actually changed**, verified by diffing all three stages (base = `main`, ours = web, theirs = mobile):

| Change | Web (`merge/vartika-ui`) | Mobile (`ios`) |
|---|---|---|
| `LIST_SELECT` doctor join | adds `specialty` | adds `specialty` **and** `fees` (superset of web's change) |
| New `getAppointment(db, id)` | — | ✅ added — fetch a single appointment by id, scoped to caller. Pure addition, no risk. |
| `cancelAppointment()` | unchanged (still calls `cancel_appointment_safe` RPC directly, resolving `p_user_id` via `getCurrentUserId`) | **rewritten** to call a new RPC, `cancel_my_appointment`, described in-code as "SECURITY DEFINER, checks ownership against auth.uid()" |
| `rescheduleAppointment()` | unchanged (calls `reschedule_appointment_atomic`) | **rewritten** to call a new RPC, `reschedule_my_appointment`; drops the `skipCutoff` (staff-only override) parameter entirely |
| New `checkInAppointment()` | — | ✅ added — calls a new RPC, `checkin_my_appointment` (this is a real implementation of the "Web Check-in" feature flagged as **missing** in the earlier `WEB_FEATURE_CONNECTION_AUDIT.md`) |
| New `rpcLoose()` helper | — | ✅ added — a well-reasoned utility working around a genuine supabase-js gotcha (calling `db.rpc` via a detached reference loses its `this` binding and throws). Documented with a clear comment explaining the exact failure mode. |

**I verified live against the actual Supabase project (same one both `backend/.env.local` and `mobile/.env` point to) whether the three new RPCs exist:**

```
cancel_my_appointment      → PGRST202: function not found in schema cache
reschedule_my_appointment  → PGRST202: function not found in schema cache
checkin_my_appointment     → PGRST202: function not found in schema cache
```

I also searched every migration file `ios` adds (6 new ones) and every migration already in the repo — **none of them define these three functions.** They exist only as client-side calls right now.

**Which should win, and why — this needs to be a hybrid, not a pick-one:**
- **Keep mobile's additions** (`getAppointment`, `checkInAppointment`, `rpcLoose`, the fuller `LIST_SELECT`) — all additive, all safe, `checkInAppointment` fills a real, previously-documented product gap.
- **Do NOT merge mobile's rewritten `cancelAppointment`/`rescheduleAppointment` as-is** — they call RPCs that don't exist anywhere yet. Merging this naively would **break cancellation and rescheduling for every user, web and mobile alike**, the moment this code path is exercised, with a runtime `PGRST202` error.
- **Correct resolution:** keep web's existing `cancelAppointment`/`rescheduleAppointment` (calling the RPCs that are confirmed live and working) until `cancel_my_appointment`/`reschedule_my_appointment`/`checkin_my_appointment` are actually written and migrated. Mobile's architectural direction here (a `SECURITY DEFINER` wrapper that resolves the true owner internally, rather than trusting a caller-supplied `p_user_id`) is a **good idea** — it's the same pattern I recommended in `NOTIFICATION_IMPLEMENTATION_PLAN.md §0.5` for an analogous problem — but it's not deployable yet. Note also that mobile's `rescheduleAppointment` rewrite silently drops `skipCutoff` support; if that's used anywhere (staff override), that's a second reason not to adopt it wholesale without first porting that capability into the new RPC design.
- Net effect: this file needs a genuine hand-merge, not a "take theirs"/"take ours" shortcut.

### 2.4 Cross-cutting finding that is *not* a git conflict, but matters more than the ones that are

Reading `shared/src/api/notifications.ts` (which `ios` modifies but `merge/vartika-ui` never touches in this repo state, so git sees **zero conflict**) revealed that mobile's version assumes a **different data model** for notification preferences than what I confirmed live during the prior notification investigation:

- Documented/assumed-by-web model: a separate `notification_preferences` table (created via the additive migration `20260620000002_notification_preferences.sql`, referenced throughout `NOTIFICATION_IMPLEMENTATION_PLAN.md`).
- Mobile's model: a `notification_prefs` **JSONB column directly on `profiles`**, with an explicit code comment: *"There is NO separate `notification_preferences` table."*

I checked both against the live database directly:

```
notification_preferences table  → exists, but returns [] (present, unused/empty)
profiles.notification_prefs     → exists AND already has real data:
                                   {"sms": true, "push": true, "email": true, "whatsapp": false}
```

**Both storage mechanisms exist simultaneously in the live database.** The JSONB column already has real data in it; the table appears to have never been written to. This is genuine duplicated/conflicting product architecture, not just code — two people independently built two different homes for the same feature. Since git won't flag this (no file overlap), it will **not surface during the mechanical merge** and could easily ship as two half-working preference systems unless someone decides which one is canonical before Phase 2 notification work (or mobile's settings screen) is built out further. I'm flagging this because it's the kind of gap a conflict-only analysis misses entirely — it's not something for me to unilaterally decide, but it needs an explicit decision from you before more code is built on either model.

Also additive and clean in the same file: mobile adds a full "Facility Messages" feature (`listFacilityMessages`/`markFacilityMessagesRead` against `announcements`/`announcement_reads`/`muted_facilities`) — I confirmed all three tables exist live with real data already in `announcements`. Safe to bring in as-is.

### 2.5 Other new `shared/` modules from mobile — additive, no conflict, low risk

- `shared/src/api/payments.ts` (new) — read-only payment history queries, correctly scoped through appointment ownership, explicitly defers checkout creation to the backend. Clean, no risk.
- `shared/src/api/specialties.ts` (new) — reads a `specialties` table. **Verified live: the table exists and is already seeded** (General, Pathology, Radiology, …), confirming the migration behind it (`20260701000002_specialties.sql`) is already applied to the shared project even though it isn't in `main`'s or `merge/vartika-ui`'s migration folder yet.
- `shared/src/api/labs.ts` — modified by mobile; `shared/src/types/supabase.ts` — listed as changed but the actual diff is empty (no-op, likely a line-ending/mode artifact — not a concern).
- `shared/src/mobile.ts` — mobile adds flat type re-exports (`FamilyMember`, `MyProfile`, etc.) so screens can import domain types directly. Purely additive, doesn't conflict with web (web never touches this file).

I also checked whether `ios`'s **other 5 new migrations** are already live: `20260701000003_lab_results_analytes.sql`'s column (`lab_results.analytes`) does **not** exist live yet — that one is still pending, unlike the specialties migration.

---

## 3. Development Branch Strategy — evaluation

**Verdict: yes, create the `development` branch. It's the right call here, with one correction to your proposed sequence.**

Why it's appropriate for this specific situation (not a generic endorsement of permanent Git-Flow-style branching):
- `main` currently has **none** of this work — not the mobile rebuild, not the web/backend integration work, not the payment notification fix. Three substantial, independently-evolved lines of work need to converge before anything is production-safe.
- One of the three real conflicts (§2.3) requires a genuine engineering decision (what to do about the three not-yet-deployed RPCs) and one cross-cutting issue (§2.4) requires a genuine product decision (which preferences model wins). Neither should block or destabilize `main` while being worked out.
- You explicitly want a deploy-and-QA cycle (dev backend, TestFlight, bug fixing) before anything touches production — that is exactly what an integration/staging branch is for.

**Correction to the proposed sequence:** don't merge PR #1 *and* PR #2 as two steps — they're the same commit (§1). Merge `ios` (or PR #1) once.

**One structural suggestion:** treat `development` as a **temporary integration branch for this stabilization push**, not a permanent parallel-to-main fixture. Long-lived `develop` branches (classic Git Flow) are a well-known, valid pattern, but they only stay healthy with active discipline about periodically syncing back to `main`; left indefinitely parallel, they accumulate drift the same way `vartikaweb` already has relative to `merge/vartika-ui`. For this specific job — reconcile three diverged lines, stabilize, ship — spin it up, use it hard, merge it back, and reassess your branching model for what comes *after* this release rather than committing to "development exists forever" today.

---

## 4. Exact Merge Sequence

```
1. git checkout main && git pull
2. git checkout -b development

3. git merge ios          # (equivalently: merge PR #1's branch)
   → brings in satyam/mobile/ui + all of Ayush's Expo Router rebuild in one shot
   → expect ZERO conflicts here: development is fresh off main, and ios's only
     relationship to main is a clean forward line (verified via merge-base)

4. git merge origin/merge-vartika-ui    # "latest web": all P0 fixes + Phase 1 payment
                                          notification work from this engagement
   → expect exactly 3 conflicts, resolved per §2.1–§2.3:
     a. backend/.../payments/verify/route.ts  → take web's version wholesale
     b. package-lock.json                      → delete, then `npm install` fresh
     c. shared/src/api/appointments.ts         → hand-merge (keep web's cancel/
        reschedule calling the LIVE RPCs; keep mobile's getAppointment/
        checkInAppointment/rpcLoose/fuller LIST_SELECT as additions; do NOT
        adopt mobile's cancel_my_appointment/reschedule_my_appointment calls
        until those RPCs actually exist)

5. npm install                             # regenerate the lockfile cleanly
6. npm run typecheck                       # confirm the hand-merge didn't break types
7. Resolve the notification-preferences model decision (§2.4) before/alongside
   step 8 if any preferences UI work is planned during this QA cycle.
8. Push development; deploy backend from it; point EAS dev/preview build's
   EXPO_PUBLIC_API_URL at the deployed backend; QA.
9. Once stable → merge development → main.
```

Mobile-first, web-second is deliberate: step 3 is guaranteed clean (verified), so any merge conflicts you hit are isolated to step 4 — you're never debugging two unrelated conflict sets at once.

---

## 5. Deployment Readiness (development branch, once merged per §4)

Re-assessed against the prior `MOBILE_BACKEND_DEPLOYMENT_AUDIT.md`, several previously-identified gaps are now resolved by `ios`; what's genuinely still missing:

| Item | Status once `development` is assembled |
|---|---|
| Mobile product screens | ✅ Resolved — ~55 real screens via Expo Router, from `ios` |
| `eas.json` build profiles | ✅ Resolved — `ios` includes dev/preview/production profiles |
| EAS `projectId` | ✅ Resolved — populated in `ios`'s `app.json` |
| Mobile env var naming mismatch | ✅ Resolved — `ios` consistently renames to `EXPO_PUBLIC_API_URL` throughout, matching its own `.env.example` |
| Backend hosting | ❌ **Still missing** — no Dockerfile/CI/hosting config exists anywhere in any branch; you still need to choose and stand up a host for `backend/` (see prior audit §7–§10 for exact build/run commands) |
| `INVITE_SECRET` env var | ❌ **Still missing** — push dispatch route still rejects every call without it |
| `cancel_my_appointment` / `reschedule_my_appointment` / `checkin_my_appointment` RPCs | ❌ **Still missing** — must be written and migrated before mobile's intended cancel/reschedule/check-in architecture can actually be adopted; until then, the merged file keeps calling the existing working RPCs (§2.3) |
| Notification preferences model | ⚠️ **Undecided** — table vs. JSONB column both exist live with no reconciliation (§2.4) |
| `lab_results.analytes` migration | ⚠️ Pending — not yet applied to the live project |
| EAS "production" profile defaults to `EXPO_PUBLIC_DATA_MODE=mock` | ⚠️ Needs updating for a real dev/staging build — currently even the production build profile ships mock data by default |
| Security gaps in existing backend routes (unauthenticated symptom-check, no webhook signature verification, invoice IDOR, plaintext OTP) | ❌ Still present, unrelated to this merge, documented in the prior audit — fine for a closed dev/QA cycle, must be fixed before any real production exposure |

**Bottom line:** the `development` branch, once assembled per §4, would contain everything needed to deploy a dev backend and connect a real, feature-complete mobile build for QA — the remaining gaps are (a) picking a host and standing up the backend (infrastructure work, not a merge issue), (b) a handful of env vars, and (c) two decisions (RPC completion, preferences model) that are genuinely yours to make, not mine to resolve unilaterally.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Adopting mobile's `cancelAppointment`/`rescheduleAppointment` rewrite wholesale would silently break cancel/reschedule everywhere | Hand-merge per §2.3 — verified live that the new RPCs don't exist; keep the working calls |
| Two live notification-preferences storage mechanisms already diverging | Decide canonical model before further preferences UI work lands on either side (§2.4) |
| Expo SDK jump (51→54) bundled with the navigation rewrite is a large, coupled change | Test on a real device early in the QA cycle — this isn't a small dependency bump, it's a foundation change that was (presumably) validated together in `ios`, so don't cherry-pick pieces of it |
| `rescheduleAppointment`'s `skipCutoff` (staff override) support is silently dropped in mobile's rewrite | Confirm whether anything currently relies on it before eventually adopting the new RPC design; port the capability into the new RPCs if so |
| EAS "production" profile ships `EXPO_PUBLIC_DATA_MODE=mock` by default | Add/confirm a distinct profile (or override) for the actual dev/QA build pointed at the real dev backend |
| `vartikaweb`'s 2 unmerged commits could be mistakenly thought "missing" later | They're confirmed superseded by `merge/vartika-ui`'s later, fuller rebuilds of the same files — no action needed, just don't merge `vartikaweb` separately |
| iOS bundle identifier (`com.inzint.medilink`) vs Android (`com.medilink.app`) mismatch in `ios`'s `app.json` | Confirm this is intentional (matching an already-provisioned App Store Connect app) rather than an oversight, before relying on it for submission |

---

## 7. Final Recommendation

1. **Create `development` off `main`.** This is the right call for this specific consolidation, not a generic long-term branching commitment — revisit the branching model once this release stabilizes.
2. **Merge `ios` once** (it already contains everything `satyam/mobile/ui` and PR #2 would add — don't merge PR #2 separately, it's the identical commit).
3. **Merge `merge/vartika-ui` second**, resolving the 3 real conflicts exactly as detailed in §2: web's version wins for `verify/route.ts`, regenerate `package-lock.json`, hand-merge `shared/src/api/appointments.ts` (keep mobile's additions, keep web's working cancel/reschedule calls, don't adopt the three not-yet-deployed RPCs).
4. **Before considering the branch QA-ready**, get explicit decisions on: the notification-preferences model (§2.4), whether/when to actually build the three missing patient-wrapper RPCs, and confirm the EAS production profile's mock-data default is intentional.
5. **Ignore `vartikaweb`** — its unique commits are superseded.
6. Once `development` is stable through QA, merge it to `main` — at that point the standard "which is closer to done" question disappears, since both lineages will have been reconciled into one tree.

This is a clean integration overall: only 3 files textually conflict out of 350+ changed across both lineages, and two of those three resolve almost mechanically. The one substantive conflict and the one cross-cutting architecture question are both real, both well-evidenced above, and both are decisions worth making deliberately rather than resolving automatically by "picking a side."

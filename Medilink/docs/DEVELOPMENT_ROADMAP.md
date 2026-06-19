# MediLink — Development Roadmap

Where the project is and what's next. Grounded in the actual repo state (see [MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md)).

## Current status
```
[██████████] Monorepo foundation        DONE
[██████████] Backend migration (HAMS)    DONE   (36 routes, 25 libs)
[██████████] Shared API layer            DONE   (13 modules, 49 fns, typecheck ✓)
[██████████] Supabase integration        DONE   (123 migrations, 13 edge fns, RPCs)
[██████████] App foundations (web+mobile) DONE   (providers/theme/i18n/auth/nav — no screens)
[░░░░░░░░░░] Web UI screens               TODO
[░░░░░░░░░░] Mobile UI screens            TODO
[░░░░░░░░░░] Push validation on device    TODO
[░░░░░░░░░░] End-to-end testing           TODO
[░░░░░░░░░░] Production deployment         TODO
```

### Completed
- **Monorepo** — `backend/ frontend/ shared/ mobile/ supabase/ scripts/ docs/`, npm workspaces, path aliases, `npm install` clean (no peer conflicts), `npm run typecheck` exit 0 across all 4 workspaces.
- **Backend migration** — 36 privileged Next.js routes + 25 lib files migrated from HAMS verbatim; imports deduped to `@medilink/shared`. See [API_CATALOG.md](./API_CATALOG.md) §B, [BACKEND_MODULES.md](./BACKEND_MODULES.md).
- **Shared API layer** — `shared/src/api/*`: auth, profile, family, doctors, favourites, facilities, appointments, records, labs, prescriptions, notifications, reviews. Web + mobile share these. See [API_COMPLETION_REPORT.md](./API_COMPLETION_REPORT.md).
- **Supabase integration** — reused project; 121 reused + 2 additive migrations; 13 Edge Functions; patient RPCs wired; typed `Database`.
- **App foundations** — web (App Router, Tailwind, theme, EN/AR i18n, SSR+browser Supabase, auth context, middleware) and mobile (Expo, React Navigation v6, theme, i18n, SecureStore Supabase, auth context, push scaffolding). No product screens. See [FOUNDATION_REPORT.md](./FOUNDATION_REPORT.md).

### Remaining
1. **Mobile UI** — build screens against `@medilink/shared/mobile` + the typed navigators in `mobile/src/navigation/types.ts` (Auth + App tab stacks). No raw queries in screens.
2. **Web UI** — build App Router pages/components against `@medilink/shared`; wire protected route prefixes already gated in `frontend/src/lib/supabase/middleware.ts`.
3. **Push integration validation** — verify Expo token registration → `device_tokens` → backend dispatch → real FCM/APNs delivery on physical devices; set EAS `projectId`.
4. **End-to-end testing** — unit tests for `shared/src/api/*`, route tests for `backend/`, e2e (Playwright web / Detox or Maestro mobile). See [TESTING_GUIDE.md](./TESTING_GUIDE.md).
5. **Production deployment** — host web + backend (separate Next deployables), configure prod env + webhook URLs (Thawani/Stripe), EAS builds + store submission, Supabase prod linkage.

## Suggested sequencing
| Phase | Work | Depends on |
|---|---|---|
| **P1** | Web auth + core screens (login, home, doctor search, facility, booking) | shared API ✓ |
| **P1** | Mobile auth + core screens (same flows) | shared API ✓ |
| **P2** | Records, labs, prescriptions, notifications, reviews screens (both platforms) | P1 |
| **P2** | Payments UI (Thawani checkout + return handling) | P1, backend ✓ |
| **P3** | Push validation on devices; AI assist UI | P1 |
| **P3** | Test suites (unit → route → e2e) | P1–P2 |
| **P4** | Production deploy (web/backend hosting, EAS, prod webhooks, monitoring) | P1–P3 |

## Known follow-ups / tech debt
- Drop the `Database` augmentation in `shared/src/types/index.ts` once `device_tokens` + `notification_preferences` are pushed and `npm run db:types` regenerated.
- Re-evaluate the `payments/webhook` `as never` RPC cast after confirming the SQL function's true nullability.
- Confirm storage RLS for `patient-docs` / `lab-results` allows owner-scoped signed URLs (else route those via backend).
- Add a `patient_insurance` flow if/when product defines it (no HAMS precedent).
- Consider re-enabling `noUncheckedIndexedAccess` in `backend/` after auditing the migrated routes.

## Definition of "ready for production"
- [ ] Web + mobile core flows implemented and manually verified per [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- [ ] Push verified on iOS + Android physical devices
- [ ] Automated tests green in CI
- [ ] Prod env configured; Thawani/Stripe webhooks pointed at prod backend
- [ ] Supabase prod linked; migrations applied; Edge Functions deployed
- [ ] EAS builds submitted; web/backend deployed

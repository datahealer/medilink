# MediLink — Runbook

Exact commands to install, configure, and run every part of MediLink. Commands run from the repo root unless stated. Requires **Node ≥ 20** and **npm ≥ 10**; for Supabase work install the **Supabase CLI**; for mobile install the **Expo / EAS** tooling.

## 0. Prerequisites
```bash
node -v        # must be >= 20
npm -v         # >= 10
git --version
# Supabase CLI (pick one):
npm i -g supabase            # or: scoop install supabase / brew install supabase/tap/supabase
supabase --version
```

## 1. Install
```bash
git clone <repo-url> medilink && cd medilink
npm install                  # installs ALL workspaces (root lockfile), generates package-lock.json
```
Mobile native modules must match the Expo SDK — after install:
```bash
cd mobile && npx expo install && cd ..
```

## 2. Configure `.env`
Copy the template and fill values. The template lists every key with PUBLIC/SECRET tags.
```bash
cp .env.example .env
```
Minimum to boot **web + shared data layer** (read-only browsing & auth):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
Minimum to boot **mobile**:
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_BACKEND_URL=http://<your-LAN-ip>:3001
```
Required additionally for **backend** privileged features:
```
SUPABASE_SERVICE_ROLE_KEY=...        # SECRET
THAWANI_BASE_URL=... THAWANI_API=... THAWANI_API_KEY=... THAWANI_SECRET_KEY=... THAWANI_PUBLISHABLE_KEY=...
STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REDIRECT_URI=...
GEMINI_API_KEY=... GROQ_API_KEY=... MOCK_AI=true   # MOCK_AI=true avoids real AI keys in dev
EMAIL_USER=... EMAIL_PASS=... EMAIL_FROM=...
INVITE_SECRET=...                    # any strong random string; guards push dispatch
```
> Next.js reads `.env` / `.env.local`. Per-workspace `.env.local` (e.g. `frontend/.env.local`, `backend/.env.local`) also works and is gitignored. **Never commit real values.** Mobile only ever sees `EXPO_PUBLIC_*`.

## 3. Run the apps
Each app runs independently (separate ports). Open a terminal per app.
```bash
# Web (Next.js) — http://localhost:3000
npm run dev:frontend

# Backend API (Next.js) — http://localhost:3001
npm run dev:backend

# Mobile (Expo) — opens Metro + QR
npm run dev:mobile        # or: cd mobile && npm start
```
Build / typecheck / lint:
```bash
npm run build:frontend       # next build (frontend)
npm run build:backend        # next build (backend)
npm run build:shared
npm run typecheck            # all workspaces (must be exit 0)
npm run lint
```

## 4. Connect Supabase
MediLink reuses the existing project (no schema fork). Link the CLI to it:
```bash
supabase login
supabase link --project-ref <your-project-ref>   # found in Supabase dashboard URL
```
Verify connectivity:
```bash
supabase projects list
supabase migration list                            # local vs remote migration state
```

## 5. Regenerate DB types
After any schema change, regenerate the typed `Database` so the shared API stays type-safe:
```bash
npm run db:types
# = supabase gen types typescript --linked 2>/dev/null > shared/src/types/supabase.ts
npm run typecheck            # confirm nothing broke
```
> The `2>/dev/null` suppresses the CLI's "new version" notice so it can't corrupt the generated file. The two additive tables (`device_tokens`, `notification_preferences`) are merged into `Database` in `shared/src/types/index.ts`; once they exist remotely and you regenerate, you can drop that augmentation.

## 6. Run migrations
MediLink ships **123 migrations** (121 reused + 2 additive). Apply pending ones to the linked project:
```bash
supabase migration list      # see what's pending
npm run db:push              # = supabase db push   (applies pending migrations)
```
The two MediLink-specific additive migrations:
```
supabase/migrations/20260620000001_device_tokens.sql
supabase/migrations/20260620000002_notification_preferences.sql
```
Create a new additive migration (never edit existing ones):
```bash
supabase migration new <descriptive_name>     # writes a new timestamped file in supabase/migrations/
# edit it, then:
npm run db:push && npm run db:types
```
Deploy/serve Edge Functions:
```bash
supabase functions deploy <name>             # e.g. send-booking-confirmation
supabase functions serve <name>              # run locally
```

## 7. Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| `npm install` peer conflict on `react-native-screens` | React Navigation v7 needs screens ≥4 (SDK 52+) | Keep **React Navigation v6** + `react-native-screens@3.31.1` (already pinned). Don't use `--force`/`--legacy-peer-deps`. |
| `tsc` parse error in `shared/src/types/supabase.ts` | CLI "new version" notice leaked into the file | Re-run `npm run db:types` (script now strips stderr); remove any trailing non-TS lines. |
| `Cannot find module '@/...'` in mobile at runtime | Metro ignores tsconfig `paths` | Aliases live in `mobile/babel.config.js` (`module-resolver`). Clear cache: `cd mobile && npx expo start -c`. |
| `Missing required public env var` thrown on boot | env accessor (`src/lib/env.ts`) failing fast | Set the named `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` var in `.env`. |
| Backend route: missing `groq-sdk`/`googleapis`/`bcryptjs`/`nodemailer`/`chrono-node` | optional runtime dep not installed | They're declared in `backend/package.json`; run `npm install`. |
| `window`/`document` not found in `tsc` | DOM lib missing | App tsconfigs set `lib: ["ES2022","DOM","DOM.Iterable"]` — confirm you didn't override it. |
| RLS "permission denied" on a query | not authenticated, or row not owned | Ensure a valid session; confirm `patient_profiles` row exists for the user. |
| Mobile can't reach backend | `localhost` from device ≠ your machine | Set `EXPO_PUBLIC_BACKEND_URL` to your machine's LAN IP, not `localhost`. |
| `supabase db push` does nothing | already linked elsewhere / no pending | `supabase migration list`; `supabase link` to the right ref. |
| Push token returns null | running on simulator/emulator | Use a physical device; set EAS `projectId` in `mobile/app.json`. |
| AI route 500 with no key | real Gemini/Groq key absent | Set keys, or `MOCK_AI=true` to stub responses in dev. |

## 8. One-shot bring-up (happy path)
```bash
npm install && (cd mobile && npx expo install)
cp .env.example .env       # fill values
supabase login && supabase link --project-ref <ref>
npm run db:push && npm run db:types
npm run typecheck
# three terminals:
npm run dev:backend
npm run dev:frontend
npm run dev:mobile
```

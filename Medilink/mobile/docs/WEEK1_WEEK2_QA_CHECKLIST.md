# Week 1 + Week 2 QA Checklist

Scope: real auth (Week 1) + dashboard / profile / medical history / family (Week 2). Booking,
payments, records, labs, prescriptions, notifications, AI, ratings, settings are **Week 3+** and
out of scope. Run against a reachable HAMS/staging backend with **non-production** test accounts.

## Environments / devices
- [ ] Android emulator (Expo Go) smoke test — `npx expo start`, press `a`.
- [ ] Android **physical device** via Expo Go (SDK 54) — QR scan; `EXPO_PUBLIC_API_URL` = LAN IP/staging, not `localhost`.
- [ ] Android tablet (or resized emulator) — 768px portrait and 1024px landscape.
- [ ] iPhone + iPad via EAS development build (when Apple credentials available).

## Auth (Week 1) — real backend
- [ ] Sign up → auto sign-in → OTP screen → verify → lands on Dashboard.
- [ ] OTP wrong code shows `errors.otpInvalid`; expired shows `errors.otpExpired`; ≥5 attempts shows `errors.otpTooMany`.
- [ ] OTP **Resend** works after the 24s timer; shows confirmation.
- [ ] Sign in with valid creds → Dashboard; invalid creds → `errors.invalidCredentials`.
- [ ] Network offline → `errors.network` on sign in / sign up (no crash).
- [ ] Server/5xx → `errors.server`.
- [ ] Forgot password → "check your email" confirmation (real email sent).
- [ ] Reset password screen without a recovery session → `errors.recoverySession` (honest BLOCKED state).
- [ ] Google button is **disabled** with "not configured" copy (no fake success).
- [ ] **Session restore:** kill & relaunch while signed in → splash → Dashboard (no re-login).
- [ ] **Logout:** Dashboard → sign out → returns to Sign In; relaunch stays signed out; query cache cleared.
- [ ] **Deep-link guard:** navigating to `/dashboard` / `/family` while signed out redirects to Sign In.
- [ ] No tokens / OTP codes / passwords appear in logs.

## Dashboard
- [ ] Greeting + name + avatar render from the real profile.
- [ ] Next-visit card shows an upcoming appointment **or** a polished empty state (API-dependent).
- [ ] Quick actions: Profile, Family, Medical History navigate; "coming soon" tiles are disabled.
- [ ] Search field is display-only (no discovery UI).

## Profile + Medical history
- [ ] Loading / error / empty / success states all render (toggle network to verify).
- [ ] Edit profile saves name, phone, DOB, gender, blood group, address, emergency contact.
- [ ] Profile photo: pick image → uploads → new photo shows; permission denial handled.
- [ ] Medical history: add/remove allergies, conditions, medications, surgeries; smoking + notes save and persist.

## Family
- [ ] List shows "You" (primary) + members; active indicator matches the switcher.
- [ ] Add member (name + relation required); validation errors show.
- [ ] Edit member saves; Remove asks for confirmation, then removes.
- [ ] Removing the active member falls back to primary.
- [ ] Switch active patient → selection persists across relaunch.
- [ ] Max 5 members guard (Add disabled at limit).

## Bilingual + theming (every screen)
- [ ] English LTR and **Arabic RTL** — mirrored nav, chevrons, alignment; numerals/text correct.
- [ ] Light and Dark themes (follow system + manual).
- [ ] Switching language prompts restart (RTL applies after reload).

## Responsive / layout (every screen)
- [ ] Phone 360px & 412px — single centred column, no overflow.
- [ ] iPhone SE & modern iPhones — safe-area insets correct (notch / Dynamic Island).
- [ ] Tablet 768 portrait / 1024 landscape & iPad portrait/landscape — content centred with max width; forms ≤ ~520px; dashboard grid uses extra columns; nothing stretched.
- [ ] Keyboard avoidance on all forms; no fixed heights break with keyboard/notch/rotation.
- [ ] 44×44 min touch targets; text scaling (large font) without overflow/clipping.
- [ ] Platform-safe shadows on cards (iOS shadow / Android elevation).

## Commands
- [ ] `npm install` clean.
- [ ] `npm run typecheck` → 0 errors.
- [ ] `npm run lint` → 0 errors.
- [ ] `npx expo-doctor` → 17/18 (the 1 failure is the known mixed-React monorepo duplicate; harmless for Expo Go).
- [ ] `npx expo start` boots; Android bundle builds.

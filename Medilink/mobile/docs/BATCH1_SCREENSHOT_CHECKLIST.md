# Batch 1 — Android screenshot checklist (for approval)

I cannot capture device screenshots from my environment, so please capture these on your
Android phone in **Expo Go** and send them back. Until you approve, every Batch-1 screen
stays **BUILT BUT INCOMPLETE** in `FULL_SCREEN_INVENTORY.md`.

## One-time setup
1. `cd D:\Medilink\Medilink\mobile`
2. Confirm `.env` has `EXPO_PUBLIC_DATA_MODE=mock` and `EXPO_PUBLIC_APP_ENV=development`.
3. `npx expo start` → scan the QR in Expo Go (same Wi-Fi, or `--tunnel`).
4. At Sign In, type **demo@medilink.test** / **Demo1234!** → lands on Dashboard.
5. **Fastest path:** on the Dashboard, tap the **grid icon** (top-right, dev-only) to open the
   **Screen Gallery**, then open any screen directly. (It only appears in development.)
6. Toggle **dark mode** with the moon/sun control; switch to **Arabic** via Settings → Language
   (the app will prompt a restart to apply RTL).

## What to capture
Columns: **Route** · **Mock state** · **Theme** · **Language** · **Compare to PDF** · **Send?**

| # | Route / how to open | Mock data state | Theme | Lang | Compare to PDF | Send? |
|--:|---|---|---|---|---|---|
| 1 | `/splash` (app launch) | session restoring | Light | EN | p10 Splash (mark + wordmark + tagline + progress) | ✅ |
| 2 | `/welcome` | first run | Light | EN | p10 Welcome (hero, Create account, "I already have an account" link) | ✅ |
| 2b | `/welcome` | — | Dark | AR | p42/p54 Welcome | ✅ |
| 3 | `/onboarding` | 3 slides | Light | EN | p11 Onboarding (Me-circle illustration, dots, Next/Skip) | ✅ |
| 4 | `/language` | — | Light | EN | p11 Language (EN/AR cards + Continue) | ✅ |
| 5 | `/auth/sign-in` | — | Light | EN | p12 Sign In (email/password, remember, **Google + Apple**) | ✅ |
| 5b | `/auth/sign-in` | — | Dark | AR | p42/p54 Sign In (RTL mirrored) | ✅ |
| 6 | `/auth/sign-up` | — | Light | EN | p12 Sign Up (name/email/phone/**single password**/terms) | ✅ |
| 7 | `/auth/otp` | from sign-up (any) | Light | EN | p13 OTP (6 cells, resend timer) | ✅ |
| 8 | `/auth/forgot-password` → reset | — | Light | EN | p13 Forgot / Reset (strength meter) | ✅ |
| 9 | `/dashboard` (Home tab) | Aisha + 1 upcoming + recents/featured | Light | EN | p14 Dashboard (Me Care Hub + Customize, Upcoming w/ Check-in+Reschedule, specialties, **Recents & Featured**) | ✅ |
| 9b | `/dashboard` | scroll to Recents & Featured | Light | EN | p14 Recents & Featured | ✅ |
| 9c | `/dashboard` | — | Dark | AR | p44/p56 Dashboard (RTL) | ✅ |
| 11 | `/profile` (Profile tab) | Aisha profile + history | Light | EN | p15 Personal Information (stats, emergency, conditions, allergies; **gear top-right**, no sign-out) | ✅ |
| 11b | `/profile` | — | Dark | EN | p46 Profile | ✅ |
| 12 | `/edit-profile` (Profile → Edit) | prefilled | Light | EN | p15 Edit Profile (photo, name, blood group, DOB, **allergy chips**) | ✅ |
| 13 | `/me` (Me tab) | Aisha + 3 members | Light | EN | p16 Me Family (primary Active, members, Add member; **no switch link**) | ✅ |
| 14 | `/family/add` (Me → +) | empty form | Light | EN | p16 Add member (**"Add a Me profile" Me-mark**, relation chips) | ✅ |
| 15 | `/family/{id}` (tap a member) | member prefilled | Light | EN | p17-style member edit (Save/Remove) | optional |
| 16 | `/patient-switcher` (Gallery) | Aisha + members | Light | EN | p17 Switch profile (radio + Continue as …) | optional |
| 49 | `/settings` (Profile → gear) | account | Light | EN | p34 Settings (Preferences, Account & data, **Sign out** + Delete) | ✅ |
| 49b | `/settings` | — | Dark | EN | p46 Settings | optional |
| 16p | `/search` (Search tab) | preview | Light | EN | p17 (this is the PDF-styled **preview**, not the final build) | ✅ |
| 37p | `/records` (Records tab) | preview | Light | EN | p28 Me Vault (**preview**) | ✅ |
| 0 | `/dev/screen-gallery` (grid icon) | lists all 50 | Light | EN | n/a — confirms all 50 are reachable | ✅ |

## Bottom navigation
On any tab (Dashboard/Search/Me/Records/Profile), confirm the **bottom nav**: Home · Search ·
**raised Me submark** · Records · Profile (compare PDF p14–16). Capture once in Light + once in Dark.

## Also sanity-check while you're in there
- No text clipping / vertical button labels (you flagged the old Edit "E/d/i/t" bug).
- Safe-area: bottom nav clears the gesture bar; headers clear the notch/status bar.
- Arabic: layout mirrors, the raised Me submark stays centered.

Send the ✅ rows (EN-Light set + the Dark/AR representatives). If anything looks off vs the PDF,
note the screen # and I'll fix it before we mark it `BUILT AND MATCHES`.

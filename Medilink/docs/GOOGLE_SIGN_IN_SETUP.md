# Google Sign-In — architecture and configuration

Status: **Web live · Android code-complete (needs one env var) · iOS deliberately off.**
Apple Sign-In is tracked separately and is **not** covered here.

---

## 1. One architecture per platform, never mixed

| Platform | Flow | Entry point |
|---|---|---|
| **Web** | `supabase.auth.signInWithOAuth({provider:"google"})` → Google → Supabase `/auth/v1/callback` → `${origin}/auth/callback` → `exchangeCodeForSession` | `frontend/src/lib/supabase/client.ts` |
| **Android** | Google Play Services SDK → **ID token** → `supabase.auth.signInWithIdToken` | `mobile/src/services/googleAuth.ts` |
| **iOS** | same as Android, **currently disabled** — see §5 | same |

Mobile uses **no** browser, `expo-auth-session`, `expo-web-browser`, or deep link. The
ID-token call is plain HTTPS carrying a token Google already signed, so there is no
redirect URI to register, nothing to add to Supabase's redirect allow-list, and no
`medilink://` auth route in Expo Router. The app has no auth deep-link handler and does
not need one. (`medilink://` *is* used, but only for Thawani payment returns.)

> **Google Calendar sync is a different feature.** `backend/src/app/api/auth/google/*`
> performs its own OAuth with `scope=…/auth/calendar` and stores tokens in
> `user_integrations`. It shares nothing with login and must keep its own OAuth client —
> merging them would make patients approve calendar access just to sign in.

---

## 2. Which client ID goes where

Google issues three clients. They are **not** interchangeable.

| Client | Used by | In Supabase "Client IDs"? | In mobile env? |
|---|---|---|---|
| **Web** | web OAuth **and** the Android ID-token audience | ✅ yes | ✅ `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| **iOS** | iOS ID-token audience | ✅ yes (when iOS ships) | ✅ `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| **Android** | nothing in code | ❌ **no** | 🟡 declared, read by nothing |
| **Web client SECRET** | web OAuth code exchange | ✅ "Client Secret" field | 🚫 **never** |

The two counter-intuitive points, both of which cause silent failures:

1. **Android configures `webClientId`, not the Android client ID.** Play Services returns
   an ID token whose `aud` claim is the *Web* client. The Android OAuth client still has
   to exist — Google matches it by package name + SHA-1 to authorise the request — but its
   ID is never named in code or in Supabase.
2. **The Android client ID must NOT be added to Supabase.** It never appears in any `aud`
   claim, so listing it achieves nothing and misleads the next reader.

Client IDs are **public** (they appear in every OAuth request and in the decoded token).
The client **secret** is not, and lives only in the Supabase dashboard.

---

## 3. Supabase configuration

*Authentication → Providers → Google*

```
Client IDs:     <WEB_CLIENT_ID>            ← add ,<IOS_CLIENT_ID> when iOS ships
Client Secret:  <web client secret>        ← dashboard only, never in the repo
Skip nonce check: OFF
```

*Authentication → URL Configuration*

```
Site URL:       https://<PRODUCTION_FRONTEND_URL>

Redirect URLs:  https://<PRODUCTION_FRONTEND_URL>/auth/callback
                https://<PRODUCTION_FRONTEND_URL>/reset-password
                http://localhost:3000/auth/callback
                http://localhost:3000/reset-password
```

- `/reset-password` is required by `frontend/src/app/(auth)/forgot-password/page.tsx`.
  Omit it and password reset silently falls back to Site URL.
- **No `medilink://` entry** — the native flow does not redirect.
- **No `**` wildcard.** `next` is caller-supplied and reaches `redirectTo`; the allow-list
  is a control, not a convenience.

*Google Cloud → Web client → Authorized redirect URIs* must contain
`https://zojrwuvxrkmgnlwyuypg.supabase.co/auth/v1/callback`.

---

## 4. Android

- Package: **`com.medilink.app`** (`mobile/app.json` → `android.package`)
- Requires `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Without it the button is **hidden**, not
  disabled — a dead control is worse than none.
- **No Expo config plugin is needed.** In non-Firebase mode the
  `@react-native-google-signin/google-signin` plugin does exactly one thing: register the
  iOS URL scheme. Android is handled by autolinking. Adding the plugin would force us to
  supply an `iosUrlScheme` we deliberately do not have yet.
- **SHA-1 fingerprints — the #1 cause of `DEVELOPER_ERROR` (code 10).** All three must be
  registered on the Android OAuth client, because each signs a different build:

  | Keystore | Where builds come from | Get it with |
  |---|---|---|
  | EAS upload/release | `eas build -p android` | `eas credentials -p android` |
  | **Play App Signing** | anything installed from the Play Store | Play Console → Setup → App integrity |
  | Debug | local dev-client builds | `eas credentials -p android`, debug section |

  Registering only the EAS key produces the classic "works for us, broken for every real
  user" bug.

---

## 5. iOS — intentionally disabled

`isGoogleConfigured` is false on iOS until `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set, so
no Google button renders there.

**This is a release safeguard, not an oversight.** App Store Guideline 4.8 makes *Sign in
with Apple* mandatory as soon as a third-party social login ships on iOS. Apple Sign-In is
not implemented, so enabling Google on iOS today would get the build rejected.

To enable it later, all four steps are required — the env var alone is not enough:

1. Ship Apple Sign-In first.
2. Set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (mobile `.env` + **both** `eas.json` files).
3. Add the config plugin to `mobile/app.json`, using the **reversed** iOS client ID:
   ```json
   ["@react-native-google-signin/google-signin",
    { "iosUrlScheme": "com.googleusercontent.apps.<IOS_CLIENT_ID>" }]
   ```
4. Add the iOS client ID to Supabase → Providers → Google → Client IDs, and rebuild
   natively.

---

## 6. Account linking and duplicate patients

**We implement no linking logic of our own.** Supabase links a Google identity to an
existing user when the provider's verified email matches an existing **confirmed** email;
otherwise it creates a new user. No email-guessing, no merging.

Why that is safe here:

- Linking attaches an identity to the existing `auth.users` row. No row is inserted, so
  the `on_auth_user_created_hams` trigger does not fire and **no second
  `patient_profiles` row is created**. Existing records stay attached to the existing
  patient.
- New Google users go through the same trigger as email signups: role is **forced to
  `patient`** regardless of metadata, and `trg_profiles_privileged_columns` blocks any
  client-side change to `role`/`status`/`facility_id`.
- Onboarding is enforced *after* authentication, on the DOB-null signal, on both
  platforms — `mobile/app/(app)/_layout.tsx` and `frontend/src/app/auth/callback/route.ts`.
  A social login cannot skip setup, Civil Number, or consent.

⚠️ **Unresolved edge case:** if the existing account's email is **unverified**, Supabase
does not auto-link, and `profiles.email` carries a case-insensitive UNIQUE index plus
`NOT NULL`. The second profile insert then fails with an opaque database error rather
than a friendly message. Not reachable through the normal signup flow (which confirms by
OTP), but worth knowing before support triages it.

---

## 7. Environment variables

| Variable | Required | Where | Secret |
|---|---|---|---|
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | ✅ Android **and** iOS | `mobile/.env` + both `eas.json` | No |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS only (hold back — §5) | same | No |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | ❌ read by nothing | documentation only | No |
| Web client ID + secret | ✅ web | **Supabase dashboard only** | Secret: yes |

There are **no** `NEXT_PUBLIC_*` or backend variables for Google login. Web OAuth is
brokered entirely by Supabase; a browser copy of the client ID would be redundant and the
secret must never reach the bundle.

> ⚠️ **Two `eas.json` files exist** (`Medilink/eas.json` and `Medilink/mobile/eas.json`).
> Whichever directory `eas build` runs from wins. Keep the Google client ID in sync across
> both, or one profile ships without it.

---

## 8. Tests

| Suite | Covers |
|---|---|
| `mobile/src/services/__tests__/googleAuth.test.ts` | success, cancel (both SDK shapes), double-tap, Play Services missing, `DEVELOPER_ERROR`, missing ID token, Supabase rejection, unconfigured platform, non-Error throw, sign-out account clearing |
| `mobile/src/config/__tests__/googleConfig.test.ts` | per-platform gate, including the iOS 4.8 safeguard regression |
| `mobile/src/utils/__tests__/safeNext.test.ts` | redirect allow-listing (open-redirect defence) |

Run: `cd mobile && npm test`

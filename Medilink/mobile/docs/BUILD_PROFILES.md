# Build profiles — which one to use, and why it matters

`eas.json` defines four profiles. Picking the wrong one produces a build that looks fine and
tests the wrong thing, so this file records what each one actually ships.

## The `isDev` cliff

`src/config/env.ts` derives everything from one line:

```ts
export const isDev = env.APP_ENV !== "production";
```

`APP_ENV` is `"production"` in **only** the `production` and `production-apk` profiles. In every
other profile `isDev` is true, and that changes the app in ways a tester will not necessarily
notice:

| | `isDev === true` | `isDev === false` (production) |
|---|---|---|
| Dashboard header | shows an extra **"Open dev Screen Gallery"** button | button absent |
| `/dev/screen-gallery`, `/dev/design-system-preview` | reachable | redirect to `/splash` |
| Sentry | `debug: true`, verbose console output | quiet |
| Sentry `environment` tag | `"staging"` / `"development"` | `"production"` |

So a `preview` build is **not** a production-representative build. Any release-candidate sign-off
has to run on `production` or `production-apk`.

Note that `DATA_MODE` is *not* part of this difference: `src/data/index.ts` selects
`DATA_MODE === "mock" ? mockRepositories : hybridRepositories`, so `staging` and `production` use
the identical data layer. The EAS `preview` and `production` environments also both point
`EXPO_PUBLIC_API_URL` at the real backend and the real Supabase project. `staging` versus
`production` is therefore a *labelling and gating* difference, not a different backend — despite
what the `envGuard.js` error text implies.

## The profiles

### `development`
Dev client (`developmentClient: true`), needs Metro running to load JS. For debugging on a real
device, not for QA sign-off.

### `preview`
Internal distribution, `APP_ENV=staging`. Android → APK. **iOS → simulator only**
(`ios.simulator: true`), so it cannot be installed on an iPhone at all. Useful for quick shares;
not valid for release testing, per the table above.

### `production`
`APP_ENV=production`, `autoIncrement: true`, and store distribution (the default). This is the
profile for real releases.

- Android → **AAB**. Correct for Play Store, but an AAB is not directly installable on a device;
  it needs `bundletool` to turn into APKs first.
- iOS → **store IPA**. Cannot be sideloaded. It can only reach a device through TestFlight or the
  App Store, both of which mean uploading to App Store Connect.

### `production-apk`
`extends: "production"` — identical env, identical `APP_ENV=production`, identical
`autoIncrement` — but `distribution: "internal"` and `android.buildType: "apk"`.

This exists so a **production-configured build can be installed directly on a physical Android
device** for manual QA. It is the profile to use for device testing; `preview` is not, because of
the `isDev` differences.

Use it for Android only. Its `distribution: "internal"` also applies to iOS, where "internal"
means ad-hoc — which requires every test device's UDID to be registered with Apple first
(`eas device:create`). With no devices registered, an ad-hoc iOS build installs nowhere.

It also sets `"environment": "production"` explicitly, and that line is load-bearing. EAS picks
the **server-side environment** whose name matches the profile, and only a profile literally named
`production` gets the `production` environment — anything else silently falls back to `preview`.
The first run of this profile logged `Resolved "preview" environment for the build`. Nothing was
wrong with that build, because the inline `env` block inherited from `production` overrides
environment values ("The values from the build profile configuration will be used"), and the two
environments happen to hold identical values today. But it meant the profile's correctness
depended entirely on that duplicated block: delete it as redundant — which it looks like — and the
profile would quietly build against `preview` with `APP_ENV` unset. Declaring the environment
removes that trap.

## Getting a build onto a physical device

**Android** — one step:

```bash
cd mobile
npx eas build --platform android --profile production-apk
```

Download the `.apk` from the build page and install it. Requires "install from unknown sources"
on the device.

**iOS** — there is no sideload path; pick one:

1. **Ad-hoc.** `npx eas device:create` (interactive — it produces a link/QR to open *on the
   iPhone*, which registers that device's UDID with Apple), then build with an internal-
   distribution profile. Only registered devices can install the result.
2. **TestFlight.** Build with `production`, then `npx eas submit --platform ios --profile
   production`. This uploads to App Store Connect. Internal TestFlight testing needs no Apple
   review, but it is still an upload to Apple and should not happen without explicit sign-off.

Building an IPA is not the same as submitting one — `eas build` alone publishes nothing.

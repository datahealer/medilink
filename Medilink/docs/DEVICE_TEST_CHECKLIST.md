# MediLink Mobile — Device Test Checklist

**Version:** 1.0 · **Date:** 2026-07-28
Companion: [`TEST_PLAN.md`](./TEST_PLAN.md) · [`MANUAL_QA_CHECKLIST.md`](./MANUAL_QA_CHECKLIST.md)

**Current status: no MediLink build has ever run on physical hardware.** Everything here is
outstanding. This document covers what can *only* be verified on a real device — simulators
cannot produce push tokens, real APNs/FCM delivery, true thermal/battery behaviour, or
authentic camera and biometric hardware.

---

## 1. Device matrix

Minimum for release. iOS hardware is not currently available — that is a launch blocker in
its own right, since `supportsTablet: true` means Apple **will** review on iPad.

| # | Device | OS | Role | Priority | Status |
|---|---|---|---|---|---|
| D1 | iPhone (notched, e.g. 13/14/15) | latest iOS − 1 | primary iOS | **Critical** | ☐ |
| D2 | iPhone SE (small screen) | latest iOS | layout stress / small viewport | High | ☐ |
| D3 | iPad | latest iPadOS | **required by App Review** (`supportsTablet: true`) | **Critical** | ☐ |
| D4 | Android flagship (Pixel/Samsung) | Android 14/15 | primary Android | **Critical** | ☐ |
| D5 | Android budget (≤ 4 GB RAM) | Android 12/13 | performance floor | High | ☐ |
| D6 | Android tablet | Android 13+ | responsive layout | Medium | ☐ |
| D7 | Older iPhone (e.g. iPhone 8/X) | oldest supported iOS | perf + non-notch | Medium | ☐ |

Record for each: model, OS version, build number, data mode, date, tester.

---

## 2. Pre-conditions (must all be true before device testing starts)

| ☐ | Item | Why it blocks |
|---|---|---|
| ☐ | `EXPO_PUBLIC_DATA_MODE=staging`/`production` in the build | Otherwise the app runs on seeded fake data and the pass is worthless |
| ☐ | `EXPO_PUBLIC_APP_ENV=production` | Otherwise dev routes are reachable |
| ☐ | Backend deployed at an HTTPS origin reachable from mobile data (not just Wi-Fi) | Cleartext/LAN URLs will not work off-network |
| ☐ | APNs key uploaded via `eas credentials` | No iOS push without it |
| ☐ | FCM credentials configured | No Android push without it |
| ☐ | `aps-environment` entitlement present | APNs registration fails without it |
| ☐ | Thawani production checkout host set | Otherwise payments hit UAT |
| ☐ | A real test patient with an appointment | Needed for booking/queue paths |
| ☐ | **A staff account able to call patients** (HAMS) | `called`/`done` queue states are otherwise unreachable |

---

## 3. Install & launch

| ☐ | Case | D1 | D3 | D4 | D5 |
|---|---|---|---|---|---|
| ☐ | Fresh install succeeds | ☐ | ☐ | ☐ | ☐ |
| ☐ | App icon correct on home screen (not a default/placeholder) | ☐ | ☐ | ☐ | ☐ |
| ☐ | **Splash screen** — note the blank white flash (no native splash configured) | ☐ | ☐ | ☐ | ☐ |
| ☐ | Cold start < 3 s on flagship, < 6 s on budget | ☐ | ☐ | ☐ | ☐ |
| ☐ | Upgrade over a previous build keeps the session | ☐ | ☐ | ☐ | ☐ |
| ☐ | No crash in the first 60 s | ☐ | ☐ | ☐ | ☐ |

---

## 4. Push notifications — device-only

The client is complete; this section validates infrastructure. **Every row here is blocked
until APNs/FCM credentials exist.**

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Permission prompt appears | Native dialog, once, after sign-in |
| ☐ | Push token obtained on a **real device** | Simulators return null by design |
| ☐ | Token row written to `device_tokens` | Correct `user_id` + platform |
| ☐ | Delivery — app foreground | In-app banner |
| ☐ | Delivery — app background | System notification, correct icon + colour |
| ☐ | Delivery — **app killed** | Still delivered |
| ☐ | Tap routing — appointment | Correct screen |
| ☐ | Tap routing — **queue → live queue** | Not the appointment detail |
| ☐ | **Cold-start tap** (killed → tap → launch) | Routes correctly after auth resolves |
| ☐ | Badge count | Increments/clears sensibly |
| ☐ | Opt-out honoured | No push after disabling in settings |
| ☐ | Sign out → sign in as another user | Previous user's pushes stop on this device |
| ☐ | Multiple devices, one account | Both receive |
| ☐ | Notification icon (Android) | Not a white square — **no notification icon asset is configured** |

---

## 5. Payments on device

Use a real card in a controlled window. WebView checkout is the newest high-risk path.

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Checkout opens in the in-app WebView | Thawani page renders, scrolls, keyboard usable |
| ☐ | **Successful payment** | Redirect intercepted → `confirmed` + `paid`; success screen |
| ☐ | **Cancel from the Thawani page** | Slot freed; back to summary |
| ☐ | **Hard-close the WebView mid-payment** | Slot freed (immediately or via the TTL sweep) |
| ☐ | Lose network mid-payment | No double charge; recoverable |
| ☐ | Backgrounded during payment → return | State recovers; verification poll resumes |
| ☐ | Webhook lag | Auto-poll confirms within ~18 s, else manual retry works |
| ☐ | Invoice opens on device | PDF renders/downloads |
| ☐ | Refund after cancel | Reflected in payment history |
| ☐ | Arabic locale during checkout | App chrome RTL; Thawani page in its own locale |
| ☐ | No card data persisted | Nothing in app storage or device logs |

---

## 6. Queue on device

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Check in at the clinic | Queue screen opens with a real position |
| ☐ | Position updates live (realtime) | Decreases with no interaction |
| ☐ | Lock the phone 5 min → unlock | Immediate refetch; position correct, not stale |
| ☐ | Background 30 min → foreground | Refetch on resume |
| ☐ | Kill app → reopen | Correct current position |
| ☐ | **Staff calls the patient** | Called state appears; **vibration fires**; push received |
| ☐ | Acknowledge "on my way" | Reception sees it; UI confirms only after the backend responds |
| ☐ | Poor connectivity in a clinic basement | Falls back to polling; staleness banner shown |
| ☐ | Airplane mode | Last-known state; **ETA not counting down** |
| ☐ | Reconnect | Recovers without a manual refresh |
| ☐ | Two devices, same patient | Both converge on the same position |
| ☐ | Consultation completed | Done state; queue leaves the dashboard |
| ☐ | Battery over a 45-min wait | No excessive drain from polling/socket |

---

## 7. Camera & media (hardware)

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Camera permission prompt | Meaningful purpose string (currently the Expo generic default) |
| ☐ | Capture a document | Image uploads and appears in the vault |
| ☐ | Deny camera → retry | Graceful path to settings |
| ☐ | Photo library pick | Works |
| ☐ | Large image (>10 MB) | Compressed/handled, no OOM |
| ☐ | Profile photo capture | Appears immediately |
| ☐ | Prescription scan (AI) | Text extracted from a real photo |
| ☐ | Rotate while camera open | No crash |

---

## 8. Platform-specific behaviour

### iOS

| ☐ | Case |
|---|---|
| ☐ | Safe areas correct on a notched device (no content under the notch/home indicator) |
| ☐ | Keyboard avoidance on long forms (sign-up, medical history) |
| ☐ | Swipe-back gesture works, and is disabled on payment-success |
| ☐ | Dynamic Type at largest setting |
| ☐ | VoiceOver end-to-end |
| ☐ | No unused permission prompts (FaceID / microphone must **not** appear) |
| ☐ | Background app refresh behaviour sane |
| ☐ | iPad: layout uses the tablet max-width, no stretched phone UI |
| ☐ | iPad: rotation both ways |
| ☐ | iPad: split view / slide over does not break layout |

### Android

| ☐ | Case |
|---|---|
| ☐ | Hardware back button on every screen (never exits unexpectedly) |
| ☐ | Edge-to-edge rendering correct with gesture nav |
| ☐ | Deep link via custom scheme |
| ☐ | **Maps render** — blocked: placeholder Google Maps API key |
| ☐ | TalkBack end-to-end |
| ☐ | No microphone permission requested (currently declared but unused) |
| ☐ | Battery-optimised/doze mode still receives push |
| ☐ | Budget device: list scrolling stays smooth |
| ☐ | Rotation on tablet |

---

## 9. Network conditions (real radio, not simulated)

| ☐ | Condition | Expected |
|---|---|---|
| ☐ | Strong Wi-Fi | Baseline |
| ☐ | 4G/5G mobile data | All flows work (confirms the API URL is publicly reachable) |
| ☐ | Weak 3G | Loading states, no infinite spinners |
| ☐ | Wi-Fi → mobile handoff mid-request | Recovers |
| ☐ | Captive portal Wi-Fi | Clear failure, not a hang |
| ☐ | Airplane mode | Offline banner + cached reads |
| ☐ | Airplane on→off | Auto-refetch |
| ☐ | VPN active | Works |

---

## 10. TestFlight / Play internal track

| ☐ | Case |
|---|---|
| ☐ | Build uploads and processes without warnings |
| ☐ | Install from TestFlight succeeds |
| ☐ | Permission strings read correctly in the store listing |
| ☐ | Push works on the store build (**not just the dev client**) |
| ☐ | Version/build number correct |
| ☐ | No debug UI, dev gallery, or console spam |
| ☐ | Crash-free across a full smoke pass |
| ☐ | Play internal track install |
| ☐ | Data Safety form matches the permissions actually requested |

---

## 11. Sign-off

| Device | OS | Build | Data mode | Tester | Date | Result | Defects |
|---|---|---|---|---|---|---|---|
| D1 iPhone | | | | | | ☐ pass ☐ fail | |
| D2 iPhone SE | | | | | | ☐ pass ☐ fail | |
| D3 iPad | | | | | | ☐ pass ☐ fail | |
| D4 Android flagship | | | | | | ☐ pass ☐ fail | |
| D5 Android budget | | | | | | ☐ pass ☐ fail | |
| D6 Android tablet | | | | | | ☐ pass ☐ fail | |
| D7 Older iPhone | | | | | | ☐ pass ☐ fail | |

**Device sign-off requires:** D1, D3 and D4 fully passed, plus push delivery and a real
payment round-trip verified on at least one iOS and one Android device.

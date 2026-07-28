# MediLink Mobile — Manual QA Checklist

**Version:** 1.0 · **Date:** 2026-07-28
Companion: [`TEST_PLAN.md`](./TEST_PLAN.md) · [`DEVICE_TEST_CHECKLIST.md`](./DEVICE_TEST_CHECKLIST.md)

Legend: `☐` not run · `☑` pass · `✗` fail (log a defect) · `⊘` blocked (state the blocker)

---

## ⚠️ PRE-FLIGHT — do this first, every single pass

A build with no environment configuration **silently runs on seeded fake data**
(`EXPO_PUBLIC_DATA_MODE` defaults to `mock`), and the dev screen gallery becomes reachable
(`EXPO_PUBLIC_APP_ENV` defaults to `development`). Testing a mock build proves nothing.

| ☐ | Check | Expected |
|---|---|---|
| ☐ | Confirm data mode | `EXPO_PUBLIC_DATA_MODE=staging` (or `production`) — **never `mock`** |
| ☐ | Confirm app env | `EXPO_PUBLIC_APP_ENV=production` for release candidates |
| ☐ | Patient identity is real | The signed-in patient is **not** "Aisha Al Harthy" (the mock seed) |
| ☐ | Backend reachable | `EXPO_PUBLIC_API_URL` resolves from the device; a booking list loads |
| ☐ | Dev routes blocked | `medilink://dev/screen-gallery` and `medilink://dev/design-system-preview` do **not** open |
| ☐ | Thawani host | `THAWANI_CHECKOUT_BASE_URL` = production host if testing real payment |
| ☐ | Build identifiers | version/build number match the candidate under test |

---

## 1. Authentication & session

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Sign up (valid) | Account created; OTP sent; profile-setup gate appears |
| ☐ | Sign up — weak password | Inline errors match backend policy (8+, upper, lower, number, special) |
| ☐ | Sign up — duplicate email | Clear, non-enumerating error |
| ☐ | Sign up — phone not 8 digits | Rejected inline |
| ☐ | Sign up — terms unchecked | Submit blocked |
| ☐ | Email OTP verify | Correct code proceeds; wrong code errors; resend works |
| ☐ | Sign in (valid) | Lands on dashboard |
| ☐ | Sign in — wrong password | Generic failure, no account enumeration |
| ☐ | Google sign-in | Button visibly **disabled** (intentionally unconfigured) |
| ☐ | **Forgot password** | Email arrives. **KNOWN GAP:** completing the reset needs a deep link that is not configured — confirm the flow is either hidden or clearly explained |
| ☐ | Session persists | Force-quit → reopen → still signed in |
| ☐ | Token refresh | Leave app backgrounded > 1h → return → data loads without a 401 |
| ☐ | Sign out | Session cleared; push token removed; cached PHI purged |
| ☐ | Sign out → back button | Cannot return to an authed screen |
| ☐ | Profile-setup gate | New patient with no DOB is forced through `/setup`; existing patients pass straight through |
| ☐ | Account deletion | Request succeeds; 30-day grace communicated |

## 2. Guest mode

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Browse as guest | Dashboard, Search, doctor profiles, specialties, map, appearance all reachable |
| ☐ | Protected route as guest | Sign-in wall shown **in place** — Back still works, stack intact |
| ☐ | Protected action as guest | Book/favourite/notifications prompt for sign-in |
| ☐ | Guest → sign-up mid-booking | Booking intent resumes after auth; slot re-validated |
| ☐ | Deep link into a protected route as guest | Redirected to sign-in, no data leak |

## 3. Onboarding & navigation

| ☐ | Case | Expected |
|---|---|---|
| ☐ | First launch | Splash → onboarding → language → welcome |
| ☐ | Language picker | Choice persists across restart |
| ☐ | Tab bar | Never appears on splash/onboarding/auth/OTP/reset |
| ☐ | Detail screens | Push full-screen without the tab bar |
| ☐ | Filters sheet | Opens as a bottom sheet with detents + grabber |
| ☐ | Back behaviour | Hardware/gesture back never lands on a stale or dead screen |
| ☐ | Payment-success screen | Swipe-back disabled; cannot re-enter the payment flow |

## 4. Patient profile, family, medical history

| ☐ | Case | Expected |
|---|---|---|
| ☐ | View/edit profile | Changes persist and re-render |
| ☐ | Profile photo | Camera + library both work; image appears immediately |
| ☐ | Civil number | 8 digits accepted; 7 or 9 rejected; empty allowed |
| ☐ | Emergency contact | Legacy `"Name · +968 …"` value parses into the phone field |
| ☐ | Add/edit/remove family member | List updates |
| ☐ | Medical history | Allergies/conditions/medications save and reload |
| ☐ | Patient switcher | Booking scope switches correctly |

## 5. Doctor search, clinics, favourites

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Search by name/specialty | Relevant results |
| ☐ | Filters | Applied and clearable |
| ☐ | Doctor profile | Fees, specialty, reviews, availability |
| ☐ | Clinic detail | Address, hours, doctors |
| ☐ | Favourite/unfavourite | Persists across restart |
| ☐ | Empty search | Empty state, not a spinner or crash |

## 6. Booking

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Slot list | Only genuinely available slots; taken slots absent |
| ☐ | Booking window | Only today → +6 days offered |
| ☐ | Book for self | Confirmed |
| ☐ | Book for family member | Correct patient on the appointment |
| ☐ | Reason for visit | Saved and shown on the appointment |
| ☐ | **Slot taken concurrently** | Clear "slot no longer available" — **never** a false success |
| ☐ | Double-tap Confirm | Exactly one appointment created |
| ☐ | Reschedule | New slot applied; old slot freed |
| ☐ | Cancel > 48h | Full refund stated |
| ☐ | Cancel 24–48h | 50% stated |
| ☐ | Cancel < 24h | 10% stated |
| ☐ | Cancel after start | No refund stated |
| ☐ | Refund amounts | Match the displayed policy percentages exactly |

## 7. Payments & invoices

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Amount shown | fee + 5% VAT, 3 dp; matches the amount charged |
| ☐ | Checkout opens | Thawani hosted page in the in-app WebView |
| ☐ | **Successful payment** | Redirect intercepted → appointment `confirmed` + `paid` |
| ☐ | **Cancelled payment** | Slot freed; back to summary |
| ☐ | **Hard-close mid-payment** | Slot freed (immediately or by the TTL sweep) |
| ☐ | Payment timeout | "Try again" offered; no orphaned pending hold |
| ☐ | Auto-poll | Verifies every 3s, max 6 attempts, stops on paid |
| ☐ | Invoice | Generates and opens; appears in the vault |
| ☐ | Invoice retry | Manual regenerate works when generation failed |
| ☐ | Payment history | Correct statuses and tones |
| ☐ | Refund | Only on cancelled appointments; status flips to refunded/partial |
| ☐ | **No card data stored** | Nothing card-related in app storage or logs |

## 8. Check-in, live queue & realtime

> **Blocked upstream:** HAMS has not built the staff call/skip/complete operations, so
> `called` and `done` are **unreachable** against a real backend. Verify those two states
> in `DATA_MODE=mock` (which simulates the full progression) and re-verify against staging
> once HAMS ships.

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Check-in from appointment detail | Succeeds → lands on Live Queue |
| ☐ | Check-in from dashboard hero | Same |
| ☐ | Check-in from appointments list | Same |
| ☐ | Check-in twice / two devices | Idempotent; one queue entry; same position |
| ☐ | Already-checked-in appointment | Primary action reads "View live queue" |
| ☐ | Queue — waiting | Ring shows **patients ahead** (not the raw ticket number); ETA reads "about N min"; "Your number" shown separately |
| ☐ | Now serving | Shows a **number only** — never another patient's name |
| ☐ | Doctor status chip | Reflects available / with a patient / on a break / unavailable |
| ☐ | Live movement | Position decreases without manual refresh |
| ☐ | Pull to refresh | Refreshes and updates the timestamp |
| ☐ | Last-updated stamp | Always visible and advancing |
| ☐ | **Called state** *(mock)* | Full-bleed banner, vibration, both acknowledge buttons |
| ☐ | **"I'm on my way"** | Only confirms **after** the backend responds — never optimistically |
| ☐ | **"I've seen the call"** | Same; latest signal wins |
| ☐ | Acknowledge failure | Inline error; button re-enabled; no false confirmation |
| ☐ | **Done state** *(mock)* | Completion state; routes to the appointment |
| ☐ | Queue — not checked in | Empty state offering check-in (not an error) |
| ☐ | Queue — someone else's appointment | Generic "not available"; existence not revealed |
| ☐ | Realtime kill (airplane on/off) | Falls back to polling, then reconnects and refetches |
| ☐ | Background → foreground | Immediate refetch; no stale position |
| ☐ | Timeline | checked in → in queue → called → completed |

## 9. Records, vault, prescriptions, labs

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Upload PDF | Appears in the vault |
| ☐ | Upload from library | Same |
| ☐ | **Upload via camera** | Permission prompt appears; capture succeeds |
| ☐ | Deny camera permission | Graceful message; no crash |
| ☐ | Preview / download | Signed URL opens |
| ☐ | Delete document | Soft-deleted, disappears from the list |
| ☐ | Prescriptions | List + detail + PDF + share-to-pharmacy link |
| ☐ | Lab results | List, analytes, flags, trend chart |
| ☐ | **Cross-patient access** | Another patient's document id is **not** retrievable |

## 10. Notifications & deep links

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Permission prompt | Appears once after sign-in |
| ☐ | Token registered | Row present in `device_tokens` |
| ☐ | Foreground receipt | Banner shown |
| ☐ | Background receipt | System notification |
| ☐ | **Killed-app receipt** | Delivered |
| ☐ | Tap → appointment | Opens the appointment |
| ☐ | Tap → **queue** | Opens the **live queue**, not the appointment detail |
| ☐ | Tap → payment / lab / prescription / facility | Correct destination |
| ☐ | Cold-start tap | Routes correctly once auth resolves |
| ☐ | Tap while signed out | Lands on the sign-in wall; no PHI leak |
| ☐ | Preferences off | Push suppressed |
| ☐ | Notification centre | Grouped feed, mark-all-read works |
| ☐ | Custom scheme | `medilink://appointments` opens the app |
| ☐ | **Universal / App Links** | ⊘ **not configured** — `https://` links will open a browser, not the app |

## 11. AI features

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Symptom checker | Streams a real reply; conversational; always gives value |
| ☐ | Symptom checker — rate limit | 6th request in an hour → friendly throttle message |
| ☐ | Symptom checker — no network | Graceful error, no fake clinical content |
| ☐ | Doctor recommendation | Suggests plausible specialties/doctors |
| ☐ | Scheduling assist | Returns usable slot suggestions |
| ☐ | Health insights | Shows the real visit summary; **no fabricated vitals chart** |
| ☐ | Prescription scan | Extracts text from a photo |
| ☐ | AI unavailable (key missing) | Graceful 5xx message — **never invented medical data** |

## 12. Localization & Arabic RTL

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Switch EN→AR | **Instant** — no restart prompt, no relaunch |
| ☐ | Switch AR→EN | Instant |
| ☐ | Layout mirrors | Rows, icons, chevrons, back buttons all flip |
| ☐ | Text alignment | Right-aligned in Arabic |
| ☐ | No raw keys visible | No `queue.title`-style strings anywhere |
| ☐ | Numerals | **Western digits (0-9) in Arabic** — this is intentional |
| ☐ | Arabic bold | Renders regular weight (known font limitation) |
| ☐ | Long Arabic strings | No clipping or overlap |
| ☐ | Doctor/clinic Arabic names | Verified values show; otherwise English fallback |
| ☐ | Every screen in AR | Sweep all 64 screens for layout breakage |

## 13. Theme

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Light mode | All screens legible; AA contrast |
| ☐ | Dark mode | All screens legible; no invisible text; no white flashes |
| ☐ | System mode | Follows the OS live |
| ☐ | Switch mid-session | Applies immediately, persists |
| ☐ | Dark + Arabic | Both correct together |
| ☐ | Dark WebView | Thawani page still usable |

## 14. Offline, caching & network failure

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Airplane mode | Offline banner; cached data still renders |
| ☐ | Cold start offline | Previously-loaded data appears |
| ☐ | **Queue offline** | Last-known state, staleness banner, **ETA countdown NOT ticking** |
| ☐ | Reconnect | Stale queries auto-refetch |
| ☐ | Book offline | Blocked with a clear message |
| ☐ | **Check-in offline** | Blocked — never queued optimistically |
| ☐ | Slow 3G | Loading states, no infinite spinner |
| ☐ | Backend 500 | Friendly error + retry |
| ☐ | Backend unreachable | Actionable message, not a raw "Network request failed" |
| ☐ | Mid-request kill | No corrupt state on relaunch |
| ☐ | Logout purges cache | No PHI readable afterwards |

## 15. Permissions

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Camera | Prompt with a meaningful purpose string |
| ☐ | Photo library | Prompt with the MediLink-specific string |
| ☐ | Notifications | Prompt once |
| ☐ | Location (map) | Prompt; denial degrades gracefully |
| ☐ | All denied | App remains fully usable for everything else |
| ☐ | **No unused permissions requested** | `RECORD_AUDIO`, FaceID and microphone must **not** be requested (known config defects to fix first) |

## 16. Maps

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Map opens (iOS) | Renders; pins visible |
| ☐ | **Map opens (Android)** | ⊘ **blocked** — the Google Maps API key is a placeholder |
| ☐ | Pin tap | Clinic detail |
| ☐ | Directions | Opens the native maps app |
| ☐ | Map pin data | ⚠️ `doctor.mapClinics` is still the mock source |

## 17. Accessibility

| ☐ | Case | Expected |
|---|---|---|
| ☐ | VoiceOver (iOS) | Every control labelled and reachable |
| ☐ | TalkBack (Android) | Same |
| ☐ | Queue ring | Announces "N patients ahead, about M minutes" |
| ☐ | **Called state announced** | Screen reader announces the call |
| ☐ | Dynamic Type / large font | Text scales; layouts reflow without clipping |
| ☐ | Larger-text setting | Applies app-wide |
| ☐ | Contrast | AA in both themes |
| ☐ | Non-colour state cues | Every status has an icon/text, not colour alone |
| ☐ | Touch targets | ≥ 44×44 pt |
| ☐ | Reduce motion | Animations respect the OS setting |

## 18. Stability, errors & crash recovery

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Forced render error | Themed, localized fallback with Retry — never a white screen |
| ☐ | Cold start time | Acceptable; **note the blank white flash — no native splash configured** |
| ☐ | Long list scrolling | Smooth; no dropped frames |
| ☐ | Rapid navigation | No crashes or duplicate screens |
| ☐ | Memory over a 30-min session | No obvious growth or thermal issues |
| ☐ | Rotate (tablet) | Layout survives |
| ☐ | Backgrounded 24h+ | Resumes; token refreshed |
| ☐ | Session expiry mid-action | Re-auth prompted; action not silently lost |
| ☐ | **No crash reporting** | ⚠️ Field crashes are currently undiagnosable — Sentry or equivalent is outstanding |

---

## Sign-off

| Area | Result | Tester | Date | Notes |
|---|---|---|---|---|
| Pre-flight | | | | |
| Auth & session | | | | |
| Booking & payments | | | | |
| Queue & realtime | | | | |
| Records & vault | | | | |
| Notifications & deep links | | | | |
| AI | | | | |
| Localization & RTL | | | | |
| Theme | | | | |
| Offline & network | | | | |
| Permissions & maps | | | | |
| Accessibility | | | | |
| Stability | | | | |

**Release decision:** ☐ Ship ☐ Ship with known issues (list) ☐ Block

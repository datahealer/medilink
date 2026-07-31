const { build } = require("./xlsx");

const HDR = ["ID", "Priority", "Precondition", "Test Steps", "Expected Result", "Status", "Actual Result / Notes", "Severity", "Tester", "Date"];
const W = [9, 9, 26, 52, 52, 11, 34, 11, 12, 11];

const sheets = [];
function testSheet(name, title, cases) {
  const rows = [
    { cells: [title], style: 3, height: 22 },
    { cells: ["Status: Pass / Fail / Blocked / N-A     |     Severity: S1 Critical, S2 Major, S3 Minor, S4 Cosmetic     |     Fill Status for EVERY row."], style: 5, height: 16 },
    { cells: [] },
    { cells: HDR, style: 1, height: 30 },
    ...cases.map((c) => ({ cells: [c[0], c[1], c[2], c[3], c[4], "", "", "", "", ""], style: 2 })),
  ];
  sheets.push({ name, rows, widths: W, freeze: 4 });
}

/* ─────────────────────────── README ─────────────────────────── */
sheets.push({
  name: "README",
  widths: [30, 96],
  freeze: 0,
  rows: [
    { cells: ["MediLink — iPhone QA Test Plan"], style: 3, height: 26 },
    { cells: [] },
    { cells: ["Build under test", "TestFlight build 9 — version 1.0.0"], style: 2 },
    { cells: ["EAS build ID", "35c69f3c-3be6-4a24-ad88-4de7eb67ad3a"], style: 2 },
    { cells: ["Git commit", "70b60fceaf91f932a256e44d866088616736c867 (branch: development)"], style: 2 },
    { cells: ["Bundle identifier", "com.inzint.medilink"], style: 2 },
    { cells: ["Backend", "https://medilink-backend-five.vercel.app (production)"], style: 2 },
    { cells: ["Data mode", "production — real Supabase + real backend. No mock/demo data is reachable."], style: 2 },
    { cells: [] },
    { cells: ["!! READ THIS FIRST !!"], style: 3, height: 22 },
    { cells: ["LIVE DATABASE", "This build writes to the PRODUCTION database. Every account, appointment, payment and uploaded document you create is real and persists. Do NOT use real patient data belonging to anyone else. Use only the test accounts issued to you."], style: 4 },
    { cells: ["First real-backend build", "Builds 6 and 7 ran entirely on seeded demo data and never contacted a backend. Build 9 is the FIRST build to talk to real services, so treat every flow as untested. Expect to find genuine defects."], style: 4 },
    { cells: ["Push notifications", "WILL NOT WORK in this build (the iOS push entitlement is absent). Do not raise bugs for missing push. In-app notification lists DO work and must be tested."], style: 4 },
    { cells: [] },
    { cells: ["How to use this workbook"], style: 3, height: 22 },
    { cells: ["1", "Read 'Known Limitations' before you start. Anything listed there is expected — do not file it as a bug."], style: 2 },
    { cells: ["2", "Complete 'Environment & Accounts' so results are traceable to a device and iOS version."], style: 2 },
    { cells: ["3", "Work the numbered sheets in order. 01 Auth must pass before the rest is reachable."], style: 2 },
    { cells: ["4", "Set Status on EVERY row: Pass / Fail / Blocked / N-A. A blank row reads as 'not tested'."], style: 2 },
    { cells: ["5", "For any Fail: paste the exact on-screen error, add a screenshot/recording, and open a row in 'Bug Log'."], style: 2 },
    { cells: ["6", "Fill 'Sign-off Summary' at the end. That sheet is what the release decision is based on."], style: 2 },
    { cells: [] },
    { cells: ["Priority key", "P1 = blocks release · P2 = important · P3 = nice to have"], style: 2 },
    { cells: ["Severity key", "S1 = crash / data loss / security · S2 = feature broken, no workaround · S3 = broken with workaround · S4 = cosmetic"], style: 2 },
    { cells: [] },
    { cells: ["Reporting a bug — always include"], style: 3, height: 22 },
    { cells: ["Required", "Test ID · device model · iOS version · exact steps · what you expected · what happened · screenshot or screen recording · time of occurrence (for server log correlation)"], style: 2 },
    { cells: ["Also note", "Whether the device was on Wi-Fi or cellular, and whether the app was cold-started or resumed."], style: 2 },
  ],
});

/* ───────────────── Environment & Accounts ───────────────── */
sheets.push({
  name: "Environment & Accounts",
  widths: [34, 40, 46],
  freeze: 0,
  rows: [
    { cells: ["Test Environment — fill before testing"], style: 3, height: 26 },
    { cells: [] },
    { cells: ["Item", "Value", "Notes"], style: 1, height: 26 },
    { cells: ["Tester name", "", ""], style: 2 },
    { cells: ["Test date(s)", "", ""], style: 2 },
    { cells: ["iPhone model", "", "e.g. iPhone 13, iPhone 15 Pro Max"], style: 2 },
    { cells: ["iOS version", "", "Note the exact version"], style: 2 },
    { cells: ["Screen size class", "", "Standard / Plus-Max / SE-small / iPad if applicable"], style: 2 },
    { cells: ["TestFlight build number", "9", "Confirm in TestFlight before starting"], style: 2 },
    { cells: ["App version shown", "1.0.0", "Verify in Profile > Settings if displayed"], style: 2 },
    { cells: ["Network", "", "Wi-Fi / 5G / 4G — test on both if possible"], style: 2 },
    { cells: ["Test patient account A", "", "Primary account — issued by the team"], style: 2 },
    { cells: ["Test patient account B", "", "Second account, needed for isolation tests in 'Security & Privacy'"], style: 2 },
    { cells: ["Thawani test card", "", "Sandbox card details for payment tests — request from the team"], style: 2 },
    { cells: [] },
    { cells: ["Device coverage target"], style: 3, height: 22 },
    { cells: ["Minimum", "One standard iPhone (e.g. 13/14/15) on current iOS", ""], style: 2 },
    { cells: ["Recommended", "Add one small screen (iPhone SE) and one Max — layout and RTL bugs surface at the extremes", ""], style: 2 },
    { cells: ["Also verify", "Dark mode and Light mode on at least one device", ""], style: 2 },
    { cells: ["Also verify", "Arabic (RTL) and English on at least one device", ""], style: 2 },
    { cells: [] },
    { cells: ["Pre-test checklist"], style: 3, height: 22 },
    { cells: ["1", "Install build 9 from TestFlight (delete any earlier build first to clear stale state)", ""], style: 2 },
    { cells: ["2", "Confirm the build number is 9 — builds 6/7 were demo-data builds and must not be tested", ""], style: 2 },
    { cells: ["3", "Have a screen recorder ready (iOS Control Centre) for capturing defects", ""], style: 2 },
    { cells: ["4", "Note the current time when starting each module, so server logs can be correlated", ""], style: 2 },
  ],
});

/* ───────────────── Known Limitations ───────────────── */
sheets.push({
  name: "Known Limitations",
  widths: [10, 30, 62, 30],
  freeze: 3,
  rows: [
    { cells: ["Known Limitations — DO NOT FILE THESE AS BUGS"], style: 3, height: 26 },
    { cells: ["Verified against the shipped build. Anything here is expected behaviour for build 9."], style: 5, height: 16 },
    { cells: ["Ref", "Area", "Expected limitation", "Status / Owner"], style: 1, height: 30 },
    { cells: ["KL-01", "Push notifications", "Push will NOT arrive. The iOS push entitlement (aps-environment) is absent from this build — confirmed by inspecting the shipped Info.plist. In-app notification lists still work and ARE in scope.", "Known gap — needs an EAS credential change"], style: 4 },
    { cells: ["KL-02", "Google sign-in", "The Google button is intentionally disabled and shows a 'not configured' message. There is no Google OAuth backend endpoint or client ID.", "By design for v1"], style: 2 },
    { cells: ["KL-03", "Universal / deep links", "Tapping a medilink:// link works, but https:// universal links do NOT open the app — associatedDomains is not configured.", "Planned (P2-7)"], style: 2 },
    { cells: ["KL-04", "Doctor map pins", "The map shows clinics from the live nearby-clinics service. A separate legacy map-pin source exists in code but is unused and unreachable — no user impact.", "No backend; documented"], style: 2 },
    { cells: ["KL-05", "Vitals / health trend chart", "There is deliberately NO vitals trend chart on AI Insights. MediLink has no vitals data source and showing a trend would be fabricated clinical data.", "By design — do not request it"], style: 2 },
    { cells: ["KL-06", "AI rate limits", "AI features are capped per account per hour (prescription scan 10/hr, scheduling assistant 30/hr). Hitting the cap returns a friendly 'limit reached' message. This is correct behaviour.", "By design"], style: 2 },
    { cells: ["KL-07", "OTP resend cooldown", "Requesting a new OTP within ~20 seconds is refused with 'please wait a few seconds'. This is anti-abuse protection, not a bug.", "By design"], style: 2 },
    { cells: ["KL-08", "SMS OTP delivery", "Phone/SMS OTP is not delivered — no SMS provider is configured. Email-based codes DO work. Do not test SMS delivery.", "Known gap"], style: 4 },
    { cells: ["KL-09", "Transactional email", "Outbound email other than Supabase auth mail may not send (no SMTP provider configured). Password-reset and sign-up codes come from Supabase and DO work.", "Known gap"], style: 4 },
    { cells: ["KL-10", "API docs endpoint", "/api/docs and /api/openapi.json return 404 in production. Intentional — the docs are hidden outside development.", "By design"], style: 2 },
    { cells: ["KL-11", "Dev screens", "Developer-only screens (screen gallery, design-system preview) are disabled in this build and must NOT be reachable. If you CAN reach one, that IS a bug — file it as S1.", "Security control — report if reachable"], style: 4 },
    { cells: ["KL-12", "Queue prerequisite", "The Live Queue screen only shows a position when clinic staff have actually added you to that clinic's queue in their own system. With no active queue entry the screen correctly shows an empty/idle state.", "Requires clinic-side action"], style: 2 },
    { cells: ["KL-13", "Refunds", "Refunds are initiated but settle asynchronously via the payment provider. A refund may show as 'processing' for some time.", "By design"], style: 2 },
  ],
});

/* ───────────────── 01 Auth & Onboarding ───────────────── */
testSheet("01 Auth & Onboarding", "01 — Authentication & Onboarding", [
  ["AU-01", "P1", "App freshly installed, not signed in", "Cold-start the app from the home screen", "Splash appears with the MediLink logo on the brand purple background (no white flash), then routes to Welcome/onboarding", ],
  ["AU-02", "P2", "First launch", "Step through the onboarding carousel to the end", "All slides render, text is not clipped, Skip and Next both work, final slide leads to language or sign-in", ],
  ["AU-03", "P1", "Language screen reachable", "Choose English, continue; relaunch and choose العربية", "Selection is applied immediately with no forced restart, and persists after killing and reopening the app", ],
  ["AU-04", "P1", "On Sign In screen", "Submit the form with both fields empty", "Inline validation appears on both fields; no network call; no crash", ],
  ["AU-05", "P1", "On Sign In screen", "Enter a malformed email (e.g. 'abc@') and a password, submit", "Email validation message appears; form is not submitted", ],
  ["AU-06", "P1", "Valid test account A", "Enter correct email and password, tap Sign In", "Spinner shows, then the app lands on Dashboard with the patient's real name displayed", ],
  ["AU-07", "P1", "Valid email, wrong password", "Enter a wrong password and submit", "A clear 'invalid credentials' style message appears. The app does NOT reveal whether the email exists", ],
  ["AU-08", "P1", "On Sign In screen", "Toggle the password visibility eye icon", "Password text shows/hides correctly; the toggle is reachable and does not overlap the text", ],
  ["AU-09", "P2", "On Sign In screen", "Tap the Google sign-in button", "A 'Google sign-in not configured' message appears. No crash, no blank screen (see KL-02)", ],
  ["AU-10", "P1", "Not signed in", "Sign up with a NEW email: complete the form and submit", "Account is created and the app routes to the OTP screen with the email shown", ],
  ["AU-11", "P1", "Sign-up submitted", "Retrieve the 6-digit code from the email inbox and enter it", "Code is accepted and the app proceeds into the authenticated area", ],
  ["AU-12", "P1", "On OTP screen", "Enter an incorrect 6-digit code", "A clear error shows, the code fields clear or allow correction, and the attempt counter behaves sensibly", ],
  ["AU-13", "P2", "On OTP screen", "Tap Resend immediately, then again after the countdown", "Immediate resend is refused with a wait message (KL-07); after the countdown a new code is sent and works", ],
  ["AU-14", "P1", "Existing account, on Sign In", "Tap 'Forgot password', enter the account email, submit", "The app routes to the code-entry screen and an email with a 6-digit recovery code arrives", ],
  ["AU-15", "P1", "Recovery code received", "Enter the code, then set a new password", "Password is changed and the app signs in (or routes to Sign In). Confirm the NEW password works and the OLD one is rejected", ],
  ["AU-16", "P2", "On sign-up form", "Enter a password that is too short / weak", "Password rules are shown clearly and submission is blocked", ],
  ["AU-17", "P2", "Sign up with an email that already exists", "Submit the form", "A clear message indicates the account exists. No duplicate account is created", ],
  ["AU-18", "P1", "Signed in", "Force-quit the app, reopen it", "Session is restored automatically — no re-login is required, and the Dashboard shows real data", ],
  ["AU-19", "P1", "Signed in", "Sign out from Profile/Settings", "Returns to Sign In. Pressing Back does NOT return to any authenticated screen", ],
  ["AU-20", "P1", "Signed out", "Cold-start the app", "Lands on the unauthenticated flow — no authenticated screen or cached patient data is visible", ],
  ["AU-21", "P1", "Signed in, then leave idle", "Leave the app backgrounded for 30+ minutes, return", "Session refreshes silently, or prompts re-login cleanly. No infinite spinner, no stale error", ],
  ["AU-22", "P2", "Airplane mode on", "Attempt to sign in", "A clear offline/connection message appears — not a raw technical error or silent failure", ],
  ["AU-23", "P2", "Signed in", "Open Settings and delete the account (use a throwaway account only)", "A confirmation step is required before deletion; after confirming, the session ends", ],
  ["AU-24", "P3", "On any auth screen", "Rotate the device / open the keyboard on a small iPhone", "Fields remain visible and reachable; the keyboard does not cover the submit button", ],
  ["AU-25", "P1", "Signed in as account A", "Note the patient name and one appointment; sign out; sign in as account B", "Account B sees ONLY its own data. No trace of account A's name, appointments or documents", ],
  ["AU-26", "P2", "On OTP screen", "Paste a 6-digit code from the clipboard", "Paste populates all six boxes correctly", ],
  ["AU-27", "P3", "On Sign In screen", "Use the iOS password manager / autofill", "Autofill populates email and password without breaking validation", ],
  ["AU-28", "P1", "Signed in", "Try to open a developer screen (if any link is visible anywhere)", "No developer/design-preview screen is reachable in this build (KL-11). If one opens, file S1 immediately", ],
]);

/* ───────────────── 02 Dashboard & Nav ───────────────── */
testSheet("02 Dashboard & Nav", "02 — Dashboard & Navigation", [
  ["DB-01", "P1", "Signed in", "Open the Dashboard", "The patient's real name and greeting show. No placeholder or demo name (e.g. no unfamiliar seeded patient name)", ],
  ["DB-02", "P1", "Signed in", "Review every Dashboard card", "All content is real: upcoming appointments, specialties, featured clinics, recent doctors. Nothing shows obviously fake data", ],
  ["DB-03", "P1", "Signed in with no appointments", "Open the Dashboard on a brand-new account", "Empty states are friendly and explain what to do next — not blank space, not a spinner forever, not an error", ],
  ["DB-04", "P1", "Signed in", "Pull down to refresh", "Data reloads; the spinner ends; values are unchanged or updated (never wiped to empty)", ],
  ["DB-05", "P1", "Signed in", "Tap each of the 5 bottom tabs in turn", "Dashboard, Search, Me, Records and Profile all load without crash; the selected tab is visually clear", ],
  ["DB-06", "P1", "Signed in", "Navigate 4-5 screens deep, then use Back repeatedly", "Back always returns to the previous screen and eventually to a tab root. No dead-end or blank screen", ],
  ["DB-07", "P2", "Signed in", "Confirm the bottom tab bar visibility across screens", "The tab bar is present on tab roots and hidden on full-screen pushes (booking, settings, edit profile). It never overlaps content", ],
  ["DB-08", "P1", "Signed in", "Tap every quick action / shortcut on the Dashboard", "Each navigates to the correct screen. No action is a no-op", ],
  ["DB-09", "P2", "Signed in", "Scroll the Dashboard to the very bottom", "Content is not cut off by the tab bar or the home indicator; the last item is fully readable", ],
  ["DB-10", "P2", "Airplane mode on", "Open the Dashboard", "An offline indicator appears and cached content or a clear message shows — not a raw error", ],
  ["DB-11", "P2", "Signed in", "Turn airplane mode off while on the Dashboard", "The app recovers automatically or on pull-to-refresh; no restart needed", ],
  ["DB-12", "P2", "Multiple family members exist", "Open the patient switcher and change the active patient", "The Dashboard updates to the selected person's data; the active person is clearly indicated", ],
  ["DB-13", "P3", "Signed in", "Check the safe-area on a notch/Dynamic Island device", "No content sits under the notch, status bar or home indicator", ],
  ["DB-14", "P2", "Signed in", "Background the app on Dashboard for 5 min, then resume", "Screen restores correctly, data refreshes, no duplicate spinners or frozen UI", ],
]);

/* ───────────────── 03 Search & Doctors ───────────────── */
testSheet("03 Search & Doctors", "03 — Search & Doctors", [
  ["SD-01", "P1", "Signed in", "Open the Search tab", "The search screen loads with real specialties and/or doctor results", ],
  ["SD-02", "P1", "On Search", "Type a known doctor name", "Matching real doctors appear. Results update as expected and are not demo entries", ],
  ["SD-03", "P1", "On Search", "Type a nonsense string (e.g. 'zzzzqqq')", "A friendly 'no results' state appears — not a spinner, blank page or error", ],
  ["SD-04", "P1", "On Search", "Search, then clear the field", "Results reset to the default browse state cleanly", ],
  ["SD-05", "P1", "On Search", "Open Filters, apply a specialty filter, apply", "Results narrow correctly; the active filter is visible and removable", ],
  ["SD-06", "P2", "Filters applied", "Reset/clear all filters", "All filters clear and the full result set returns", ],
  ["SD-07", "P1", "On Search", "Open the Specialties list and pick one", "Doctors for that specialty load — real names, real specialties", ],
  ["SD-08", "P1", "Doctor results visible", "Tap a doctor to open the profile", "Profile shows real name, specialty, fee, rating and clinic. No placeholder text or 'Lorem'", ],
  ["SD-09", "P1", "On a doctor profile", "Open the doctor's Reviews", "Real reviews and the rating summary load. If there are none, a clear empty state shows", ],
  ["SD-10", "P2", "On a doctor profile", "Tap the favourite / heart control", "State toggles immediately, persists after leaving and returning, and survives an app restart", ],
  ["SD-11", "P2", "Favourites exist", "Open the favourites list", "Only the doctors/clinics you favourited appear", ],
  ["SD-12", "P1", "On a doctor profile", "Tap Book / Book Appointment", "Booking flow opens for the CORRECT doctor (name matches the profile you came from)", ],
  ["SD-13", "P2", "On Search with many results", "Scroll a long result list", "Scrolling is smooth, images load, no flicker or duplicated rows", ],
  ["SD-14", "P2", "Slow network (throttle or 4G)", "Perform a search", "Loading state is visible; results eventually appear or a clear timeout message shows", ],
  ["SD-15", "P3", "Arabic selected", "Repeat SD-01 to SD-08 in Arabic", "Layout mirrors correctly, Arabic text is readable, and search still returns results", ],
  ["SD-16", "P2", "On a doctor profile", "Check the displayed consultation fee against the booking summary later", "The fee shown on the profile matches the fee charged at checkout", ],
]);

/* ───────────────── 04 Clinics & Map ───────────────── */
testSheet("04 Clinics & Map", "04 — Clinics & Map", [
  ["CM-01", "P1", "Signed in", "Open the map view from Search", "The map renders with clinic pins from the live nearby-clinics service", ],
  ["CM-02", "P1", "Map open", "Pinch to zoom, pan around", "Map responds smoothly; pins stay anchored to the right positions", ],
  ["CM-03", "P1", "Map open", "Tap a clinic pin", "Clinic details appear (name, and address/rating if available) for the correct clinic", ],
  ["CM-04", "P2", "Map open", "Search/filter clinics from the map screen", "The list and pins narrow to matches", ],
  ["CM-05", "P1", "Clinic detail open", "Review the clinic detail screen", "Real clinic name, address and doctor list. No demo clinic names", ],
  ["CM-06", "P2", "Clinic detail open", "Tap a doctor listed at that clinic", "Opens the correct doctor profile", ],
  ["CM-07", "P2", "Map open", "Tap the map attribution / any external link", "Opens in the browser correctly, or is intentionally non-tappable. No crash", ],
  ["CM-08", "P2", "Airplane mode on", "Open the map", "A clear offline state or a blank map with a message — no crash and no infinite spinner", ],
  ["CM-09", "P3", "Map open", "Rotate the device, then background and resume the app", "Map re-renders correctly and remains interactive", ],
  ["CM-10", "P2", "Arabic selected", "Open the map and a clinic detail", "UI mirrors correctly; the map itself remains usable and pins are tappable", ],
]);

/* ───────────────── 05 Appointments ───────────────── */
testSheet("05 Appointments & Booking", "05 — Appointments & Booking", [
  ["AP-01", "P1", "Signed in", "Open Appointments", "Upcoming and past appointments load — real data, correct dates, correct doctor names", ],
  ["AP-02", "P1", "New account, no appointments", "Open Appointments", "A friendly empty state explains how to book", ],
  ["AP-03", "P1", "On a doctor profile", "Start booking and open the slot picker", "Real available dates and time slots load for that doctor", ],
  ["AP-04", "P1", "Slot picker open", "Select a date with no availability", "A clear 'no slots' message shows for that date — not an empty silent list", ],
  ["AP-05", "P1", "Slot picker open", "Select an available slot and continue", "The chosen slot carries through to the review step unchanged", ],
  ["AP-06", "P1", "On the booking review step", "Verify every summary field", "Doctor name, specialty, CLINIC, date, time and fee all match what you selected. The clinic must be the doctor's own clinic", ],
  ["AP-07", "P1", "On booking review", "Confirm the booking (without paying, if that path exists)", "Booking is created and appears in Appointments with the correct details", ],
  ["AP-08", "P1", "Booking created", "Cross-check the appointment detail screen", "All details match the confirmation. Status is sensible (e.g. pending/confirmed)", ],
  ["AP-09", "P1", "An upcoming appointment exists", "Cancel it and confirm", "A confirmation step appears; after confirming, the status changes to cancelled and it moves out of Upcoming", ],
  ["AP-10", "P1", "An upcoming appointment exists", "Reschedule it to a different available slot", "New date/time is saved and shown; the old slot is released (re-selectable)", ],
  ["AP-11", "P2", "Cancellation policy screen exists", "Open the refund/cancellation policy from the appointment", "Policy text loads and is readable in both languages", ],
  ["AP-12", "P1", "An appointment is due today", "Perform check-in from the appointment", "Check-in succeeds and the status/UI updates. Note the exact time for correlation", ],
  ["AP-13", "P2", "Slot picker open", "Select a slot, then leave the flow without confirming; return and check that slot", "The temporarily held slot is released and selectable again (no permanent hold)", ],
  ["AP-14", "P2", "Two devices or fast tapping", "Tap Confirm twice quickly", "Only ONE appointment is created — no duplicate booking", ],
  ["AP-15", "P1", "An appointment exists", "Force-quit and reopen, return to Appointments", "The appointment persists with identical details", ],
  ["AP-16", "P2", "Airplane mode during booking", "Try to confirm a booking with no connection", "A clear failure message appears and NO phantom appointment is created. Re-check after reconnecting", ],
  ["AP-17", "P1", "A past appointment exists", "Open a past appointment", "Details are read-only; no cancel/reschedule offered for a past appointment", ],
  ["AP-18", "P2", "A completed appointment exists", "Rate the visit from the appointment", "Rating submits successfully and a success state shows; the rating appears on the doctor's reviews", ],
  ["AP-19", "P2", "Rating already submitted", "Try to rate the same appointment again", "Either blocked with a clear message, or updates the existing rating — but never creates duplicates", ],
  ["AP-20", "P2", "Family member selected", "Book an appointment for a family member", "The appointment is recorded against the correct person and shows that person's name", ],
  ["AP-21", "P1", "Signed in as account A", "Note an appointment ID; sign in as account B and attempt to view A's appointment", "Account B cannot see or open account A's appointment", ],
  ["AP-22", "P3", "Arabic selected", "Complete a full booking in Arabic", "All steps mirror correctly, dates/times are readable, and the booking succeeds", ],
  ["AP-23", "P2", "On the slot picker", "Change the date back and forth several times", "Slots reload correctly each time with no stale data from the previous date", ],
  ["AP-24", "P2", "Booking flow open", "Use Back to exit mid-flow, then start again", "No partial/orphan booking is created; the flow restarts cleanly", ],
  ["AP-25", "P3", "Small iPhone (SE)", "Complete booking on a small screen", "All controls remain reachable; the keyboard never blocks the continue button", ],
  ["AP-26", "P2", "Appointment tomorrow exists", "Check the appointment list ordering", "Appointments are sorted sensibly (soonest first) and grouped correctly into Upcoming/Past", ],
]);

/* ───────────────── 06 Queue ───────────────── */
testSheet("06 Queue (LIVE)", "06 — Live Queue  (headline feature of this release)", [
  ["QU-01", "P1", "An appointment exists today at a clinic using the queue", "Open the appointment and enter the Live Queue screen", "The screen loads without error. Either a real queue position or a clear idle/empty state (see KL-12)", ],
  ["QU-02", "P1", "Not yet added to a queue by staff", "Open the Live Queue screen", "A clear 'not in queue yet' style state — NOT an error, NOT a spinner forever, NOT a fake position", ],
  ["QU-03", "P1", "Clinic staff have added you to the queue", "Open the Live Queue screen", "Your real position number and the people-ahead count are shown and match what clinic staff see", ],
  ["QU-04", "P1", "In a queue with a position", "Ask staff to advance the queue; watch the screen WITHOUT touching it", "The position updates automatically within a few seconds (realtime) — no manual refresh needed", ],
  ["QU-05", "P1", "In a queue", "Pull to refresh on the queue screen", "Values refresh and match the live state; no duplication or flicker", ],
  ["QU-06", "P1", "In a queue with an estimated wait", "Review the estimated wait time", "The estimate is plausible and consistent with the position. It must not show a negative or absurd value", ],
  ["QU-07", "P1", "Staff mark you as 'called'", "Observe the screen when your turn is called", "The screen clearly indicates you have been called, with an obvious visual change", ],
  ["QU-08", "P1", "You have been called", "Acknowledge the call using the on-screen action", "Acknowledgement succeeds and the UI confirms it. Clinic staff should see the acknowledgement", ],
  ["QU-09", "P2", "Already acknowledged", "Tap acknowledge again", "Handled gracefully — no duplicate acknowledgement and no error to the user", ],
  ["QU-10", "P1", "In a queue", "Background the app for 2 minutes, then resume", "On resume the position is current (not stale), refreshed automatically", ],
  ["QU-11", "P1", "In a queue", "Force-quit the app and reopen to the queue screen", "Position is retrieved fresh and is correct", ],
  ["QU-12", "P1", "In a queue", "Enable airplane mode while on the queue screen", "A clear connection-lost indication appears; the last known position is not presented as live", ],
  ["QU-13", "P1", "Airplane mode was on", "Turn connectivity back on", "The screen reconnects and resumes live updates automatically", ],
  ["QU-14", "P1", "Staff remove you / complete your visit", "Observe the screen", "The screen transitions to a sensible completed/removed state rather than showing a stale position", ],
  ["QU-15", "P1", "Account A is in a queue", "Sign in as account B and open B's appointment queue", "Account B sees only its OWN queue state — never account A's position. Critical isolation check", ],
  ["QU-16", "P2", "In a queue", "Leave the queue screen, navigate elsewhere, come back", "Position is correct on return, and realtime updates resume", ],
  ["QU-17", "P2", "Arabic selected", "Open the queue screen in Arabic", "Layout mirrors correctly, the position ring/number is readable, and numerals are legible", ],
  ["QU-18", "P2", "Dark mode enabled", "Open the queue screen in dark mode", "All queue text and the position indicator have adequate contrast and are readable", ],
]);

/* ───────────────── 07 Payments ───────────────── */
testSheet("07 Payments", "07 — Payments  (real money paths — read notes)", [
  ["PY-01", "P1", "Booking reaches the payment step", "Review the payment summary before paying", "Amount, currency and appointment details are correct and match the fee shown earlier", ],
  ["PY-02", "P1", "On the payment step", "Start the payment and observe the provider checkout", "The payment provider's checkout opens correctly (not a blank web view, not an error page)", ],
  ["PY-03", "P1", "Provider checkout open", "Complete a payment with the sandbox/test card", "Payment succeeds, the app returns automatically, and a success screen shows", ],
  ["PY-04", "P1", "Payment just succeeded", "Check the appointment and payment history", "The appointment shows as paid and the payment appears in history with the correct amount", ],
  ["PY-05", "P1", "Provider checkout open", "Cancel the payment / press Back without paying", "The app returns to a clear cancelled state. NO appointment is marked paid and no charge occurs", ],
  ["PY-06", "P1", "Provider checkout open", "Use a card that will be declined", "A clear failure message shows; the appointment remains unpaid; the user can retry", ],
  ["PY-07", "P1", "Payment in progress", "Kill the app during the provider checkout, then reopen", "On reopening, the payment status is resolved correctly (paid or unpaid) — never permanently 'processing'", ],
  ["PY-08", "P1", "Payment succeeded", "Force-quit and reopen; re-check the payment", "Paid status persists — it was recorded server-side, not only in the UI", ],
  ["PY-09", "P1", "Signed in", "Open Payments history", "Real payments only, correct amounts, dates and statuses. No demo transactions", ],
  ["PY-10", "P1", "A paid payment exists", "Open its invoice", "The invoice opens/downloads and shows correct patient, doctor, amount and date", ],
  ["PY-11", "P2", "An invoice exists", "Use the regenerate invoice action if present", "A fresh invoice is produced with the same correct details", ],
  ["PY-12", "P2", "Unpaid appointment exists", "Open the unpaid list / prompt", "The unpaid amount is correct and paying from there works", ],
  ["PY-13", "P1", "Cancel a PAID appointment", "Cancel and observe the refund handling", "Refund is initiated with a clear message. It may show as processing (KL-13). No silent loss of money", ],
  ["PY-14", "P2", "On the payment step", "Tap Pay twice quickly", "Only ONE payment session/charge is created", ],
  ["PY-15", "P1", "Airplane mode", "Attempt to start a payment offline", "A clear connection error appears; no payment session is left dangling", ],
  ["PY-16", "P2", "Arabic selected", "Complete a payment in Arabic", "The app side is mirrored and readable; the provider page may be English (acceptable) but the return flow still works", ],
  ["PY-17", "P1", "Account A made a payment", "Sign in as account B and open Payments", "Account B sees none of account A's payments or invoices", ],
  ["PY-18", "P2", "Payment succeeded", "Verify the amount actually charged against the amount displayed", "They match exactly, including currency. Report ANY discrepancy as S1 immediately", ],
]);

/* ───────────────── 08 Records ───────────────── */
testSheet("08 Records Labs Rx", "08 — Medical Records, Labs & Prescriptions", [
  ["RC-01", "P1", "Signed in", "Open the Records tab", "Records load — real documents, labs and prescriptions for this patient only", ],
  ["RC-02", "P1", "New account with no records", "Open Records", "Clear empty states for each section, explaining what will appear there", ],
  ["RC-03", "P1", "On Records", "Upload a document from the photo library", "Permission prompt appears with a MediLink-specific message; the upload succeeds and appears in the list", ],
  ["RC-04", "P1", "On Records", "Upload a document using the CAMERA", "The camera permission prompt reads 'MediLink uses your camera to capture medical documents.'; capture and upload succeed", ],
  ["RC-05", "P1", "On Records", "Upload a PDF/file via the document picker", "File is selected and uploaded successfully; the correct filename shows", ],
  ["RC-06", "P1", "Permission previously denied", "Deny camera/photo permission, then attempt upload", "A helpful message explains how to enable it in iOS Settings. No crash", ],
  ["RC-07", "P1", "A document exists", "Open the document detail and view the file", "The document opens and is readable. The correct file opens (not another patient's, not the wrong item)", ],
  ["RC-08", "P1", "A document exists", "Delete a document and confirm", "Confirmation is required; after deleting it disappears and stays gone after a refresh/restart", ],
  ["RC-09", "P2", "A document exists", "Share/export the document", "The iOS share sheet opens with the correct file attached", ],
  ["RC-10", "P1", "Lab results exist", "Open the Labs list, then a lab result", "Real analyte values, units and reference ranges show; out-of-range values are visually flagged", ],
  ["RC-11", "P1", "A lab result with history exists", "Open the trend view for an analyte", "The trend reflects real historical values only. It must NOT invent or interpolate data points", ],
  ["RC-12", "P2", "An unviewed lab result exists", "Open it, then return to the list", "The unread/new indicator clears correctly", ],
  ["RC-13", "P2", "A lab report file exists", "Open/download the lab report file", "The file opens correctly and belongs to this patient", ],
  ["RC-14", "P1", "Prescriptions exist", "Open the Prescriptions list, then one prescription", "Real medication names, dosages and instructions show, attributed to the right doctor and date", ],
  ["RC-15", "P1", "A prescription exists", "Generate / download the prescription PDF", "The PDF opens and renders correctly with readable text and no missing fonts or blank pages", ],
  ["RC-16", "P2", "A prescription exists", "Use the share-link action if present", "A link is produced and the share sheet opens. Confirm the link is not publicly guessable", ],
  ["RC-17", "P1", "Account A has records", "Sign in as account B and open Records", "Account B sees ONLY its own records. No document, lab or prescription from A is visible or openable", ],
  ["RC-18", "P2", "Large file", "Upload a large photo (several MB)", "Either succeeds, or fails with a clear size message. No hang and no silent failure", ],
  ["RC-19", "P2", "Airplane mode", "Attempt an upload offline", "Clear failure message; no half-uploaded ghost entry appears in the list", ],
  ["RC-20", "P2", "Medical history exists", "Open and edit Medical History (allergies, conditions)", "Existing values load, edits save, and persist after an app restart", ],
  ["RC-21", "P3", "Arabic selected", "Review Records, labs and a prescription in Arabic", "Layout mirrors, values and units remain readable and correctly aligned", ],
  ["RC-22", "P2", "Dark mode", "Open a lab result and a prescription in dark mode", "All values, ranges and flags remain readable with good contrast", ],
]);

/* ───────────────── 09 Profile & Family ───────────────── */
testSheet("09 Profile & Family", "09 — Profile, Family & Settings", [
  ["PR-01", "P1", "Signed in", "Open the Profile tab", "The patient's real name, email/phone and details show — no placeholder values", ],
  ["PR-02", "P1", "On Profile", "Edit the profile: change name and other fields, save", "Changes save, a success indication shows, and the new values persist after restarting the app", ],
  ["PR-03", "P1", "On Edit Profile", "Change the profile photo from the photo library", "Permission prompt shows the MediLink photo message; the new photo uploads and displays everywhere it appears", ],
  ["PR-04", "P2", "On Edit Profile", "Submit with a required field cleared", "Validation blocks the save with a clear message", ],
  ["PR-05", "P2", "On Edit Profile", "Enter an invalid phone number format", "Validation message appears; invalid data is not saved", ],
  ["PR-06", "P1", "Signed in", "Open Family members", "Existing family members load with correct names and relationships", ],
  ["PR-07", "P1", "On Family", "Add a new family member with valid details", "Member is created and appears in the list immediately and after a restart", ],
  ["PR-08", "P1", "A family member exists", "Edit that member's details and save", "Changes persist correctly and are reflected wherever that member is shown", ],
  ["PR-09", "P1", "A family member exists", "Remove a family member and confirm", "Confirmation required; after removal the member is gone and stays gone", ],
  ["PR-10", "P2", "On Add Family", "Submit the form empty", "Validation blocks submission with clear field-level messages", ],
  ["PR-11", "P1", "Multiple members exist", "Switch the active patient, then browse Appointments and Records", "All data shown belongs to the newly selected person — no bleed-through from the previous selection", ],
  ["PR-12", "P1", "Signed in", "Open Settings", "All settings sections load and are navigable", ],
  ["PR-13", "P1", "In Settings > Appearance", "Switch between Light, Dark and System", "The theme applies immediately across the app and persists after a restart", ],
  ["PR-14", "P1", "In Settings", "Change the language to Arabic, then back to English", "Direction and text change immediately with no forced restart, and the choice persists", ],
  ["PR-15", "P2", "In Settings > Notifications", "Toggle notification preferences", "Toggles save and remain set after leaving and returning (server-side persistence)", ],
  ["PR-16", "P2", "In Settings", "Open any legal/about/privacy entries", "Content loads or a clear placeholder is shown. No crash and no broken link", ],
  ["PR-17", "P2", "New account with no family", "Open Family", "A friendly empty state invites adding a member", ],
  ["PR-18", "P1", "Account A has family members", "Sign in as account B and open Family", "Account B sees only its own family members", ],
  ["PR-19", "P3", "Small iPhone", "Complete Edit Profile on a small screen", "Keyboard does not cover inputs or the save button; all fields reachable", ],
  ["PR-20", "P2", "Profile photo set", "Force-quit and reopen; check the photo", "The photo loads from the server, not only from a local cache", ],
]);

/* ───────────────── 10 Notifications ───────────────── */
testSheet("10 Notifications", "10 — Notifications (in-app)", [
  ["NT-01", "P1", "Signed in", "Open Notifications", "Real notifications load for this account; empty state is friendly if there are none", ],
  ["NT-02", "P1", "Unread notifications exist", "Open a notification", "It opens correctly, marks as read, and the unread badge/count decreases", ],
  ["NT-03", "P1", "Unread notifications exist", "Use 'Mark all read'", "All items become read and the state persists after a refresh and a restart", ],
  ["NT-04", "P2", "Signed in", "Open the Facility Messages inbox", "Real facility messages load, or a clear empty state shows", ],
  ["NT-05", "P2", "Unread facility messages exist", "Open and read them", "They mark as read and remain read after leaving and returning", ],
  ["NT-06", "P2", "Notification with a target exists", "Tap a notification that refers to an appointment", "It navigates to the correct related screen", ],
  ["NT-07", "P1", "Signed in", "Pull to refresh the notification list", "New items appear; existing read/unread states are preserved correctly", ],
  ["NT-08", "P2", "Airplane mode", "Open Notifications offline", "Clear offline message or cached list — no crash", ],
  ["NT-09", "P1", "Any state", "Confirm push behaviour", "Push notifications do NOT arrive in this build — that is expected (KL-01). Do not file a bug", ],
  ["NT-10", "P1", "Account A has notifications", "Sign in as account B and open Notifications", "Account B sees only its own notifications", ],
  ["NT-11", "P3", "Arabic selected", "Open Notifications in Arabic", "Layout mirrors and text is readable; timestamps are sensible", ],
  ["NT-12", "P2", "Long notification text exists", "Open a notification with a long body", "Text wraps and is fully readable; nothing is clipped", ],
]);

/* ───────────────── 11 AI ───────────────── */
testSheet("11 AI Assistant", "11 — AI Features", [
  ["AI-01", "P1", "Signed in", "Open the AI Assistant and send a health question", "A streamed, sensible response appears. It includes an AI/medical disclaimer", ],
  ["AI-02", "P1", "On AI Assistant", "Send an empty message", "Sending is blocked or ignored gracefully — no error, no empty bubble", ],
  ["AI-03", "P1", "On AI Assistant", "Send an off-topic question (e.g. about football)", "The assistant declines politely and redirects to healthcare. It must not answer off-topic", ],
  ["AI-04", "P1", "On AI Assistant", "Ask something that requests a diagnosis or prescription", "The assistant does NOT diagnose or prescribe; it advises consulting a professional", ],
  ["AI-05", "P2", "Mid-response", "Send a message then immediately leave the screen", "No crash; returning shows a sensible conversation state", ],
  ["AI-06", "P1", "Signed in", "Open AI doctor recommendations and enter symptoms", "Real, bookable doctors are suggested with real names and specialties", ],
  ["AI-07", "P1", "On recommendations", "Tap a suggested doctor", "Opens the correct doctor profile and booking works from there", ],
  ["AI-08", "P1", "Signed in", "Open the AI scheduling assistant and ask e.g. 'cardiologist tomorrow morning'", "It interprets the request and returns matching doctors with real slots, or asks a sensible clarifying question", ],
  ["AI-09", "P1", "On scheduling assistant", "Ask for a date in the PAST", "It refuses and asks for a future date. It must not offer a past slot", ],
  ["AI-10", "P1", "On scheduling assistant", "Ask vaguely (e.g. 'I need a doctor')", "It asks a clarifying question rather than guessing a specialty", ],
  ["AI-11", "P1", "Scheduling result shown", "Book from the AI suggestion", "The booking flow opens for the correct doctor and the slot matches what was offered", ],
  ["AI-12", "P2", "Signed in", "Open AI Insights", "The last visit summary loads if one exists, otherwise a clear empty state. There is deliberately NO vitals chart (KL-05)", ],
  ["AI-13", "P2", "Repeat requests quickly", "Send many AI requests in a row until the limit is hit", "A friendly 'hourly limit reached' message appears (KL-06). No crash and no raw error", ],
  ["AI-14", "P2", "Airplane mode", "Send an AI request offline", "A clear connection error appears — not a hang or a blank reply bubble", ],
  ["AI-15", "P3", "Arabic selected", "Use the AI assistant in Arabic", "Input and output are readable, layout mirrors, and the conversation remains usable", ],
  ["AI-16", "P2", "Any AI screen", "Check for fabricated clinical content", "No AI screen presents invented vitals, lab values or diagnoses as factual patient data", ],
]);

/* ───────────────── 12 i18n / theme ───────────────── */
testSheet("12 i18n RTL & Theme", "12 — Localization, RTL & Theming", [
  ["LC-01", "P1", "App in English", "Switch to Arabic from Settings or the language screen", "The entire UI mirrors to right-to-left immediately, with NO app restart required", ],
  ["LC-02", "P1", "Arabic active", "Force-quit and reopen the app", "Arabic and RTL persist", ],
  ["LC-03", "P1", "Arabic active", "Walk through every main screen", "No untranslated raw keys (e.g. 'errors.unknown'), no English left in Arabic mode where a translation exists", ],
  ["LC-04", "P1", "Arabic active", "Check headings and bold text", "Arabic bold/semibold render at the correct weight — not hairline-thin and not all the same weight", ],
  ["LC-05", "P1", "Arabic active", "Check back buttons, chevrons and carousels", "Directional icons point the correct way for RTL; swipe directions feel correct", ],
  ["LC-06", "P1", "Arabic active", "Review forms and text inputs", "Text aligns right, the cursor behaves correctly, and placeholders are translated", ],
  ["LC-07", "P2", "Arabic active", "Check dates, times and numbers", "All are readable and consistent. Note any mixed-direction rendering issues", ],
  ["LC-08", "P2", "Arabic active", "Check lists with mixed Arabic/English content (e.g. doctor names)", "Mixed text renders without character reordering or clipping", ],
  ["LC-09", "P1", "Any language", "Switch to Dark mode", "Every screen is readable: no dark-on-dark text, no invisible icons, no white flash between screens", ],
  ["LC-10", "P1", "Dark mode", "Review cards, badges, inputs and disabled states", "Contrast is adequate everywhere; status colours remain distinguishable", ],
  ["LC-11", "P1", "System theme selected", "Change the iOS system appearance while the app is open", "The app follows the system change immediately without a restart", ],
  ["LC-12", "P2", "Light mode", "Review the same screens as LC-10", "No washed-out or unreadable low-contrast text", ],
  ["LC-13", "P2", "Either theme", "Check the splash and first frame after launch", "No jarring white flash before the themed UI appears", ],
  ["LC-14", "P2", "iOS text size increased (Accessibility)", "Set a larger system text size and browse the app", "Text scales without clipping; buttons remain usable. Note any severe layout breaks", ],
  ["LC-15", "P3", "Arabic + Dark mode together", "Browse the main flows", "Both combine correctly with no layout or contrast regressions", ],
  ["LC-16", "P2", "Any language", "Check every empty state and error message you can trigger", "All are translated and human-readable — never a raw code or an English string in Arabic mode", ],
  ["LC-17", "P3", "Arabic active", "Complete a full booking and a full payment in Arabic", "Both flows complete successfully end to end", ],
  ["LC-18", "P2", "Long text", "Find the longest labels (e.g. Arabic specialty names) and check buttons/tabs", "Text does not overflow, truncate mid-word awkwardly, or push layout off screen", ],
]);

/* ───────────────── 13 Security ───────────────── */
testSheet("13 Security & Privacy", "13 — Security & Privacy  (highest-value sheet: run all of it)", [
  ["SE-01", "P1", "Accounts A and B available", "Sign in as A, record IDs of an appointment, document, payment and prescription. Sign in as B", "B cannot view ANY of A's records by any route. Any leak is S1 and must be reported immediately", ],
  ["SE-02", "P1", "Signed out", "Try to reach an authenticated screen (e.g. via a medilink:// link if available)", "Redirected to Sign In. No patient data is displayed before authentication", ],
  ["SE-03", "P1", "Signed in then signed out", "After signing out, background/reopen the app and inspect the iOS app switcher preview", "No patient data remains visible; the app returns to the unauthenticated state", ],
  ["SE-04", "P1", "Signed in", "Attempt to open any developer screen", "Not reachable in this build (KL-11). If one opens, file S1", ],
  ["SE-05", "P1", "Any state", "Look for any demo/seeded patient data anywhere in the app", "No demo patient, fake appointment or sample document appears. All data is real. Report anything suspicious", ],
  ["SE-06", "P1", "Signed in", "Trigger errors (wrong password, offline actions, invalid inputs)", "No error message exposes technical internals: no stack traces, no SQL, no tokens, no API keys, no internal URLs", ],
  ["SE-07", "P1", "Signed in", "Delete the account (throwaway account only), then try to sign in again", "Sign-in is refused or the account is clearly deactivated. Data is not still accessible", ],
  ["SE-08", "P2", "Signed in", "Use the app on an unsecured/public Wi-Fi", "The app functions normally; no certificate or 'insecure connection' warnings appear", ],
  ["SE-09", "P2", "A prescription share link was created", "Open the share link in a browser while signed out", "It shows only what it should. Confirm it is not trivially guessable by editing the URL", ],
  ["SE-10", "P1", "Signed in as B", "Try changing a family member or profile field belonging to another account (if any UI allows)", "Rejected. No cross-account write is possible", ],
  ["SE-11", "P2", "Camera/photo permission", "Review each permission prompt text", "Each explains a genuine MediLink purpose. There must be NO microphone permission prompt anywhere", ],
  ["SE-12", "P1", "Any state", "Confirm no microphone or unexpected permission is requested", "The app never asks for microphone, location-always, contacts or calendar access in this build", ],
  ["SE-13", "P2", "Signed in", "Check that documents/labs open over a secure connection", "Files open normally; no mixed-content or insecure warnings", ],
  ["SE-14", "P2", "Two devices, same account", "Sign in on a second device, then sign out on the first", "Behaviour is sensible and documented; the second device does not lose data unexpectedly", ],
]);

/* ───────────────── 14 Performance ───────────────── */
testSheet("14 Performance & Device", "14 — Performance, Stability & Device Behaviour", [
  ["PF-01", "P1", "App installed", "Cold-start the app and time it", "The app reaches a usable screen in a reasonable time (note the seconds). No white screen longer than the splash", ],
  ["PF-02", "P1", "Signed in", "Use the app continuously for 10-15 minutes across all modules", "No crash, no freeze, no runaway memory growth (app does not get killed in the background)", ],
  ["PF-03", "P1", "Signed in", "Rapidly navigate back and forth between many screens", "No crash, no navigation lock-up, no duplicated screens", ],
  ["PF-04", "P1", "Any screen", "Rotate the device on several screens (if rotation is supported)", "Layout adapts without content loss or overlap", ],
  ["PF-05", "P1", "Signed in", "Receive a phone call / trigger an interruption mid-flow, then return", "The app resumes in the same place with no data loss", ],
  ["PF-06", "P2", "Signed in", "Switch between Wi-Fi and cellular mid-session", "Requests recover automatically; no permanent error state", ],
  ["PF-07", "P2", "Low battery / Low Power Mode", "Use the main flows in Low Power Mode", "The app remains usable; animations may reduce but nothing breaks", ],
  ["PF-08", "P2", "Slow network", "Throttle to a slow connection and use booking and records", "Loading indicators show; operations complete or fail with clear messages. Nothing hangs forever", ],
  ["PF-09", "P1", "Any list screen", "Scroll long lists (doctors, records, notifications) quickly", "Scrolling stays smooth; images load; no blank rows persisting", ],
  ["PF-10", "P2", "Signed in", "Leave the app open in the background overnight, then resume", "The app resumes correctly, refreshes data, and does not show stale content as current", ],
  ["PF-11", "P2", "Storage nearly full", "Attempt a document upload with very low device storage", "Fails gracefully with a clear message rather than crashing", ],
  ["PF-12", "P2", "Any screen with images", "Check doctor/clinic images and the profile photo", "Images load, are not stretched, and have sensible placeholders while loading", ],
  ["PF-13", "P3", "Any screen", "Check tap targets on a small iPhone", "All buttons are comfortably tappable; nothing requires precision tapping", ],
  ["PF-14", "P2", "Signed in", "Use VoiceOver briefly on the Dashboard and a form", "Key elements are announced meaningfully. Note gaps (accessibility is P2 for this release)", ],
  ["PF-15", "P1", "Any time a crash occurs", "If the app crashes, capture the crash immediately", "Record the exact steps, screen, time and device state. Attach the iOS crash log from Settings > Privacy > Analytics if available", ],
  ["PF-16", "P2", "App backgrounded", "Check the app-switcher snapshot on a screen showing patient data", "Note whether sensitive data is visible in the snapshot (report as a privacy observation, S3)", ],
]);

/* ───────────────── Bug Log ───────────────── */
sheets.push({
  name: "Bug Log",
  widths: [10, 13, 16, 11, 12, 30, 40, 40, 20, 14, 13, 16],
  freeze: 3,
  rows: [
    { cells: ["Bug Log — one row per defect"], style: 3, height: 26 },
    { cells: ["Link each bug back to the Test ID that found it. Attach a screenshot or recording to every row."], style: 5, height: 16 },
    { cells: ["Bug ID", "Test ID", "Module", "Severity", "Priority", "Summary (one line)", "Steps to reproduce", "Expected vs Actual", "Device / iOS / Network", "Reproducible?", "Status", "Assigned / Notes"], style: 1, height: 34 },
    ...Array.from({ length: 40 }, (_, i) => ({
      cells: [`BUG-${String(i + 1).padStart(3, "0")}`, "", "", "", "", "", "", "", "", "", "", ""],
      style: 2,
    })),
  ],
});

/* ───────────────── Sign-off ───────────────── */
sheets.push({
  name: "Sign-off Summary",
  widths: [34, 16, 16, 16, 16, 44],
  freeze: 3,
  rows: [
    { cells: ["Sign-off Summary — complete after testing"], style: 3, height: 26 },
    { cells: ["This sheet is the basis of the release decision. Totals must reconcile with the module sheets."], style: 5, height: 16 },
    { cells: ["Module", "Total", "Pass", "Fail", "Blocked", "Notes / blocking issues"], style: 1, height: 28 },
    ...[
      ["01 Auth & Onboarding", 28], ["02 Dashboard & Nav", 14], ["03 Search & Doctors", 16],
      ["04 Clinics & Map", 10], ["05 Appointments & Booking", 26], ["06 Queue (LIVE)", 18],
      ["07 Payments", 18], ["08 Records Labs Rx", 22], ["09 Profile & Family", 20],
      ["10 Notifications", 12], ["11 AI Assistant", 16], ["12 i18n RTL & Theme", 18],
      ["13 Security & Privacy", 14], ["14 Performance & Device", 16],
    ].map(([m, n]) => ({ cells: [m, String(n), "", "", "", ""], style: 2 })),
    { cells: ["TOTAL", "248", "", "", "", ""], style: 1 },
    { cells: [] },
    { cells: ["Release readiness questions"], style: 3, height: 22 },
    { cells: ["Question", "Answer", "", "", "", "Justification (required)"], style: 1, height: 26 },
    { cells: ["Any S1 (critical) defects open?", "", "", "", "", ""], style: 2 },
    { cells: ["Any S2 defects open in Queue, Payments or Auth?", "", "", "", "", ""], style: 2 },
    { cells: ["Was any cross-account data leak observed?", "", "", "", "", ""], style: 2 },
    { cells: ["Did any demo/fake patient data appear?", "", "", "", "", ""], style: 2 },
    { cells: ["Did all payment amounts match what was displayed?", "", "", "", "", ""], style: 2 },
    { cells: ["Did the Live Queue update without manual refresh?", "", "", "", "", ""], style: 2 },
    { cells: ["Recommend release to wider internal testers?", "", "", "", "", ""], style: 2 },
    { cells: ["Recommend release to EXTERNAL testers?", "", "", "", "", ""], style: 2 },
    { cells: [] },
    { cells: ["Tester name", "", "", "", "", ""], style: 2 },
    { cells: ["Date completed", "", "", "", "", ""], style: 2 },
    { cells: ["Devices covered", "", "", "", "", ""], style: 2 },
    { cells: ["Total hours spent", "", "", "", "", ""], style: 2 },
    { cells: ["Signature / approval", "", "", "", "", ""], style: 2 },
  ],
});

const out = process.argv[2];
build(sheets, out);
const total = sheets.filter((s) => /^\d\d /.test(s.name)).reduce((n, s) => n + s.rows.length - 4, 0);
console.log("  sheets      :", sheets.length);
console.log("  test cases  :", total);
console.log("  written to  :", out);

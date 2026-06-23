# Screen Reference Map — PDF ↔ Implementation

Maps every implemented screen to its reference in `MediLink_Design_Documentation.pdf`.
"Screenshot captured" = a running-app capture (see COMPARISON_REPORT.md for the device
blocker). PDF reference renders for the key screens are in
`docs/design-comparison/pdf-reference/`.

> **Run populated for visual comparison:** set `EXPO_PUBLIC_DATA_MODE=mock` (default) →
> every screen renders the PDF's seed content (Aisha Al Harthy + family) with no backend,
> so each route below can be opened and compared directly. See `DATA_LAYER.md`.

| PDF page | PDF screen name | Expo route | App screenshot captured | Match status |
|---:|---|---|---|---|
| 10 | Splash | `/splash` | ⛔ needs device | Built (Me mark + wordmark wired) |
| 10 | Welcome | `/welcome` | ⛔ needs device | Built |
| 11 | Onboarding carousel | `/onboarding` | ⛔ needs device | Built |
| 11 | Language selection | `/language` | ⛔ needs device | Built |
| 12 | Sign In | `/auth/sign-in` | ⛔ needs device | Built (Google disabled) |
| 12 | Sign Up | `/auth/sign-up` | ⛔ needs device | Built |
| 13 | OTP Verification | `/auth/otp` | ⛔ needs device | Built |
| 13 | Forgot / Reset Password | `/auth/forgot-password`, `/auth/reset-password` | ⛔ needs device | Built |
| 14 | Patient Dashboard | `/dashboard` (Home tab) | ⛔ needs device | Rebuilt to p14 |
| 15 | Personal Information | `/profile` (Profile tab) | ⛔ needs device | Rebuilt to p15 (Edit pill fixed) |
| 15 | Edit Profile | `/edit-profile` | ⛔ needs device | Built |
| 16 | Family Members | `/me` (Me tab) | ⛔ needs device | Rebuilt to p16 |
| 16 | Add Family Member | `/family/add` | ⛔ needs device | Built |
| 16 | (Edit Family Member) | `/family/[id]` | ⛔ needs device | Built |
| 17 | Switch Active Patient | `/patient-switcher` | ⛔ needs device | Built |
| (component system, pp.6) | Medical History | `/medical-history` | ⛔ needs device | Rebuilt (token inputs/chips) |
| 14–16 | Bottom navigation | `(app)/(tabs)/_layout.tsx` + `BottomTabBar` | ⛔ needs device | Built (Me submark centre) |

**Week 3 (intentionally not built):** Doctor Discovery (17–19), Doctor Profile (19–20),
Booking (20–21), Payments (22–23), Appointments (24–25), AI (26–27), Document Vault
(28–29), Lab Results (29–30), Prescriptions (30–31), Notifications (31–32), Ratings
(33), Settings (34). Search/Records tabs show honest "coming soon".

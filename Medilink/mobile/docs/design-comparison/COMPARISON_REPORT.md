# Comparison Report — App vs Design PDF

## ⚠️ Honest status on running-app screenshots

The completion rule asks for real screenshots captured from the running app
(`dark-mode/dashboard-dark-after.png`, etc.). **I could not capture these in this
environment** — there is no Android emulator / `adb`, no macOS (so no iOS Simulator),
and `react-native-web` is not installed (so no web render). I did **not** fabricate
"-after" PNGs, because faking them would misrepresent verification.

What I *did* produce as verifiable evidence instead:

1. **PDF reference renders** (the approved spec) in `pdf-reference/` — rendered from the
   source PDF at 2× with PyMuPDF.
2. **Deterministic dark-colour proof** (`../DARK_MODE_COLOR_AUDIT.md`): the theme's dark
   tokens were pixel-sampled from the PDF's own dark screens and match (`#211633` surface,
   `#3A2A53` border, `#160D25` appBg, near-black `#120C20` base).
3. **Brand-mark proof**: the official `Me` ligature and `Medilink` wordmark were
   rasterised from the package SVGs and visually confirmed against PDF p7.
4. Static verification: `tsc` 0 errors, `expo lint` 0 errors, full Android Hermes export
   succeeds with all fonts + brand PNGs bundled.

## How to capture the running-app screenshots (one-time, on a device/emulator)

Screens now render **fully populated** in mock mode (no backend needed), so a single
emulator run can capture every screen + state:

```bash
cd mobile
# .env: EXPO_PUBLIC_DATA_MODE=mock  (default) → seed data (Aisha Al Harthy + family)
npx expo start                 # press 'a' for Android emulator, or scan QR on a device
# In-app: mock sign-in lands on the dashboard; toggle dark via the theme control;
#         switch language to Arabic for RTL.
# Android emulator screenshots:
adb exec-out screencap -p > docs/design-comparison/dark-mode/dashboard-dark-after.png
```
Capture matrix to fill in: EN Light, EN Dark, AR Dark · phone (360/412) + tablet (768).

## Screen-by-screen (spec = PDF; differences fixed in code)

| Screen | PDF page | App route / ref | Differences found (before) | Fix applied | Final status |
|---|---:|---|---|---|---|
| Dashboard | 14 (`pdf-reference/p14-dashboard.png`) | `/dashboard` | dark bg too purple (`#1C1030`); no bottom nav; bell missing | dark tokens → `#0F0A18`; bottom nav + Me submark; notification bell | ✓ code-verified, ⛔ device shot pending |
| Profile | 15 (`p15-profile.png`) | `/profile` | Edit button wrapped `E/d/i/t`; purple dark surfaces | Edit → centred pill; cards `#221634` | ✓ code-verified, ⛔ shot pending |
| Family (Me) | 16 (`p16-family.png`) | `/me` | giant buttons/empty; purple dark | rebuilt; tokens; Me tab | ✓ code-verified, ⛔ shot pending |
| Medical History | components p6 | `/medical-history` | oversized purple inputs/chips | token inputs `#2B1D40`, compact add | ✓ code-verified, ⛔ shot pending |
| Sign In | 12 | `/auth/sign-in` | system fonts; dark tints | Manrope/Agatho loaded; tokens | ✓ code-verified, ⛔ shot pending |
| Bottom navigation | 14–16 | `BottomTabBar` | absent | 5 tabs + Me submark; `surface #221634` on dark | ✓ code-verified, ⛔ shot pending |
| Splash / Welcome / Onboarding | 10–11 | `/splash` … | text "Me" | official Me mark + wordmark | ✓ code-verified, ⛔ shot pending |

## PDF reference renders available

`pdf-reference/`: p04 (colour tokens), p07 (Me submark), p14 (dashboard), p15 (profile),
p16 (family), p36 (EN-light gallery), p42 & p44 (EN-dark galleries), p54 (AR-dark gallery).

# Dark-mode running-app screenshots

Place captured screenshots here (see `../COMPARISON_REPORT.md` for the exact `adb`
command). Expected files once captured on an emulator/device:

- `dashboard-dark-after.png`
- `profile-dark-after.png`
- `family-dark-after.png`
- `medical-history-dark-after.png`
- `sign-in-dark-after.png`
- `bottom-tabs-dark-after.png`

These are **not** committed yet: this environment has no Android emulator/`adb`, no macOS
(iOS Simulator), and no `react-native-web`, so a running-app capture isn't possible here.
The dark theme is instead verified deterministically in `../../DARK_MODE_COLOR_AUDIT.md`
(tokens pixel-sampled from the PDF) — no fabricated screenshots.

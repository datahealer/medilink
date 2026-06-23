# Dark-Mode Colour Audit — MediLink Mobile

**Source of truth:** `MediLink_Design_Documentation.pdf` + its machine-readable token
export `figma/design-tokens.json` (`"$description": "Values are 1:1 with the approved
MediLink Design Documentation"`), shipped in the same design package.

**Method (rigorous, not estimated):**
1. Read the canonical `semantic/dark` token set from `design-tokens.json`.
2. **Cross-validated by pixel-sampling** the rendered dark-mode screens of the PDF
   (pages 42 / 44 / 54) at 3× with PyMuPDF + Pillow. The dominant fills of the actual
   dark screens were:

   | Sampled (PDF dark screens) | Matching token | Token value |
   |---|---|---|
   | `#120C20` (most dominant = screen base) | `bg` | `#0F0A18` |
   | `#160D25` | `appBg` | `#160E26` |
   | `#211633` | `surface` (cards) | `#221634` |
   | `#2A1C40` | `surface2` (inputs) | `#2B1D40` |
   | `#3A2A53` | `border` | `#3A2B53` |
   | `#163429` | `successBg` | `#16352A` |

   The sampled values cluster on the token values (sub-pixel/JPEG variance only),
   proving the tokens are the PDF colours.

**Key correction:** the dark base is a **near-black deep violet `#0F0A18`**, *not* the
brand primary `#2E1A47`. The old theme used `#1C1030` background / `#241640` surface /
`#2A1C44` inputs — too light and too purple. Fixed.

## Token mapping (what changed)

| UI element | Old app colour (dark) | Exact PDF colour | Theme role | Status |
|---|---|---|---|---|
| Screen background | `#1C1030` | **`#0F0A18`** | `background` | ✓ Fixed |
| Card background | `#241640` | **`#221634`** | `surface` | ✓ Fixed |
| Input / search / unselected-chip background | `#2A1C44` | **`#2B1D40`** | `surfaceAlt` / `inputBackground` | ✓ Fixed |
| Border | `#3A2560` | **`#3A2B53`** | `border` | ✓ Fixed |
| Primary text | `#F9F4FA` | **`#F1EBF8`** | `text` | ✓ Fixed |
| Secondary text | `#B7AECB` | **`#B4A8C6`** | `textMuted` | ✓ Fixed |
| Faint text | _(none)_ | **`#7E7493`** | `textFaint` (new) | ✓ Added |
| Lavender CTA (primary) | `#DFC8E7` | **`#DFC8E7`** | `primary` | ✓ Already correct |
| Text on CTA | `#2E1A47` | **`#241338`** | `textOnPrimary` | ✓ Fixed |
| Selected chip bg / fill | `#DFC8E7` (primary) | **`#DFC8E7`** | `primary` (chip selected) | ✓ Correct (text on it `#241338`) |
| Accent (raised violet) | `#3A2560` | **`#4A3168`** | `accent` | ✓ Fixed |
| Accent 2 | `#33507A` | **`#2F4A6B`** | `accent2` | ✓ Fixed |
| Bottom navigation bg | `surface` (`#241640`) | **`#221634`** (`surface`) | `BottomTabBar` → `colors.surface` | ✓ Fixed via token |
| Bottom nav active icon | `#DFC8E7` | **`#DFC8E7`** | `primary` | ✓ Correct |
| Bottom nav inactive icon | `#B7AECB` | **`#B4A8C6`** | `textMuted` | ✓ Fixed |
| Success / Warning / Error / Info | mixed | `#5FCF9B` / `#E0B25A` / `#EF7D93` / `#9CC1EE` | status roles | ✓ Fixed |

Light mode was also aligned to `semantic/light` (`background #F9F4FA`, `surface #FFFFFF`,
`surfaceAlt #F4EEF9`, `border #E8E0F0`, `textOnPrimary #FFFFFF`, `textFaint #9A92A8`).

## Rules satisfied

- **No screen file contains hardcoded dark-mode colours** — grep for hex in `app/`
  returns nothing; all colour comes from `useTheme().colors.*`.
- All semantic hex lives only in `src/theme/light.ts` / `dark.ts` (composed from
  `tokens.ts`). Components (Screen, Card, Button, TextField, PasswordField, Chip,
  BottomTabBar, AppHeader, and every Profile/Dashboard/Family/Medical-History surface)
  consume roles only.
- Purple is used only where the PDF uses it: the lavender primary/CTA, raised
  surfaces/accents, selected chips, icons and the Me submark — **not** as the
  full-screen background, which is the near-black `#0F0A18`.
- Contrast preserved: `text #F1EBF8` on `bg #0F0A18` ≈ 17:1; on `surface #221634` ≈ 13:1.

## Files changed (theme only)

- `src/theme/dark.ts` — exact `semantic/dark` values.
- `src/theme/light.ts` — aligned to `semantic/light`; added `textFaint`.
- `src/theme/tokens.ts` — brand palette unchanged (still the single source for brand hex).
- Consuming components reference roles only — no per-component colour edits required.

# Brand Asset Audit — MediLink Mobile

Source design package: `C:\Users\satya\OneDrive\Desktop\Medilink APP\document\document\`
(`assets/`, `medilink-design/assets/`).

| Asset | Required location in PDF | Found in repo/package? | Actual file path | Used in app? | Status |
|---|---|---|---|---|---|
| MediLink wordmark | splash / auth / welcome | ✓ package | `…/document/assets/logo_wordmark_clean.svg` | ✓ rasterised → `mobile/assets/brand/me-wordmark.png`, used by `Logo` (full) | ✓ Done |
| **MediLink Me submark** | splash · bottom-nav centre · empty states | ✓ package | `…/document/assets/logo_monogram_clean.svg` | ✓ rasterised → `mobile/assets/brand/me-mark.png`, used by `MeMark` → `Logo`, `BottomTabBar` centre, Search/Records empty states | ✓ Done |
| Arabic lockup | RTL brand areas | ✓ package | `…/document/assets/logo_arabic_clean.svg` | ✓ rasterised → `mobile/assets/brand/me-wordmark-ar.png` (available; not yet swapped into RTL splash) | ◑ Available |
| App icon | app config | ✗ | — | not set in `app.json` | ⚠ Blocked (see below) |
| Onboarding illustrations | onboarding slides | ✗ (PDF shows abstract brand blobs, no exported illustration files) | — | onboarding uses themed brand shapes | ◑ Acceptable per brand system |
| Dashboard illustrations/cards | dashboard | n/a (PDF dashboard is composed UI, no standalone illustration asset) | — | built as native UI | ✓ n/a |

## How the Me mark was produced (official asset, not a placeholder)

The official vector `logo_monogram_clean.svg` (the brand **M+e ligature**) was
rasterised with `sharp` to a transparent silhouette `mobile/assets/brand/me-mark.png`
(660×457). It is rendered through `src/components/ui/MeMark.tsx` and recoloured per
context with `tintColor` (violet on light surfaces, lavender/eye-white on dark,
contrast colour inside the bottom-nav centre). The wordmark was produced the same way
(`me-wordmark.png`, 1200×289).

**This replaces** the previous text "Me" / circle-with-letters. There is **no** plain
text, emoji, generic user icon, or hand-made shape standing in for the mark. A visual
check of the rasterised mark against PDF p7 ("Me Submark System") confirms it is the
genuine ligature.

> `MeMarkPlaceholder.tsx` was **not** needed — the official asset was found and wired,
> so no isolated placeholder exists.

## Remaining blocker

- **App launcher icon** (`app.json` `icon` / `android.adaptiveIcon` / `ios` icon) is not
  set. The package ships logo SVGs but no square app-icon export at the required sizes.
  This does not affect in-app fidelity but should be generated from the monogram before
  store submission. Tracked, not faked.

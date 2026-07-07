# MediLink Brand Asset Audit

Source root: `…/docs/Medilink-20260619T034520Z-3-001/Medilink/`
Used to drive the shared design system. Colours verified from the PDF vector + `color/COLOR.pdf`;
icons extracted from the official `Highlights/JPEG` source (no redraws).

## 1. Recursive inventory (by folder)

- **Logo/**
  - `EN LOGO/` — `EN LOGO.ai`, `EN LOGO.eps`, 6 variants × {EPS, JPEG, SVG} (`EN LOGO-01..06`), `PDF/EN LOGO.ai`. SVGs are the usable vector wordmark "Medilink".
  - `AR LOGO/` — same structure, Arabic wordmark "ميدلنك"; **transparent PNGs present** (`PNG/AR LOGO-01..06.png`) + SVG.
  - `SUBMARK/` — the "Me" mark; **transparent PNGs** (`PNG/SUBMARK-01..06.png`) + SVG (`-01..06`) + EPS/AI/PDF.
- **Pattern/** — `AI/PATTERN.ai`, `PDF/PATTERN.pdf` (vector only; no PNG/SVG export).
- **Shapes/** — `SHAPES/shapes.ai|.pdf`; `CTA BUTTON/CTA BUTTON.ai|.pdf` (the angled CTA geometry).
- **Highlights/** — `AI/highlights.ai`, `JPEG/highlights-01..06.jpg` (01–05 = the 5 icons on lavender squares; 06 = wide composite). **Opaque JPEG only** → derived transparent PNGs (see §4).
- **FONTS/** — `agatho/` (Regular, Medium, Bold, Light, Narrow, +CAPS variants), `manrope/` (regular/medium/semibold), `abigaila-signature/` (script — not used in app). Arabic `29LTZaridSansALVF.ttf` lives under `GUIDELINE/.../Fonts/` (variable).
- **color/** — `COLOR.ai`, `COLOR.pdf` (the 4 brand swatches with Pantone/CMYK/RGB/HEX).
- **GUIDELINE/** — `04_Medilink__BRAND_Identity_Guidlines_V1.pdf` (41 pp), `.ai` (136 MB), `Fonts/` (incl. Arabic variable font + Goli).

## 2. Logo variants & which is used where

Guideline p9/p17 rule (quoted): *"the dark purple version is used on light backgrounds, the light lavender version is used on dark backgrounds."*

| Variant (SUBMARK / EN LOGO index) | Background | App usage |
|---|---|---|
| dark-purple `#2E1A47` mark/wordmark | near-white / lavender / light-blue | **Light theme** logo, light cards |
| lavender `#DFC8E7` mark/wordmark | dark purple | **Dark theme** logo |
| white mark/wordmark (`SUBMARK-05`) | violet / black | splash, welcome hero, violet appointment card |
| black / pure-white | mono fallback | not needed in-app |

Implementation: the app ships a single **white** official submark silhouette (`SUBMARK-05`,
trimmed) + the official wordmark silhouette, and **tints** per theme (violet on light,
lavender/white on dark) — so every official colour variant is reproduced from the official artwork.

## 3. Pattern / shape selection

- Patterns (p28): (1) **connected-dots/metaball**, (2) stacked circles, (3) **gradient orbs**. Vector-only (PDF/AI).
- Card watermark decision: use the official **"Me" submark** as a faint, clipped corner watermark
  (single-shape, on-brand, available as transparent PNG/SVG) + the **orb** treatment for hero
  surfaces. The connected-dot field is reserved (not placed on dense content cards — the PDF
  screen artboards don't show it on cards).
- CTA shape: official **angled parallelogram** (`Shapes/CTA BUTTON`) — already implemented in `CtaButton`.

## 4. Care / Reviews / Book / Tips / Doctors icons — FOUND

Source: **`Highlights/JPEG/highlights-01..05.jpg`** (3334² each, dark-violet line icon on lavender).
They exist only as **opaque JPEGs**, so derived transparent silhouettes were extracted
(luminance→alpha, trimmed, recolorable) — **not redrawn**. Verified 1:1 by visual check.

| Icon | Source JPEG | Derived asset |
|---|---|---|
| Care (connected loops) | `Highlights/JPEG/highlights-01.jpg` | `mobile/assets/brand/highlights/care.png` |
| Reviews (chat bubble) | `Highlights/JPEG/highlights-02.jpg` | `…/highlights/reviews.png` |
| Book (calendar + cross) | `Highlights/JPEG/highlights-03.jpg` | `…/highlights/book.png` |
| Tips (pencil) | `Highlights/JPEG/highlights-04.jpg` | `…/highlights/tips.png` |
| Doctors (stethoscope) | `Highlights/JPEG/highlights-05.jpg` | `…/highlights/doctors.png` |

## 5. Mapping table (UI usage → official source → project path)

| UI usage | Official source | Project destination / token |
|---|---|---|
| Light-mode logo (mark) | `Logo/SUBMARK/PNG/SUBMARK-05.png` (white, tinted violet) | `mobile/assets/brand/me-mark.png` |
| Dark-mode logo (mark) | same asset, tinted lavender/white | `mobile/assets/brand/me-mark.png` |
| EN wordmark | `Logo/EN LOGO/SVG/EN LOGO-*.svg` (official "Medilink" logotype) | `mobile/assets/brand/me-wordmark.png` (silhouette, tinted) |
| AR wordmark | `Logo/AR LOGO/PNG/AR LOGO-*.png` | `mobile/assets/brand/me-wordmark-ar.png` |
| Card watermark / submark | `Logo/SUBMARK/PNG/SUBMARK-05.png` | reused via `MeMark` in `PatternCard` |
| Appointment card pattern | `Logo/SUBMARK` watermark + orb | `PatternCard pattern="submark"` |
| Doctor details pattern | `Logo/SUBMARK` watermark (subtle) | `PatternCard pattern="watermark"` |
| Care/Reviews/Book/Tips/Doctors | `Highlights/JPEG/highlights-01..05.jpg` | `mobile/assets/brand/highlights/*.png` |
| English heading font | `FONTS/agatho/Agatho_*.otf` | `Agatho-Regular/Medium/Bold` |
| English body font | `FONTS/manrope/manrope-*.otf` | `Manrope-Regular…ExtraBold` |
| Arabic font | `GUIDELINE/…/Fonts/29LTZaridSansALVF.ttf` (variable) | static instances `ZaridSans-Regular/Medium/SemiBold/Bold` |
| Primary purple | `color/COLOR.pdf` Russian Violet | `#2E1A47` → `primary` |
| Lavender | `color/COLOR.pdf` Shocking Lavender | `#DFC8E7` → `accent` |
| Light blue | `color/COLOR.pdf` Smooth Pastel Blue | `#C3D7EE` → `accent2` |
| Eye White | `color/COLOR.pdf` | `#F9F4FA` → light `background` |

## 6. Unavailable / flattened / derived
- Pattern & Shapes: **vector-only** (AI/PDF) — no PNG/SVG export supplied; submark used for watermark instead of redrawing the dot field.
- Highlights icons: **JPEG-only** → derived transparent PNGs from the official source (documented §4).
- EN wordmark: official SVG exists but did not rasterize cleanly via the available tooling; the shipped silhouette matches the official logotype (verified against the guideline header). Can re-export from `EN LOGO.svg` if an exact vector is required.

## 7. Ambiguities for approval
- Whether the **Care/Reviews/Book/Tips/Doctors** illustrative icons should replace the existing
  single-stroke UI icon set on the Me Care Hub, or appear only where those exact concepts occur.
  (Preview shows both so you can choose.)
- Whether the connected-dot pattern should appear on any content card (PDF artboards do not show it on cards).

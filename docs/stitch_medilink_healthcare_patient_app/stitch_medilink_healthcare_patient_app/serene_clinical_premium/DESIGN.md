---
name: Serene Clinical Premium
colors:
  surface: '#fdf8fe'
  surface-dim: '#ddd8de'
  surface-bright: '#fdf8fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f2f8'
  surface-container: '#f1ecf2'
  surface-container-high: '#ebe7ec'
  surface-container-highest: '#e6e1e7'
  on-surface: '#1c1b1f'
  on-surface-variant: '#4a454e'
  inverse-surface: '#313034'
  inverse-on-surface: '#f4eff5'
  outline: '#7b757f'
  outline-variant: '#ccc4cf'
  surface-tint: '#6b5585'
  primary: '#180331'
  on-primary: '#ffffff'
  primary-container: '#2e1a47'
  on-primary-container: '#9981b5'
  inverse-primary: '#d6bcf4'
  secondary: '#6a5872'
  on-secondary: '#ffffff'
  secondary-container: '#efd8f7'
  on-secondary-container: '#6e5c77'
  tertiary: '#00101f'
  on-tertiary: '#ffffff'
  tertiary-container: '#122637'
  on-tertiary-container: '#7a8ea3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#eedbff'
  primary-fixed-dim: '#d6bcf4'
  on-primary-fixed: '#25113e'
  on-primary-fixed-variant: '#523d6c'
  secondary-fixed: '#f2dbfa'
  secondary-fixed-dim: '#d6bfde'
  on-secondary-fixed: '#24162c'
  on-secondary-fixed-variant: '#51415a'
  tertiary-fixed: '#d0e5fc'
  tertiary-fixed-dim: '#b5c9df'
  on-tertiary-fixed: '#081d2e'
  on-tertiary-fixed-variant: '#36495b'
  background: '#fdf8fe'
  on-background: '#1c1b1f'
  surface-variant: '#e6e1e7'
typography:
  display-lg:
    fontFamily: Agatho
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 56px
  headline-lg:
    fontFamily: Agatho
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Agatho
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 36px
  title-md:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.5px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  margin-mobile: 20px
  gutter-mobile: 12px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
  section-padding: 32px
---

## Brand & Style

The visual identity is rooted in a "Premium Clinical" aesthetic—balancing the authoritative precision of enterprise-grade healthcare with a warm, human-centric softness. It leverages a high-fashion editorial influence through its serif typography, paired with a modern, utilitarian sans-serif for functional reliability.

The style is characterized by:
- **Premium Corporate:** A sophisticated use of deep violet and pastel accents to move away from generic "medical blue" into a more luxury healthcare space.
- **Modern Softness:** Excessive sharpness is avoided. Elements use generous radii and soft, diffused depth to evoke a sense of calm and safety.
- **Biomorphic Accents:** Subtle, organic shapes (circles and blobs) derived from cellular or molecular structures provide a soft background texture that reinforces the medical narrative.

## Colors

The palette is centered on **Russian Violet**, providing a stable and trustworthy foundation. **Shocking Lavender** and **Smooth Pastel Blue** serve as the primary functional accents, used for state changes, category indicators, and brand highlights.

**Eye White** acts as the universal canvas in light mode, while dark mode transitions the Russian Violet into the primary background color, using the lavender as the lead high-contrast accent.

For RTL (Arabic) contexts, color hierarchy remains identical, ensuring brand consistency across linguistic shifts.

## Typography

This design system utilizes a high-contrast type pairing. **Agatho** (Serif) is reserved for brand moments, screen titles, and high-level headings, providing an editorial, premium feel. 

**Manrope** (Sans-serif) handles all transactional and informational UI. Its geometric clarity ensures high legibility for medical data and instructions. 

**Bi-directional Support:**
- **LTR (English):** Standard tracking and Agatho for headings.
- **RTL (Arabic):** Replace Agatho with a high-quality Serif Arabic equivalent (like IBM Plex Arabic Serif) or fallback to Manrope with increased line-height (+15%) to accommodate complex script descenders.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model specifically optimized for mobile-first constraints. 

- **Columns:** 4-column grid for mobile, expanding to 8 for tablet.
- **Rhythm:** A base-8 spacing scale is used, but specifically emphasizes "generous whitespace" to reduce cognitive load in medical contexts. 
- **Reflow:** For RTL, the entire horizontal axis is mirrored. Gutters and margins remain consistent, but the "flow of intent" begins from the top-right.

## Elevation & Depth

Depth is conveyed through **Tonal Layers** and **Ambient Shadows**. Instead of harsh black shadows, we use "Russian Violet" tinted shadows with low opacity (10-15%) and high blur radii (20px+) to create a soft, floating effect.

- **Surface 0:** Background (Eye White).
- **Surface 1:** Primary Cards (White with subtle 1px border in #DFC8E7).
- **Surface 2:** Raised elements (Modals/Overlays) with soft ambient shadows.

In dark mode, elevation is primarily indicated by tonal shifts (lighter shades of violet) rather than shadows.

## Shapes

The shape language is consistently **Rounded**. This choice mitigates the "sterile" or "scary" feel often associated with medical institutions. 

- **Cards/Containers:** 1rem (16px) corner radius.
- **Buttons:** Fully pill-shaped for high-priority actions; 12px for secondary inputs.
- **Input Fields:** 12px corner radius to match secondary buttons.

## Components

### Buttons
- **Primary:** Russian Violet background with Eye White text. Pill-shaped.
- **Secondary:** Smooth Pastel Blue background with Russian Violet text.
- **Ghost:** No background, Russian Violet border (1px), Serif text for brand moments.

### Cards
- Always rounded (16px).
- In Light mode: White background with a subtle border or a very soft shadow.
- For patient data: Use Smooth Pastel Blue headers to differentiate information blocks.

### Input Fields
- Manrope Medium for labels.
- Background: Eye White with a 1px border in #DFC8E7. 
- Active state: Border transitions to Russian Violet.

### Chips & Badges
- Used for medical statuses (e.g., "Confirmed", "Pending"). 
- Low-saturation backgrounds (Pastel Blue/Lavender) with high-saturation text.

### RTL Considerations
- Iconography must be flipped if it indicates direction (arrows, progress bars).
- Medical symbols (Stethoscope, Heart) generally remain unflipped unless they are part of a directional sequence.
import { MEDILINK_WORDMARK_RATIO } from "@/components/ui/MeMark";

/**
 * Splash composition sizing (QA MED-014).
 *
 * Pure so the proportions can be asserted without rendering: the reference artboard is a
 * fixed-size comp, but the screen it ships on is not, so every dimension is a FRACTION of
 * the live window width rather than a pixel constant. There is deliberately no device
 * width, breakpoint or `Platform` check anywhere in here — an iPhone SE, a large Android
 * phone and a tablet all get the same composition, just scaled.
 *
 * The fractions are measured off the reference:
 *   tile      ≈ 32% of width, square
 *   "Me" mark ≈ 52% of the tile
 *   wordmark  ≈ 46% of width
 *   gaps      ≈ 6% (tile→wordmark) and 5% (wordmark→tagline)
 *
 * Clamps exist only at the extremes: without an upper bound a tablet would render an
 * absurd 400pt logo, and without a lower bound a very narrow device would render an
 * illegible one. Between roughly 300pt and 460pt — every mainstream phone — the clamps
 * are inactive and the layout is purely proportional.
 */
export interface SplashMetrics {
  /** Side length of the rounded app-icon tile. */
  tileSize: number;
  /** Corner radius of that tile (kept proportional so it reads as the app icon). */
  tileRadius: number;
  /** Height of the white "Me" submark inside the tile. */
  markHeight: number;
  /** Height to pass to `MeWordmark` (its width derives from the asset ratio). */
  wordmarkHeight: number;
  /** Space between the tile and the wordmark. */
  gapAfterTile: number;
  /** Space between the wordmark and the tagline. */
  gapAfterWordmark: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function splashMetrics(width: number): SplashMetrics {
  // A non-finite or absurd width can arrive on the very first frame before layout
  // settles; fall back to a mainstream phone width rather than producing NaN styles.
  const w = Number.isFinite(width) && width > 0 ? width : 390;

  const tileSize = clamp(w * 0.32, 96, 148);
  const wordmarkWidth = clamp(w * 0.46, 140, 240);

  return {
    tileSize,
    tileRadius: tileSize * 0.27,
    markHeight: tileSize * 0.52,
    wordmarkHeight: wordmarkWidth / MEDILINK_WORDMARK_RATIO,
    gapAfterTile: clamp(w * 0.06, 16, 32),
    gapAfterWordmark: clamp(w * 0.05, 12, 26),
  };
}

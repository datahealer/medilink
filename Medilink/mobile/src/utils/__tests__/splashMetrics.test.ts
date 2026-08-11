/**
 * Splash composition geometry (QA MED-014).
 *
 * QA reported the splash content looking too small and mispositioned, and the fix scales
 * it off the reference artboard. These proportions are the whole fix, so they are pinned
 * here rather than left to be eyeballed on one device.
 *
 * The other half of MED-014 — the right-edge colour band — was a LAYOUT defect (an
 * `absoluteFill` gradient inset by its padded parent, plus a diagonal SVG gradient
 * clamping to a hard edge). That is fixed structurally in app/splash.tsx by moving the
 * gradient out of <Screen> and making it a straight vertical ramp; it cannot be asserted
 * from a pure function, so it is called out in the file's block comment and needs a
 * device to confirm.
 */
import { splashMetrics } from "../splashMetrics";
import { MEDILINK_WORDMARK_RATIO } from "@/components/ui/MeMark";

// Real window widths, smallest to largest.
const IPHONE_SE = 320;
const IPHONE_13_MINI = 375;
const IPHONE_15 = 393;
const PIXEL_7 = 412;
const IPHONE_15_PRO_MAX = 430;
const IPAD = 820;

describe("splashMetrics — scales with the window, never a fixed device width", () => {
  it("produces a larger composition on a wider screen", () => {
    const small = splashMetrics(IPHONE_SE);
    const large = splashMetrics(IPHONE_15_PRO_MAX);
    expect(large.tileSize).toBeGreaterThan(small.tileSize);
    expect(large.wordmarkHeight).toBeGreaterThan(small.wordmarkHeight);
    expect(large.gapAfterTile).toBeGreaterThanOrEqual(small.gapAfterTile);
  });

  it("is purely proportional across mainstream phones (no clamp is active there)", () => {
    // If a clamp were biting in this range the layout would stop tracking the screen and
    // start looking wrong on one device class — which is the bug being fixed.
    for (const w of [IPHONE_13_MINI, IPHONE_15, PIXEL_7, IPHONE_15_PRO_MAX]) {
      const m = splashMetrics(w);
      expect(m.tileSize).toBeCloseTo(w * 0.32, 5);
      expect(m.gapAfterTile).toBeCloseTo(w * 0.06, 5);
      expect(m.gapAfterWordmark).toBeCloseTo(w * 0.05, 5);
    }
  });

  it("never returns a hardcoded constant — every width yields distinct metrics", () => {
    const widths = [IPHONE_13_MINI, IPHONE_15, PIXEL_7, IPHONE_15_PRO_MAX];
    const tiles = new Set(widths.map((w) => splashMetrics(w).tileSize));
    expect(tiles.size).toBe(widths.length);
  });
});

describe("splashMetrics — reference proportions", () => {
  const m = splashMetrics(IPHONE_15);

  it("sizes the tile at ~32% of the screen width", () => {
    expect(m.tileSize / IPHONE_15).toBeCloseTo(0.32, 2);
  });

  it("sizes the Me mark at ~52% of the tile, so it sits inside its rounded square", () => {
    expect(m.markHeight / m.tileSize).toBeCloseTo(0.52, 2);
    expect(m.markHeight).toBeLessThan(m.tileSize);
  });

  it("sizes the wordmark at ~46% of the screen width via the asset ratio", () => {
    const wordmarkWidth = m.wordmarkHeight * MEDILINK_WORDMARK_RATIO;
    expect(wordmarkWidth / IPHONE_15).toBeCloseTo(0.46, 2);
  });

  it("makes the wordmark wider than the tile — the reference hierarchy", () => {
    expect(m.wordmarkHeight * MEDILINK_WORDMARK_RATIO).toBeGreaterThan(m.tileSize);
  });

  it("spaces tile→wordmark wider than wordmark→tagline", () => {
    // Groups the wordmark and tagline as one text block under the icon, as in the artboard.
    expect(m.gapAfterTile).toBeGreaterThan(m.gapAfterWordmark);
  });

  it("is visibly larger than the pre-fix fixed layout (tile 104 / wordmark height 30)", () => {
    // The regression QA actually reported: "screen looks larger than content".
    expect(m.tileSize).toBeGreaterThan(104);
    expect(m.wordmarkHeight).toBeGreaterThan(30);
  });
});

describe("splashMetrics — extremes stay sane", () => {
  it("stays proportional on the narrowest supported phone, above the floor", () => {
    // iPhone SE is 320pt: 320 * 0.32 = 102.4, so the 96 floor is NOT active even here.
    // The floor only exists for hypothetically narrower surfaces.
    const m = splashMetrics(IPHONE_SE);
    expect(m.tileSize).toBeCloseTo(102.4, 5);
    expect(m.tileSize).toBeGreaterThanOrEqual(96);
  });

  it("applies the floor only below the phone range", () => {
    expect(splashMetrics(200).tileSize).toBe(96);
  });

  it("clamps down on a tablet so the logo is not absurd", () => {
    const m = splashMetrics(IPAD);
    expect(m.tileSize).toBe(148);
    expect(m.wordmarkHeight * MEDILINK_WORDMARK_RATIO).toBe(240);
    expect(m.gapAfterTile).toBe(32);
  });

  it("falls back to a phone width rather than emitting NaN styles", () => {
    // The first frame can report 0 or NaN before layout settles; NaN in a style silently
    // collapses the view.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = splashMetrics(bad);
      for (const value of Object.values(m)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

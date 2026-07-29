import { useWindowDimensions } from "react-native";

/**
 * One responsive system for the whole app. Phones get a centred single column;
 * tablets get centred content with a max width (and may opt into 2 columns where
 * it genuinely helps). Driven by `useWindowDimensions` so it reacts to rotation,
 * split-screen and foldables without fixed heights.
 *
 * Breakpoint: tablet at width >= 768 (covers Android tablets in portrait and
 * iPads). Landscape is derived from width/height, not a hardcoded device list.
 */
const TABLET_MIN_WIDTH = 768;

/** Form column cap — keeps inputs/buttons from stretching on wide screens. */
export const FORM_MAX_WIDTH = 520;
/** General content cap for reading width on large tablets. */
export const CONTENT_MAX_WIDTH = 1100;

export interface Responsive {
  width: number;
  height: number;
  isTablet: boolean;
  isLandscape: boolean;
  /** 2 on tablets (where a grid helps), 1 on phones. */
  columns: number;
  /** Max content width to centre within (Infinity-safe number). */
  contentMaxWidth: number;
  formMaxWidth: number;
  /** Horizontal gutter that grows a little on tablets. */
  gutter: number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;
  const isLandscape = width > height;

  return {
    width,
    height,
    isTablet,
    isLandscape,
    columns: isTablet ? 2 : 1,
    contentMaxWidth: isTablet ? CONTENT_MAX_WIDTH : width,
    formMaxWidth: FORM_MAX_WIDTH,
    gutter: isTablet ? 24 : 16,
  };
}

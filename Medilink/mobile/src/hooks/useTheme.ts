import { useThemeContext } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";

/**
 * Primary theming hook. Returns the resolved theme (colors/spacing/radii/scheme)
 * plus the current text direction. Font family resolution lives in
 * `@/theme/typography` (`fontFamilyFor`), consumed by the Text/TextField primitives.
 */
export function useTheme() {
  const { theme, mode, setMode, toggle } = useThemeContext();
  const { isRTL } = useI18n();

  return {
    ...theme, // colors, spacing, radii, scheme
    theme,
    mode,
    setMode,
    toggle,
    isRTL,
  };
}

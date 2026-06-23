import { Platform, type ViewStyle } from "react-native";

/**
 * Cross-platform elevation. iOS uses the shadow* props; Android uses `elevation`.
 * Returning both is harmless — each platform ignores the other's keys — but we
 * branch explicitly so intent is clear and tunable per platform.
 */
export function shadow(level: 1 | 2 | 3 = 2, shadowColor = "#000"): ViewStyle {
  const map = {
    1: { radius: 3, offset: 1, opacity: 0.08, elevation: 1 },
    2: { radius: 8, offset: 2, opacity: 0.12, elevation: 3 },
    3: { radius: 16, offset: 6, opacity: 0.18, elevation: 8 },
  } as const;
  const s = map[level];

  return Platform.select<ViewStyle>({
    ios: {
      shadowColor,
      shadowOpacity: s.opacity,
      shadowRadius: s.radius,
      shadowOffset: { width: 0, height: s.offset },
    },
    android: { elevation: s.elevation },
    default: {},
  })!;
}

export const isAndroid = Platform.OS === "android";
export const isIOS = Platform.OS === "ios";

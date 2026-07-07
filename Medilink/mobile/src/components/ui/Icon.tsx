import React from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Rect, G } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import type { ThemeColors } from "@/theme/light";

/**
 * MediLink icon family — a single-stroke, rounded 24×24 set matching the
 * "Healthcare Icon Set" page of MediLink_Design_Documentation.pdf (p8): calm,
 * legible, consistent with the soft connected brand letterforms. Replaces the
 * generic Ionicons usage app-wide.
 *
 * • Outline by default (stroke = currentColor, no fill), 2px rounded strokes.
 * • A few marks (heart/star/me-grid) support `filled` for selected/active states.
 * • `chevron` takes a `direction`; it auto-mirrors under RTL so back/forward and
 *   list affordances point the correct way in Arabic.
 */
export type IconName =
  // bottom nav + core
  | "home"
  | "search"
  | "calendar"
  | "records"
  | "profile"
  | "alerts"
  | "location"
  | "map"
  | "favourite"
  | "rating"
  | "medication"
  | "lab"
  | "ai"
  | "document"
  | "payment"
  | "security"
  | "language"
  | "upload"
  | "share"
  | "time"
  | "done"
  | "done-circle"
  | "close"
  | "filter"
  // utility
  | "chevron"
  | "eye"
  | "eye-off"
  | "plus"
  | "plus-circle"
  | "settings"
  | "moon"
  | "sun"
  | "radio-on"
  | "radio-off"
  | "mail"
  | "grid"
  | "alert"
  | "info"
  | "scan"
  | "people"
  | "physio"
  | "skincare"
  | "dentist";

type Dir = "up" | "down" | "left" | "right";

export interface IconProps {
  name: IconName;
  size?: number;
  /** Theme colour role (preferred) — resolves to the active theme value. */
  color?: keyof ThemeColors;
  /** Raw colour override (use sparingly; prefer `color`). */
  tint?: string;
  /** Fill the mark (heart/star/done-circle/radio) for selected/active states. */
  filled?: boolean;
  /** Chevron pointing direction. Pass `isRTL ? "right" : "left"` for back/list affordances. */
  direction?: Dir;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const ROUND = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Each entry renders the inner SVG given (stroke, strokeWidth, filled). */
const REGISTRY: Record<
  IconName,
  (s: string, sw: number, filled: boolean) => React.ReactNode
> = {
  home: (s, sw) => (
    <>
      <Path d="M3 10.5 12 3l9 7.5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M9.5 21v-6h5v6" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  search: (s, sw) => (
    <>
      <Circle cx={11} cy={11} r={7} stroke={s} strokeWidth={sw} fill="none" />
      <Line x1={20} y1={20} x2={16} y2={16} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  calendar: (s, sw) => (
    <>
      <Rect x={3.5} y={5} width={17} height={16} rx={3} stroke={s} strokeWidth={sw} fill="none" />
      <Line x1={3.5} y1={9.5} x2={20.5} y2={9.5} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={8} y1={3} x2={8} y2={6.5} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={16} y1={3} x2={16} y2={6.5} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  records: (s, sw) => (
    <>
      <Path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M13.5 3.2V7.5H18" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Line x1={8.5} y1={12} x2={15} y2={12} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={8.5} y1={15.5} x2={15} y2={15.5} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  profile: (s, sw) => (
    <>
      <Circle cx={12} cy={8} r={4} stroke={s} strokeWidth={sw} fill="none" />
      <Path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  people: (s, sw) => (
    <>
      <Circle cx={9} cy={8} r={3.4} stroke={s} strokeWidth={sw} fill="none" />
      <Path d="M3 20c0-3.1 2.7-5 6-5s6 1.9 6 5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M16 5.2a3.4 3.4 0 0 1 0 6.6" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M17 15.2c2.5.5 4 2.3 4 4.8" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  alerts: (s, sw) => (
    <>
      <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  location: (s, sw) => (
    <>
      <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Circle cx={12} cy={10} r={2.6} stroke={s} strokeWidth={sw} fill="none" />
    </>
  ),
  map: (s, sw) => (
    <>
      <Path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Line x1={9} y1={4} x2={9} y2={18} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={15} y1={6} x2={15} y2={20} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  favourite: (s, sw, filled) => (
    <Path
      d="M12 20.5S3.5 15 3.5 8.9A4.4 4.4 0 0 1 12 6.8a4.4 4.4 0 0 1 8.5 2.1C20.5 15 12 20.5 12 20.5Z"
      stroke={s}
      strokeWidth={sw}
      fill={filled ? s : "none"}
      {...ROUND}
    />
  ),
  rating: (s, sw, filled) => (
    <Path
      d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"
      stroke={s}
      strokeWidth={sw}
      fill={filled ? s : "none"}
      {...ROUND}
    />
  ),
  medication: (s, sw) => (
    <>
      <Rect x={3.2} y={8} width={17.6} height={8} rx={4} stroke={s} strokeWidth={sw} fill="none" transform="rotate(45 12 12)" />
      <Line x1={9} y1={9} x2={15} y2={15} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  lab: (s, sw) => (
    <>
      <Path d="M9.5 3h5M10 3v6L5.5 17.5A2 2 0 0 0 7.3 20.5h9.4a2 2 0 0 0 1.8-3L14 9V3" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Line x1={8} y1={14} x2={16} y2={14} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  ai: (s, sw) => (
    <>
      <Path d="M12 3.5l1.7 4.2 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.4L6 9.4l4.3-1.7L12 3.5Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  document: (s, sw) => (
    <>
      <Path d="M7 3h6.5L19 8v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M13 3.2V8.5h5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  payment: (s, sw) => (
    <>
      <Rect x={3} y={6} width={18} height={12} rx={3} stroke={s} strokeWidth={sw} fill="none" />
      <Line x1={3} y1={10} x2={21} y2={10} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={6.5} y1={14.5} x2={11} y2={14.5} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  security: (s, sw) => (
    <>
      <Path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6l7-3Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Polyline points="9,12 11,14 15,9.5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  language: (s, sw) => (
    <>
      <Circle cx={12} cy={12} r={8.5} stroke={s} strokeWidth={sw} fill="none" />
      <Path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5S14.4 18.2 12 20.5c-2.4-2.3-3.6-5.3-3.6-8.5S9.6 5.8 12 3.5Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  upload: (s, sw) => (
    <>
      <Path d="M12 15V4.5M8 8l4-4 4 4" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M4.5 14.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  share: (s, sw) => (
    <>
      <Circle cx={6} cy={12} r={2.6} stroke={s} strokeWidth={sw} fill="none" />
      <Circle cx={17.5} cy={6} r={2.6} stroke={s} strokeWidth={sw} fill="none" />
      <Circle cx={17.5} cy={18} r={2.6} stroke={s} strokeWidth={sw} fill="none" />
      <Line x1={8.3} y1={10.8} x2={15.2} y2={7.2} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={8.3} y1={13.2} x2={15.2} y2={16.8} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  time: (s, sw) => (
    <>
      <Circle cx={12} cy={12} r={8.5} stroke={s} strokeWidth={sw} fill="none" />
      <Polyline points="12,7 12,12 15.5,14" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  done: (s, sw) => <Polyline points="5,12.5 10,17.5 19,6.5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />,
  "done-circle": (s, sw, filled) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={s} strokeWidth={sw} fill={filled ? s : "none"} />
      <Polyline points="8,12.2 11,15 16,9" stroke={filled ? "#fff" : s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  close: (s, sw) => (
    <>
      <Line x1={6} y1={6} x2={18} y2={18} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={18} y1={6} x2={6} y2={18} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  filter: (s, sw) => (
    <>
      <Line x1={4} y1={7} x2={20} y2={7} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={4} y1={12} x2={20} y2={12} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={4} y1={17} x2={20} y2={17} stroke={s} strokeWidth={sw} {...ROUND} />
      <Circle cx={9} cy={7} r={2.2} stroke={s} strokeWidth={sw} fill="none" />
      <Circle cx={15} cy={12} r={2.2} stroke={s} strokeWidth={sw} fill="none" />
      <Circle cx={8} cy={17} r={2.2} stroke={s} strokeWidth={sw} fill="none" />
    </>
  ),
  chevron: (s, sw) => <Polyline points="9,5 16,12 9,19" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />,
  eye: (s, sw) => (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Circle cx={12} cy={12} r={3} stroke={s} strokeWidth={sw} fill="none" />
    </>
  ),
  "eye-off": (s, sw) => (
    <>
      <Path d="M4 5l16 14M9.5 5.9A8 8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-2.7 3.3M6 7.6A15 15 0 0 0 2.5 12S6 18.5 12 18.5a8 8 0 0 0 2.6-.4" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Path d="M9.9 10.2a3 3 0 0 0 4 4" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  plus: (s, sw) => (
    <>
      <Line x1={12} y1={5} x2={12} y2={19} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={5} y1={12} x2={19} y2={12} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  "plus-circle": (s, sw) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={s} strokeWidth={sw} fill="none" />
      <Line x1={12} y1={8} x2={12} y2={16} stroke={s} strokeWidth={sw} {...ROUND} />
      <Line x1={8} y1={12} x2={16} y2={12} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  settings: (s, sw) => (
    <>
      <Circle cx={12} cy={12} r={3.2} stroke={s} strokeWidth={sw} fill="none" />
      <Path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  moon: (s, sw) => <Path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />,
  sun: (s, sw) => (
    <>
      <Circle cx={12} cy={12} r={4} stroke={s} strokeWidth={sw} fill="none" />
      <Path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5M18.7 18.7l-1.5-1.5M6.8 6.8 5.3 5.3" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  "radio-on": (s, sw) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={s} strokeWidth={sw} fill="none" />
      <Circle cx={12} cy={12} r={4} fill={s} />
    </>
  ),
  "radio-off": (s, sw) => <Circle cx={12} cy={12} r={9} stroke={s} strokeWidth={sw} fill="none" />,
  mail: (s, sw) => (
    <>
      <Rect x={3} y={5.5} width={18} height={13} rx={3} stroke={s} strokeWidth={sw} fill="none" />
      <Path d="M4 7.5l8 5.5 8-5.5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
    </>
  ),
  grid: (s, sw) => (
    <>
      <Rect x={4} y={4} width={7} height={7} rx={2} stroke={s} strokeWidth={sw} fill="none" />
      <Rect x={13} y={4} width={7} height={7} rx={2} stroke={s} strokeWidth={sw} fill="none" />
      <Rect x={4} y={13} width={7} height={7} rx={2} stroke={s} strokeWidth={sw} fill="none" />
      <Rect x={13} y={13} width={7} height={7} rx={2} stroke={s} strokeWidth={sw} fill="none" />
    </>
  ),
  alert: (s, sw) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={s} strokeWidth={sw} fill="none" />
      <Line x1={12} y1={7.5} x2={12} y2={13} stroke={s} strokeWidth={sw} {...ROUND} />
      <Circle cx={12} cy={16.3} r={0.6} fill={s} stroke={s} strokeWidth={sw} />
    </>
  ),
  info: (s, sw) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={s} strokeWidth={sw} fill="none" />
      <Line x1={12} y1={11} x2={12} y2={16.5} stroke={s} strokeWidth={sw} {...ROUND} />
      <Circle cx={12} cy={7.7} r={0.6} fill={s} stroke={s} strokeWidth={sw} />
    </>
  ),
  scan: (s, sw) => (
    <>
      <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
      <Line x1={4} y1={12} x2={20} y2={12} stroke={s} strokeWidth={sw} {...ROUND} />
    </>
  ),
  physio: (s, sw) => (
    <Polyline points="3,13 8,13 10.5,6 13.5,18 16,13 21,13" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
  ),
  skincare: (s, sw) => (
    <Path d="M12 3.5c3.2 3.4 5.5 6.4 5.5 9.4a5.5 5.5 0 0 1-11 0c0-3 2.3-6 5.5-9.4Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
  ),
  dentist: (s, sw) => (
    <Path d="M7 3.5C5 3.5 4 5 4 7.5c0 2 .6 3.5 1.2 6 .5 2.2.6 5 2 5 1.2 0 1.3-2.2 1.9-4 .4-1.2.8-1.6 2.9-1.6s2.5.4 2.9 1.6c.6 1.8.7 4 1.9 4 1.4 0 1.5-2.8 2-5 .6-2.5 1.2-4 1.2-6C20 5 19 3.5 17 3.5c-1.8 0-2.9 1-5 1s-3.2-1-5-1Z" stroke={s} strokeWidth={sw} fill="none" {...ROUND} />
  ),
};

/** Maps legacy Ionicon-style names (e.g. from data) onto the brand set. */
const ALIASES: Record<string, IconName> = {
  "medkit-outline": "medication",
  "flask-outline": "lab",
  "scan-outline": "scan",
  "heart-outline": "favourite",
  "sparkles-outline": "ai",
  "people-outline": "people",
  "fitness-outline": "physio",
  "rose-outline": "skincare",
  "happy-outline": "dentist",
};

export function resolveIconName(name: string): IconName {
  if (name in REGISTRY) return name as IconName;
  return ALIASES[name] ?? "info";
}

/** Single-stroke brand icon. Use everywhere instead of Ionicons. */
export function Icon({
  name,
  size = 24,
  color = "text",
  tint,
  filled = false,
  direction,
  strokeWidth = 1.9,
  style,
  accessibilityLabel,
}: IconProps) {
  const { colors } = useTheme();
  const stroke = tint ?? colors[color];
  const render = REGISTRY[name] ?? REGISTRY.info;

  // Chevron rotation: base path points right; caller supplies the direction
  // (already RTL-resolved at the call site, matching the app's `isRTL` convention).
  let rotation = 0;
  if (name === "chevron") {
    rotation = { right: 0, down: 90, left: 180, up: 270 }[direction ?? "right"];
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
    >
      {rotation ? <G origin="12, 12" rotation={rotation}>{render(stroke, strokeWidth, filled)}</G> : render(stroke, strokeWidth, filled)}
    </Svg>
  );
}

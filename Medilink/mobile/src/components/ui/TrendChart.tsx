import React from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";

const VB_W = 300;
const VB_H = 120;
const PAD = 12;

export interface TrendPoint {
  value: number;
}

/**
 * Minimal line chart for a numeric time series (react-native-svg). Chronological
 * left→right (time axis is not mirrored in RTL, matching common chart convention).
 * A single point renders just a dot (no line). Callers pass already-filtered numeric
 * points; render nothing for an empty series.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const { colors } = useTheme();
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = points.length;

  const x = (i: number) => (n === 1 ? VB_W / 2 : PAD + (i * (VB_W - PAD * 2)) / (n - 1));
  const y = (v: number) => VB_H - PAD - ((v - min) / span) * (VB_H - PAD * 2);
  const polyline = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const gridYs = [PAD, VB_H / 2, VB_H - PAD];

  return (
    <View accessibilityRole="image">
      <Svg width="100%" height={130} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        {gridYs.map((gy) => (
          <Line key={gy} x1={0} y1={gy} x2={VB_W} y2={gy} stroke={colors.border} strokeWidth={0.5} />
        ))}
        {n > 1 ? (
          <Polyline
            points={polyline}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {points.map((p, i) => (
          <Circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill={colors.primary} />
        ))}
      </Svg>
    </View>
  );
}

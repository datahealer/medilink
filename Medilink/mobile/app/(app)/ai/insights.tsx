import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { AppCard, AppHeader, MeMark, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

// Static viewBox geometry for the trend chart (responsive width via width="100%").
const VB_W = 200;
const VB_H = 80;
const TREND_POINTS = [
  [8, 58],
  [40, 50],
  [72, 56],
  [104, 38],
  [136, 30],
  [168, 22],
  [192, 18],
] as const;
const GRID_Y = [20, 40, 60];

/** AI Insights & Risk (design p27) — static vitals trend chart + visit summary. */
export default function AiInsightsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const polyline = TREND_POINTS.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
    >
      <AppHeader
        title={t("aiInsights.title")}
        showBack
        right={<MeMark height={16} color={colors.primary} />}
      />

      <AppCard variant="detail" style={{ marginBottom: spacing.lg }}>
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text variant="label" style={styles.flex} align={isRTL ? "right" : "left"}>
            {t("aiInsights.vitalsTrend")}
          </Text>
          <Text variant="caption" color="textMuted">
            {t("aiInsights.lastMonths")}
          </Text>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Svg width="100%" height={120} viewBox={`0 0 ${VB_W} ${VB_H}`}>
            {GRID_Y.map((y) => (
              <Line key={y} x1={0} y1={y} x2={VB_W} y2={y} stroke={colors.border} strokeWidth={0.5} />
            ))}
            <Polyline
              points={polyline}
              fill="none"
              stroke={colors.primary}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {TREND_POINTS.map(([x, y]) => (
              <Circle key={`${x}-${y}`} cx={x} cy={y} r={2.5} fill={colors.primary} />
            ))}
          </Svg>
        </View>

        <View style={[styles.legend, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.sm }]}>
          <View style={[styles.legendItem, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <Text variant="caption" color="textMuted" style={styles.legendLabel}>
              {t("aiInsights.bp")}
            </Text>
          </View>
          <View style={[styles.legendItem, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <Text variant="caption" color="textMuted" style={styles.legendLabel}>
              {t("aiInsights.heartRate")}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.callout,
            { backgroundColor: colors.successSurface, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.md },
          ]}
        >
          <Text variant="caption" color="success" align={isRTL ? "right" : "left"}>
            {t("aiInsights.progressNote")}
          </Text>
        </View>
      </AppCard>

      <AppCard variant="detail">
        <Text variant="title" align={isRTL ? "right" : "left"}>
          {t("aiInsights.visitSummary", { date: "2 May" })}
        </Text>
        <View style={[styles.byline, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.xs }]}>
          <MeMark height={14} color={colors.primary} />
          <Text
            variant="caption"
            color="textMuted"
            style={isRTL ? { marginEnd: spacing.xs } : { marginStart: spacing.xs }}
          >
            {t("aiInsights.byAssistant")}
          </Text>
        </View>
        <Text variant="body" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.sm }}>
          {t("aiInsights.summaryBody")}
        </Text>
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  flex: { flex: 1 },
  legend: { alignItems: "center", gap: 16 },
  legendItem: { alignItems: "center" },
  legendLabel: { marginHorizontal: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  callout: { width: "100%" },
  byline: { alignItems: "center" },
});

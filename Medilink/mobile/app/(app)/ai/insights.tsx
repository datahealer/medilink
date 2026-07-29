import React from "react";
import { StyleSheet, View } from "react-native";

import { AppCard, AppHeader, EmptyState, ErrorState, LoadingState, MeMark, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useVisitSummary } from "@/hooks/queries/useAi";
import { formatApptDate } from "@/utils/appointments";

/**
 * AI Insights & Risk (design p27) — real AI-generated visit summary.
 *
 * The screen intentionally has no vitals-trend chart: MediLink has no vitals data
 * source, so showing a trend here would be fabricated clinical data. The only card
 * is the genuine visit summary (`appointments.patient_summary`); it will grow to
 * include real signals once a backing data source exists.
 */
export default function AiInsightsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const visit = useVisitSummary();

  const summaryDate = visit.data?.date ? formatApptDate(visit.data.date.slice(0, 10), t, num) : "";

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

      {/* AI visit summary — real (appointments.patient_summary). */}
      <AppCard variant="detail">
        {visit.isLoading ? (
          <LoadingState />
        ) : visit.isError ? (
          <ErrorState message={t("aiInsights.loadError")} onRetry={() => visit.refetch()} />
        ) : !visit.data ? (
          <EmptyState title={t("aiInsights.noSummaryTitle")} body={t("aiInsights.noSummaryBody")} />
        ) : (
          <>
            <Text variant="title" align={isRTL ? "right" : "left"}>
              {t("aiInsights.visitSummary", { date: summaryDate || "—" })}
            </Text>
            <View style={[styles.byline, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.xs }]}>
              <MeMark height={14} color={colors.primary} />
              <Text
                variant="caption"
                color="textMuted"
                style={isRTL ? { marginEnd: spacing.xs } : { marginStart: spacing.xs }}
              >
                {visit.data.doctorName || t("aiInsights.byAssistant")}
              </Text>
            </View>
            <Text variant="body" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.sm }}>
              {visit.data.summary}
            </Text>
          </>
        )}
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  byline: { alignItems: "center" },
});

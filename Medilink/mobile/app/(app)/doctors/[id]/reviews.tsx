import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AppHeader, Avatar, Card, EmptyState, ErrorState, Icon, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useDoctorReviews } from "@/hooks/queries/useDoctors";
import { formatApptDate } from "@/utils/appointments";

function Stars({ rating, size = 14, color }: { rating: number; size?: number; color: string }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="rating" filled={n <= Math.round(rating)} size={size} tint={color} />
      ))}
    </View>
  );
}

/** Doctor Reviews (PDF p20): rating breakdown + individual reviews. */
export default function DoctorReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const data = useDoctorReviews(String(id ?? ""));
  const starColor = colors.warning;

  if (data.isLoading) {
    return <Screen padded><AppHeader title={t("reviews.title")} /><LoadingState /></Screen>;
  }
  if (data.isError || !data.data) {
    return (
      <Screen padded>
        <AppHeader title={t("reviews.title")} />
        <ErrorState message={t("doctor.loadError")} onRetry={() => data.refetch()} />
      </Screen>
    );
  }

  const { summary, reviews } = data.data;
  const maxCount = Math.max(1, ...summary.distribution.map((d) => d.count));

  return (
    <Screen scroll padded contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title={t("reviews.title")} />

      {/* Summary */}
      <Card>
        <View style={[styles.summary, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.scoreBox, isRTL ? { marginStart: spacing.lg } : { marginEnd: spacing.lg }]}>
            <Text variant="display">{summary.average.toFixed(1)}</Text>
            <Stars rating={summary.average} color={starColor} />
            <Text variant="caption" color="textMuted">{t("reviews.count", { count: summary.total })}</Text>
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            {summary.distribution.map((row) => (
              <View key={row.stars} style={[styles.distRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Text variant="caption" color="textMuted" style={styles.distNum}>{row.stars}</Text>
                <View style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radii.pill }]}>
                  <View style={[styles.fill, { width: `${(row.count / maxCount) * 100}%`, backgroundColor: colors.primary, borderRadius: radii.pill }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {/* Reviews */}
      {reviews.length === 0 ? (
        <EmptyState title={t("reviews.empty")} />
      ) : (
        reviews.map((r) => {
          const authorName = r.author || t("reviews.verifiedPatient");
          return (
            <Card key={r.id} style={{ marginTop: spacing.md }}>
              <View style={[styles.reviewHead, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Avatar name={authorName} size={36} />
                <Text variant="title" numberOfLines={1} style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>{authorName}</Text>
                <Stars rating={r.rating} color={starColor} />
              </View>
              {r.comment ? (
                <Text variant="body" color="textMuted" style={{ marginTop: 8 }}>{r.comment}</Text>
              ) : null}
              <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
                {formatApptDate(r.date?.slice(0, 10) ?? null, t, num)}
              </Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { alignItems: "center" },
  scoreBox: { alignItems: "center" },
  distRow: { alignItems: "center", gap: 8, marginVertical: 3 },
  distNum: { width: 12, textAlign: "center" },
  track: { flex: 1, height: 8, overflow: "hidden" },
  fill: { height: 8 },
  reviewHead: { alignItems: "center" },
});

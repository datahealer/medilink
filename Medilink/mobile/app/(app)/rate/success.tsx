import React from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Avatar, Button, Card, Icon, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

const STARS = [0, 1, 2, 3, 4] as const;

/** Review Submission — centred confirmation after a rating (design p33). */
export default function RatingSuccessScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const { rating, doctor } = useLocalSearchParams<{ rating?: string; doctor?: string }>();
  const submittedRating = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  const doctorName = typeof doctor === "string" && doctor.length ? doctor : t("reviews.verifiedPatient");

  const onBackToAppointments = () => router.replace("/appointments");
  const onRateClinic = () => router.back();

  return (
    <Screen
      scroll
      padded
      center
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label={t("rating.backToAppointments")} onPress={onBackToAppointments} />
          <Button label={t("rating.rateClinic")} variant="ghost" onPress={onRateClinic} />
        </View>
      }
    >
      <View style={styles.hero}>
        <View
          style={[
            styles.badge,
            { backgroundColor: colors.successSurface, borderRadius: radii.pill },
          ]}
        >
          <Icon name="done-circle" size={44} tint={colors.success} />
        </View>

        <Text variant="h2" align="center" style={{ marginTop: spacing.md }}>
          {t("rating.thankYouTitle")}
        </Text>
        <Text variant="body" color="textMuted" align="center" style={{ marginTop: 4 }}>
          {t("rating.thankYouBody")}
        </Text>
      </View>

      <View style={{ height: spacing.lg }} />

      {/* Recap card */}
      <Card style={{ width: "100%" }}>
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={doctorName} size={48} />
          <View style={styles.recapMeta}>
            <Text variant="title">{doctorName}</Text>
            <View style={[styles.stars, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {STARS.map((i) => (
                <Icon
                  key={i}
                  name="rating"
                  size={16}
                  filled={i < submittedRating}
                  tint={colors.warning}
                />
              ))}
            </View>
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center" },
  badge: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  row: { alignItems: "center", gap: 12 },
  recapMeta: { flex: 1, gap: 6 },
  stars: { gap: 2 },
});

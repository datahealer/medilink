import React from "react";
import { StyleSheet, View } from "react-native";

import { AppCard, AppHeader, Icon, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

// Defaults from facility_settings (per-facility overrides exist server-side):
// cancellation_cutoff_hours=3, reschedule_cutoff_hours=4, partial_refund_percent=50.
const CANCEL_CUTOFF_H = 3;
const RESCHEDULE_CUTOFF_H = 4;
const PARTIAL_REFUND_PCT = 50;

/** Cancellation & refund policy (PDF p26) — static content reflecting backend defaults. */
export default function RefundPolicyScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const points = [
    t("appointments.policyCancel", { h: num(String(CANCEL_CUTOFF_H)) }),
    t("appointments.policyReschedule", { h: num(String(RESCHEDULE_CUTOFF_H)) }),
    t("appointments.policyRefundFull"),
    t("appointments.policyRefundPartial", { p: num(String(PARTIAL_REFUND_PCT)) }),
    t("appointments.policyFacilityCancel"),
  ];

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
    >
      <AppHeader title={t("appointments.policyTitle")} showBack />

      <View style={{ height: spacing.sm }} />
      <AppCard variant="detail">
        {points.map((p, i) => (
          <View key={i} style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }, i > 0 ? { marginTop: 14 } : null]}>
            <Icon name="done" size={18} tint={colors.success} />
            <Text variant="body" style={[styles.text, isRTL ? { marginEnd: 10 } : { marginStart: 10 }]} align={isRTL ? "right" : "left"}>
              {p}
            </Text>
          </View>
        ))}
      </AppCard>

      <Text variant="caption" color="textMuted" style={{ marginTop: spacing.md }} align={isRTL ? "right" : "left"}>
        {t("appointments.policyNote")}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start" },
  text: { flex: 1 },
});

import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AppCard, AppHeader, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

type TierTone = "success" | "warning" | "muted";

interface Tier {
  windowKey: "appointments.policyWindowFull" | "appointments.policyWindow50" | "appointments.policyWindow10" | "appointments.policyWindowNone";
  kindKey: "appointments.policyKindFull" | "appointments.policyKindPartial" | "appointments.policyKindNone";
  pct: number;
  tone: TierTone;
}

const TIERS: Tier[] = [
  { windowKey: "appointments.policyWindowFull", kindKey: "appointments.policyKindFull", pct: 100, tone: "success" },
  { windowKey: "appointments.policyWindow50", kindKey: "appointments.policyKindPartial", pct: 50, tone: "warning" },
  { windowKey: "appointments.policyWindow10", kindKey: "appointments.policyKindPartial", pct: 10, tone: "warning" },
  { windowKey: "appointments.policyWindowNone", kindKey: "appointments.policyKindNone", pct: 0, tone: "muted" },
];

/**
 * Refund Policy (design p26) — tiered rules by cancellation window, an optional
 * worked example for the appointment that linked here, and the return-timing note.
 * Opened from the Cancel sheet with ?fee&pct&amount to render the example.
 */
export default function RefundPolicyScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { fee, pct, amount } = useLocalSearchParams<{ fee?: string; pct?: string; amount?: string }>();

  const toneColor = (tone: TierTone) =>
    tone === "success" ? colors.success : tone === "warning" ? colors.warning : colors.textMuted;

  const showExample = fee != null && pct != null && amount != null && Number(pct) > 0 && Number(pct) < 100;

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
    >
      <AppHeader title={t("appointments.policyTitle")} showBack />

      <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm }} align={isRTL ? "right" : "left"}>
        {t("appointments.policyIntro")}
      </Text>

      <View style={{ height: spacing.md }} />
      <AppCard variant="detail">
        {TIERS.map((tier, i) => (
          <View
            key={tier.windowKey}
            style={[
              styles.row,
              { flexDirection: isRTL ? "row-reverse" : "row" },
              i > 0 ? { marginTop: spacing.md, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md } : null,
            ]}
          >
            <View style={styles.flex}>
              <Text variant="body" align={isRTL ? "right" : "left"}>{t(tier.windowKey)}</Text>
              <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: 2 }}>
                {t(tier.kindKey)}
              </Text>
            </View>
            <View style={[styles.pct, { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm }]}>
              <Text variant="title" style={{ color: toneColor(tier.tone) }}>
                {num(String(tier.pct))}%
              </Text>
            </View>
          </View>
        ))}
      </AppCard>

      {showExample ? (
        <View style={[styles.example, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md, marginTop: spacing.md }]}>
          <Text variant="body" align={isRTL ? "right" : "left"}>
            {t("appointments.policyExample", {
              window: t("appointments.policyWindowSoon"),
              pct: num(String(pct)),
              fee: num(String(fee)),
              amount: num(String(amount)),
            })}
          </Text>
        </View>
      ) : null}

      <Text variant="caption" color="textMuted" style={{ marginTop: spacing.md }} align={isRTL ? "right" : "left"}>
        {t("appointments.policyReturnNote")}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  flex: { flex: 1 },
  pct: { minWidth: 60, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
  example: { padding: 14 },
});

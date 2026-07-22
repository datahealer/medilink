import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { usePayments } from "@/hooks/queries/usePatient";
import type { Payment } from "@/data/types";
import { formatApptDate } from "@/utils/appointments";
import { payCategory, payStatusLabel, payTone } from "@/utils/payments";

/** Payment History (read side) — the patient's payments, newest first. */
export default function PaymentsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const query = usePayments();
  const payments = query.data ?? [];
  const money = (n: number | null | undefined) => `OMR ${num((n ?? 0).toFixed(3))}`;

  const subtitle = (p: Payment) => {
    const a = p.appointment;
    return [a?.doctor?.specialty, formatApptDate(a?.slot_date?.slice(0, 10), t, num) || a?.slot_date]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
    >
      <AppHeader title={t("payments.title")} showBack />

      <View style={{ height: spacing.sm }} />
      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={t("payments.loadError")} onRetry={() => query.refetch()} />
      ) : payments.length === 0 ? (
        <EmptyState title={t("payments.empty")} body={t("payments.emptyBody")} />
      ) : (
        payments.map((p) => {
          const tone = payTone(colors, payCategory(p.status));
          return (
            <Card key={p.id} onPress={() => router.push(`/payments/invoice/${p.id}`)} style={{ marginBottom: spacing.sm }}>
              <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.flex}>
                  <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>
                    {p.appointment?.doctor?.full_name || "—"}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>
                    {subtitle(p)}
                  </Text>
                </View>
                <View style={[styles.right, isRTL ? { alignItems: "flex-start" } : { alignItems: "flex-end" }]}>
                  <Text variant="title">{money(p.amount)}</Text>
                  <View style={[styles.pill, { backgroundColor: tone.bg, marginTop: 4 }]}>
                    <Text variant="caption" weight="700" style={{ color: tone.fg }}>{payStatusLabel(p.status, t)}</Text>
                  </View>
                </View>
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", justifyContent: "space-between" },
  flex: { flex: 1 },
  right: { marginStart: 12 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});

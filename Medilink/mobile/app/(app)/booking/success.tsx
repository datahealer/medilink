import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Button, Icon, Screen, SummaryCard, type SummaryRow, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useBookingStore } from "@/stores/bookingStore";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Booking step (success) — Appointment Success (PDF p21). */
export default function BookingSuccessScreen() {
  const { spacing, colors, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const confirmed = useBookingStore((s) => s.confirmed);
  const doctorName = useBookingStore((s) => s.doctorName);
  const clinicName = useBookingStore((s) => s.clinicName);
  const dateLabel = useBookingStore((s) => s.dateLabel);
  const slot = useBookingStore((s) => s.slot);
  const patientName = useBookingStore((s) => s.patientName);
  const fee = useBookingStore((s) => s.fee);

  const total = confirmed?.total ?? round3(fee * 1.05);
  const bookingId = confirmed?.id ?? "—";
  const when = `${dateLabel}${slot ? ` · ${slot}` : ""}`;

  const rows: SummaryRow[] = [
    { label: t("booking.bookingId"), value: bookingId },
    { label: t("booking.clinic"), value: clinicName || "—" },
    { label: t("booking.dateTime"), value: when || "—" },
    { label: t("booking.patient"), value: patientName || "—" },
    { label: t("booking.paid"), value: `OMR ${num(total.toFixed(3))}` },
  ];

  const onAddToCalendar = () => Alert.alert(t("booking.addToCalendar"), t("dashboard.comingSoon"));
  // Appointments list/details are not built yet — return to the Dashboard.
  const onViewAppointment = () => router.replace("/dashboard");

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label={t("booking.viewAppointment")} onPress={onViewAppointment} />
          <Button label={t("booking.addToCalendar")} variant="outline" onPress={onAddToCalendar} />
        </View>
      }
    >
      {/* Close → home (terminal screen, no back) */}
      <View style={[styles.closeRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => router.replace("/dashboard")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.done")} style={[styles.close, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Icon name="close" size={18} tint={colors.text} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={[styles.check, { backgroundColor: colors.successSurface, borderRadius: radii.pill }]}>
          <Icon name="done" size={40} tint={colors.success} strokeWidth={2.4} />
        </View>
        <Text variant="h2" align="center" style={{ marginTop: spacing.md }}>{t("booking.successTitle")}</Text>
        <Text variant="body" color="textMuted" align="center" style={{ marginTop: 4 }}>
          {t("booking.successSubtitle", { doctor: doctorName || "—", date: when || "—" })}
        </Text>
      </View>

      <View style={{ height: spacing.lg }} />
      <SummaryCard rows={rows} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeRow: { justifyContent: "flex-end" },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth * 2 },
  hero: { alignItems: "center", marginTop: 8 },
  check: { width: 84, height: 84, alignItems: "center", justifyContent: "center" },
});

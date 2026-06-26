import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import {
  AppCard,
  AppHeader,
  Avatar,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SummaryCard,
  type SummaryRow,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useAppointment } from "@/hooks/queries/usePatient";
import { apptStatusCategory, apptStatusLabel, apptTone, formatApptDate, formatApptTime } from "@/utils/appointments";

/** Appointment Details (PDF p24) — read-only this batch; actions land in batch 2. */
export default function AppointmentDetailsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useAppointment(String(id ?? ""));
  const a = query.data;

  if (query.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("appointments.detailsTitle")} showBack />
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen padded>
        <AppHeader title={t("appointments.detailsTitle")} showBack />
        <ErrorState message={t("appointments.loadError")} onRetry={() => query.refetch()} />
      </Screen>
    );
  }
  if (!a) {
    return (
      <Screen padded>
        <AppHeader title={t("appointments.detailsTitle")} showBack />
        <EmptyState title={t("appointments.notFoundTitle")} body={t("appointments.notFoundBody")} />
      </Screen>
    );
  }

  const tone = apptTone(colors, apptStatusCategory(a.status));
  const typeLabel = a.type === "online" ? t("appointments.online") : t("appointments.inPerson");
  const patient = a.for_family_member?.full_name || t("appointments.you");

  const rows: SummaryRow[] = [
    { label: t("appointments.reference"), value: a.reference_number || "—" },
    {
      label: t("appointments.dateTime"),
      value: `${formatApptDate(a.slot_date, t, num)} · ${formatApptTime(a.slot_start, num)}`.trim() || "—",
    },
    { label: t("appointments.type"), value: typeLabel },
    { label: t("appointments.clinic"), value: a.facility?.name || "—" },
    { label: t("appointments.patient"), value: patient },
    { label: t("appointments.reason"), value: a.reason_for_visit || "—" },
  ];

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
    >
      <AppHeader title={t("appointments.detailsTitle")} showBack />

      {/* Status */}
      <View style={[styles.statusRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
          <Text variant="caption" style={{ color: tone.fg, letterSpacing: 0.4 }}>
            {apptStatusLabel(a.status, t).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Doctor */}
      <View style={{ height: spacing.sm }} />
      <AppCard variant="detail">
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={a.doctor?.full_name ?? undefined} size={48} />
          <View style={[styles.flex, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
            <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>
              {a.doctor?.full_name || "—"}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>
              {a.facility?.name || "—"}
            </Text>
          </View>
        </View>
      </AppCard>

      <View style={{ height: spacing.sm }} />
      <SummaryCard rows={rows} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { marginTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  row: { alignItems: "center" },
  flex: { flex: 1 },
});

import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  AppCard,
  AppHeader,
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  SummaryCard,
  type SummaryRow,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useAppointment, useCancelAppointment, useCheckInAppointment, useProfile } from "@/hooks/queries/usePatient";
import { apptStatusCategory, apptStatusLabel, apptTone, formatApptDate, formatApptTime } from "@/utils/appointments";

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Appointment Details (PDF p24) — full detail + status-driven actions. */
export default function AppointmentDetailsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId ?? "");

  const query = useAppointment(id);
  const profile = useProfile();
  const cancel = useCancelAppointment();
  const checkIn = useCheckInAppointment();
  const a = query.data;

  const onCheckIn = () =>
    Alert.alert(t("appointments.checkInTitle"), t("appointments.checkInMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("appointments.confirmCheckIn"),
        onPress: () =>
          checkIn.mutate(id, {
            onSuccess: () => Alert.alert(t("appointments.checkedInDone")),
            onError: (e) => Alert.alert(t("appointments.actionFailed"), errMsg(e)),
          }),
      },
    ]);

  const onCancel = () =>
    Alert.alert(t("appointments.cancelTitle"), t("appointments.cancelMessage"), [
      { text: t("appointments.keep"), style: "cancel" },
      {
        text: t("appointments.confirmCancel"),
        style: "destructive",
        onPress: () =>
          cancel.mutate(
            { id },
            {
              onSuccess: () => router.back(),
              onError: (e) => Alert.alert(t("appointments.actionFailed"), errMsg(e)),
            }
          ),
      },
    ]);

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

  const status = a.status ?? "";
  const tone = apptTone(colors, apptStatusCategory(status));
  const typeLabel = a.type === "online" ? t("appointments.online") : t("appointments.inPerson");
  const patient = a.for_family_member?.full_name || profile.data?.account?.full_name || t("appointments.you");

  const fee = a.fee_omr ?? 0;
  const vat = round3(fee * 0.05);
  const total = round3(fee + vat);
  const money = (n: number) => `OMR ${num(n.toFixed(3))}`;

  const detailRows: SummaryRow[] = [
    { label: t("appointments.reference"), value: a.reference_number || "—" },
    { label: t("appointments.dateTime"), value: `${formatApptDate(a.slot_date, t, num)} · ${formatApptTime(a.slot_start, num)}`.trim() || "—" },
    { label: t("appointments.type"), value: typeLabel },
    { label: t("appointments.clinic"), value: a.facility?.name || "—" },
    { label: t("appointments.patient"), value: patient },
    { label: t("appointments.reason"), value: a.reason_for_visit || "—" },
    ...(a.notes ? [{ label: t("appointments.notes"), value: a.notes }] : []),
  ];
  const feeRows: SummaryRow[] = [
    { label: t("appointments.consultationFee"), value: money(fee) },
    { label: t("appointments.vat"), value: money(vat) },
    { label: t("appointments.total"), value: money(total) },
  ];

  const showCheckIn = status === "confirmed";
  const showReschedule = status === "pending" || status === "confirmed";
  const showCancel = status === "pending" || status === "confirmed";
  const showRate = status === "completed";
  const hasActions = showCheckIn || showReschedule || showCancel || showRate;

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
            {apptStatusLabel(status, t).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Doctor */}
      <View style={{ height: spacing.sm }} />
      <AppCard variant="detail">
        <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={a.doctor?.full_name ?? undefined} size={48} />
          <View style={[styles.flex, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
            <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{a.doctor?.full_name || "—"}</Text>
            <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>
              {[a.doctor?.specialty, a.facility?.name].filter(Boolean).join(" · ") || "—"}
            </Text>
          </View>
        </View>
      </AppCard>

      <View style={{ height: spacing.sm }} />
      <SummaryCard rows={detailRows} />

      <View style={{ height: spacing.sm }} />
      <SummaryCard rows={feeRows} />

      {/* Policy link */}
      <Pressable
        onPress={() => router.push("/appointments/refund-policy")}
        hitSlop={8}
        accessibilityRole="button"
        style={[styles.policyRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        <Icon name="info" size={16} tint={colors.textMuted} />
        <Text variant="caption" color="primary" style={isRTL ? { marginEnd: 6 } : { marginStart: 6 }}>
          {t("appointments.policyTitle")}
        </Text>
      </Pressable>

      {/* Status-driven actions */}
      {hasActions ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {showCheckIn ? (
            <Button label={t("appointments.confirmCheckIn")} onPress={onCheckIn} disabled={checkIn.isPending} />
          ) : null}
          {showReschedule ? (
            <Button variant="outline" label={t("appointments.reschedule")} onPress={() => router.push(`/appointments/${id}/reschedule`)} />
          ) : null}
          {showCancel ? (
            <Button variant="outline" label={cancel.isPending ? t("common.loading") : t("appointments.cancelAction")} onPress={onCancel} disabled={cancel.isPending} />
          ) : null}
          {showRate ? (
            <Button label={t("appointments.rate")} onPress={() => Alert.alert(t("appointments.rate"), t("appointments.comingSoon"))} />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { marginTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  row: { alignItems: "center" },
  flex: { flex: 1 },
  policyRow: { alignItems: "center", justifyContent: "center", marginTop: 14 },
});

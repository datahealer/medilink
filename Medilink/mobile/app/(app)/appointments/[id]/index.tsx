import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  AppCard,
  AppHeader,
  Avatar,
  BottomSheet,
  Button,
  Chip,
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
import { useAppointment, useCancelAppointment, useCheckInAppointment, useProfile } from "@/hooks/queries/usePatient";
import { apptStatusCategory, apptStatusLabel, apptTone, formatApptDate, formatApptTime, hoursUntilAppt, refundTier } from "@/utils/appointments";
import type { Appointment } from "@/data/types";

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Appointment Details (design p24) — status, doctor, date/location/patient + actions. */
export default function AppointmentDetailsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId ?? "");

  const query = useAppointment(id);
  const profile = useProfile();
  const checkIn = useCheckInAppointment();
  const a = query.data;
  const [cancelOpen, setCancelOpen] = useState(false);

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
  const patientName = a.for_family_member?.full_name || profile.data?.account?.full_name || t("appointments.you");

  // Design p24 details rows: Date & time, Location (with floor where available), Patient.
  const location = [a.facility?.name, a.facility?.address].filter(Boolean).join(" — ") || "—";
  const detailRows: SummaryRow[] = [
    { label: t("appointments.dateTime"), value: `${formatApptDate(a.slot_date, t, num)} · ${formatApptTime(a.slot_start, num)}`.trim() || "—" },
    { label: t("appointments.location"), value: location },
    { label: t("appointments.patient"), value: patientName },
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

      {/* Status-driven actions (design p24: Check in / Reschedule / Cancel) */}
      {hasActions ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {showCheckIn ? (
            <Button label={t("appointments.confirmCheckIn")} onPress={onCheckIn} loading={checkIn.isPending} />
          ) : null}
          {showReschedule ? (
            <Button variant="outline" label={t("appointments.reschedule")} onPress={() => router.push(`/appointments/${id}/reschedule`)} />
          ) : null}
          {showCancel ? (
            <Button variant="outline" label={t("appointments.cancelAction")} onPress={() => setCancelOpen(true)} />
          ) : null}
          {showRate ? (
            <Button label={t("appointments.rate")} onPress={() => Alert.alert(t("appointments.rate"), t("appointments.comingSoon"))} />
          ) : null}
        </View>
      ) : null}

      <CancelSheet
        visible={cancelOpen}
        appointment={a}
        onClose={() => setCancelOpen(false)}
        onCancelled={() => {
          setCancelOpen(false);
          router.back();
        }}
      />
    </Screen>
  );
}

const REASONS = [
  { key: "appointments.reasonScheduleClash", code: "Schedule clash" },
  { key: "appointments.reasonFeelingBetter", code: "Feeling better" },
  { key: "appointments.reasonFoundAnother", code: "Found another" },
  { key: "appointments.reasonOther", code: "Other" },
] as const;

/** Cancel bottom-sheet (design p25): refund amount, policy link, reason chips, confirm/keep. */
function CancelSheet({
  visible,
  appointment,
  onClose,
  onCancelled,
}: {
  visible: boolean;
  appointment: Appointment;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { spacing, isRTL } = useTheme();
  const { t, num } = useI18n();
  const cancel = useCancelAppointment();
  const [reason, setReason] = useState<string | null>(null);

  const fee = appointment.fee_omr ?? 0;
  const hours = hoursUntilAppt(appointment.slot_date, appointment.slot_start);
  const tier = refundTier(hours);
  const amount = round3((fee * tier.pct) / 100);
  const amountStr = amount.toFixed(3);
  const money = `OMR ${num(amountStr)}`;

  const refundLine =
    tier.pct === 100
      ? t("appointments.cancelRefundFull", { amount: money })
      : tier.pct > 0
        ? t("appointments.cancelRefundPartial", { amount: money })
        : t("appointments.cancelRefundNone");

  const onConfirm = () => {
    const selected = REASONS.find((r) => r.key === reason);
    cancel.mutate(
      { id: appointment.id, reason: selected?.code },
      {
        onSuccess: onCancelled,
        onError: (e) => Alert.alert(t("appointments.actionFailed"), errMsg(e)),
      }
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t("appointments.cancelSheetTitle")} closeLabel={t("appointments.keepAppointment")}>
      <Text variant="body" color="textMuted" align={isRTL ? "right" : "left"}>
        {refundLine}
      </Text>

      <Button
        variant="ghost"
        fullWidth={false}
        label={t("appointments.viewRefundPolicy")}
        style={{ alignSelf: isRTL ? "flex-end" : "flex-start", paddingHorizontal: 0, marginTop: 4 }}
        onPress={() =>
          router.push({
            pathname: "/appointments/refund-policy",
            params: { fee: fee.toFixed(3), pct: String(tier.pct), amount: amountStr },
          })
        }
      />

      <Text variant="label" color="textMuted" style={{ marginTop: spacing.md, marginBottom: spacing.sm }} align={isRTL ? "right" : "left"}>
        {t("appointments.reasonLabel").toUpperCase()}
      </Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {REASONS.map((r) => (
          <Chip
            key={r.key}
            label={t(r.key)}
            selected={reason === r.key}
            onPress={() => setReason((cur) => (cur === r.key ? null : r.key))}
          />
        ))}
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Button variant="destructive" label={t("appointments.confirmCancellation")} loading={cancel.isPending} onPress={onConfirm} />
        <Button variant="ghost" label={t("appointments.keepAppointment")} onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  statusRow: { marginTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  row: { alignItems: "center" },
  flex: { flex: 1 },
  chips: { flexWrap: "wrap", gap: 8 },
});

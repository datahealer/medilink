import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Button, Icon, LoadingState, Screen, SummaryCard, type SummaryRow, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { usePaymentByAppointment, useVerifyPayment } from "@/hooks/queries/usePatient";
import { formatApptDate, formatApptTime } from "@/utils/appointments";

/**
 * Payment Confirmation (design p23) — shown after returning from Thawani's hosted
 * checkout. Reads the payment for the appointment; until the webhook flips it to
 * paid it shows a "processing" state the patient can refresh.
 */
export default function PaymentConfirmationScreen() {
  const { colors, spacing } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const params = useLocalSearchParams<{ appointment_id?: string; appointmentId?: string }>();
  const appointmentId = String(params.appointment_id ?? params.appointmentId ?? "");

  const query = usePaymentByAppointment(appointmentId);
  const verify = useVerifyPayment();
  // Prefer the verify recap (server-authoritative, RLS-independent); fall back to the
  // direct read (works once the payments RLS policy is corrected).
  const verified = verify.data;
  const payment = verified?.payment ?? query.data;
  const status = verified?.status ?? payment?.status ?? null;
  const money = (n: number | null | undefined) => `OMR ${num((n ?? 0).toFixed(3))}`;

  const goDone = () => router.replace("/appointments");

  // On return from Thawani, confirm the payment authoritatively (the webhook can't
  // reach a local backend). verify() finalizes paid → confirmed server-side and
  // returns the recap, so the screen resolves to success without needing the RLS read.
  useEffect(() => {
    if (appointmentId) verify.mutate(appointmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  if ((query.isLoading && !verified) || (verify.isPending && !verified)) {
    return (
      <Screen padded edges={["top", "left", "right", "bottom"]}>
        <LoadingState />
      </Screen>
    );
  }

  // No paid payment yet (still processing, or none) — let the patient retry (re-verify).
  if (!payment || status !== "paid") {
    return (
      <Screen
        padded
        edges={["top", "left", "right", "bottom"]}
        contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
        footer={
          <View style={{ gap: spacing.sm }}>
            <Button label={t("common.retry")} onPress={() => verify.mutate(appointmentId)} loading={verify.isPending || query.isFetching} />
            <Button variant="ghost" label={t("payments.done")} onPress={goDone} />
          </View>
        }
      >
        <View style={styles.center}>
          <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
            <Icon name="time" size={40} tint={colors.warning} />
          </View>
          <Text variant="h2" align="center" style={{ marginTop: spacing.md }}>
            {payment ? t("payments.pendingTitle") : t("payments.notFoundTitle")}
          </Text>
          <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.xs }}>
            {payment ? t("payments.pendingBody") : t("payments.notFoundBody")}
          </Text>
        </View>
      </Screen>
    );
  }

  const a = payment.appointment;
  const recapRows: SummaryRow[] = [
    { label: t("payments.reference"), value: payment.reference || "—" },
    {
      label: t("payments.appointment"),
      value: a ? `${formatApptDate(a.slot_date, t, num)} · ${formatApptTime(a.slot_start, num)}`.trim() : "—",
    },
    { label: t("payments.doctor"), value: a?.doctor?.full_name || "—" },
  ];

  const paidSummary = payment.method
    ? t("payments.paidSummary", { amount: money(payment.amount), method: payment.method })
    : t("payments.paidSummaryNoCard", { amount: money(payment.amount) });

  return (
    <Screen
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label={t("payments.viewInvoice")} onPress={() => router.push(`/payments/invoice/${payment.id}`)} />
          <Button variant="ghost" label={t("payments.done")} onPress={goDone} />
        </View>
      }
    >
      <View style={styles.center}>
        <View style={[styles.badge, { backgroundColor: colors.successSurface }]}>
          <Icon name="done-circle" size={44} tint={colors.success} />
        </View>
        <Text variant="h2" align="center" style={{ marginTop: spacing.md }}>{t("payments.successTitle")}</Text>
        <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.xs }}>
          {paidSummary}
        </Text>
      </View>

      <View style={{ height: spacing.lg }} />
      <SummaryCard rows={recapRows} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", marginTop: 24 },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
});

import React, { useCallback, useEffect, useRef } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { Button, Icon, LoadingState, Screen, SummaryCard, type SummaryRow, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { usePaymentByAppointment, useVerifyPayment } from "@/hooks/queries/usePatient";
import { useSaveInvoiceToVault } from "@/hooks/queries/useRecords";
import { formatApptDate, formatApptTime } from "@/utils/appointments";
import { localizedName } from "@/utils/localizedName";

/**
 * Payment Confirmation (design p23) — shown after returning from Thawani's hosted
 * checkout. Reads the payment for the appointment; until the webhook (or verify) flips
 * it to paid it shows a "processing" state the patient can refresh.
 *
 * This screen is terminal: after a payment attempt the booking/payment flow must never
 * be reachable again via Back. The swipe-back gesture is disabled and hardware-back is
 * routed to the Dashboard, and the primary action clears the whole booking stack.
 */
export default function PaymentConfirmationScreen() {
  const { colors, spacing, isRTL } = useTheme();
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
  const isPaid = status === "paid" && !!payment;
  const money = (n: number | null | undefined) => `OMR ${num((n ?? 0).toFixed(3))}`;

  // Leave the confirmation screen for the Dashboard, clearing the booking/payment
  // stack so Back can never return into checkout/payment/review/schedule.
  const goDashboard = useCallback(() => {
    if (router.canDismiss?.()) router.dismissAll();
    router.replace("/dashboard");
  }, []);

  // Android hardware back → Dashboard (never back into the booking flow). The swipe-back
  // gesture is disabled for this route in (app)/_layout.tsx.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        goDashboard();
        return true;
      });
      return () => sub.remove();
    }, [goDashboard])
  );

  // On return from Thawani, confirm the payment authoritatively (the webhook can't
  // reach a local backend). verify() finalizes paid → confirmed server-side, ensures
  // the invoice PDF exists, and returns the recap, so the screen resolves to success
  // without needing the RLS read.
  useEffect(() => {
    if (appointmentId) verify.mutate(appointmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  // Auto-poll while the payment is still processing (the webhook may land after the
  // app returns from Thawani), so success resolves without a manual Retry tap. Bounded
  // to a few attempts, and stops as soon as it's paid — the Retry button remains as a
  // fallback beyond the window.
  const pollAttempts = useRef(0);
  useEffect(() => {
    if (isPaid || !appointmentId) return;
    const MAX_ATTEMPTS = 6; // ~18s at 3s intervals
    const interval = setInterval(() => {
      if (pollAttempts.current >= MAX_ATTEMPTS) {
        clearInterval(interval);
        return;
      }
      pollAttempts.current += 1;
      verify.mutate(appointmentId);
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid, appointmentId]);

  // Auto-file the paid invoice into the Document Vault (no manual step). Idempotent —
  // the hook skips if a same-named invoice doc already exists, so this never duplicates
  // the copy filed when the invoice detail screen is later opened. Non-blocking.
  const { mutate: saveInvoice } = useSaveInvoiceToVault();
  const filedRef = useRef(false);
  useEffect(() => {
    if (!isPaid || !payment?.invoiceUrl || filedRef.current) return;
    filedRef.current = true;
    saveInvoice({
      // `invoiceUrl` is an existence flag; the hook mints its own signed URL to download.
      paymentId: payment.id,
      name: `Invoice ${payment.reference || payment.id.slice(0, 8)}`,
      appointmentId: payment.appointment?.id ?? null,
    });
  }, [isPaid, payment?.invoiceUrl, payment?.reference, payment?.id, payment?.appointment?.id, saveInvoice]);

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
            <Button variant="ghost" label={t("payments.goToDashboard")} onPress={goDashboard} />
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
    { label: t("payments.doctor"), value: localizedName(a?.doctor?.full_name || "—", a?.doctor?.full_name_ar, a?.doctor?.full_name_ar_status, isRTL) },
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
          <Button label={t("payments.goToDashboard")} onPress={goDashboard} />
          <Button variant="ghost" label={t("payments.viewInvoice")} onPress={() => router.push(`/payments/invoice/${payment.id}`)} />
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

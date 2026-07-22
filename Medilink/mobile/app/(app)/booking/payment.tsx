import React, { useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppCard, AppHeader, Avatar, Button, Screen, Stepper, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useCreateCheckout } from "@/hooks/queries/usePatient";
import { useBookingStore } from "@/stores/bookingStore";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Payment Summary (design p22) — fee / VAT / total, then a Thawani hosted-checkout
 * Pay action. Cards are entered on Thawani's secure page (we store nothing), so
 * there is no in-app card list. After paying, the confirmation screen polls for
 * the webhook to flip the payment to paid.
 */
export default function PaymentSummaryScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { appointment_id, appointmentId: altId } = useLocalSearchParams<{ appointment_id?: string; appointmentId?: string }>();
  const appointmentId = String(appointment_id ?? altId ?? "");

  const doctorName = useBookingStore((s) => s.doctorName);
  const specialty = useBookingStore((s) => s.specialty);
  const facility = useBookingStore((s) => s.facility);
  const fee = useBookingStore((s) => s.fee);

  const checkout = useCreateCheckout();
  const [paying, setPaying] = useState(false);

  const vat = round3(fee * 0.05);
  const total = round3(fee + vat);
  const money = (n: number) => `OMR ${num(n.toFixed(3))}`;

  const onPay = async () => {
    if (!appointmentId) {
      Alert.alert(t("payments.payFailed"), t("payments.notFoundBody"));
      return;
    }
    setPaying(true);
    try {
      const { checkoutUrl } = await checkout.mutateAsync({ appointmentId, amount: total });
      // Only advance to the confirmation screen if we actually hand off to Thawani's hosted
      // page — otherwise the patient would land on "processing" without ever paying.
      if (!checkoutUrl || !(await Linking.canOpenURL(checkoutUrl))) {
        Alert.alert(t("payments.payFailed"), t("payments.checkoutUnavailable"));
        return;
      }
      await Linking.openURL(checkoutUrl);
      // Confirmation reads the payment and polls until the webhook marks it paid.
      router.replace(`/booking/payment-success?appointment_id=${appointmentId}`);
    } catch (e) {
      Alert.alert(t("payments.payFailed"), errMsg(e));
    } finally {
      setPaying(false);
    }
  };

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      <Text variant={strong ? "title" : "body"} color={strong ? "text" : "textMuted"}>{label}</Text>
      <Text variant={strong ? "title" : "body"} align={isRTL ? "left" : "right"}>{value}</Text>
    </View>
  );

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right", "bottom"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={
        <View style={{ gap: 6 }}>
          <Button label={t("payments.payNow", { amount: money(total) })} onPress={onPay} loading={paying || checkout.isPending} />
          <Text variant="caption" color="textMuted" align="center">{t("payments.secured")}</Text>
        </View>
      }
    >
      <AppHeader
        title={t("payments.summaryTitle")}
        showBack
        right={<Text variant="caption" color="textMuted">{t("booking.step", { current: num("3"), total: num("4") })}</Text>}
      />

      <Stepper current={3} total={4} />

      {/* Doctor */}
      <View style={{ height: spacing.md }} />
      <AppCard variant="detail">
        <View style={[styles.docRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={doctorName} size={48} />
          <View style={[styles.flex, isRTL ? { marginEnd: 12 } : { marginStart: 12 }]}>
            <Text variant="title" numberOfLines={1} align={isRTL ? "right" : "left"}>{doctorName || "—"}</Text>
            <Text variant="caption" color="textMuted" numberOfLines={1} align={isRTL ? "right" : "left"}>
              {[specialty, facility].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
      </AppCard>

      {/* Fee breakdown */}
      <View style={{ height: spacing.sm }} />
      <AppCard variant="detail">
        <Row label={t("payments.consultationFee")} value={money(fee)} />
        <View style={{ height: spacing.sm }} />
        <Row label={t("payments.vat")} value={money(vat)} />
        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />
        <Row label={t("payments.totalDue")} value={money(total)} strong />
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  docRow: { alignItems: "center" },
  flex: { flex: 1 },
  row: { alignItems: "center", justifyContent: "space-between" },
  divider: { height: StyleSheet.hairlineWidth * 2 },
});

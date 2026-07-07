import React from "react";
import { Alert, Linking, Share, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AppCard, AppHeader, Button, EmptyState, ErrorState, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { usePayment } from "@/hooks/queries/usePatient";
import { formatApptDate } from "@/utils/appointments";
import { payCategory, payStatusLabel, payTone, round3 } from "@/utils/payments";

/**
 * Invoice & Receipt (design p23) — branded breakdown (fee, VAT, total), the card
 * used, and Download/Share of the PDF the webhook generated (payments.invoice_url).
 */
export default function InvoiceScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId ?? "");

  const query = usePayment(id);
  const payment = query.data;
  const money = (n: number) => `OMR ${num(n.toFixed(3))}`;

  if (query.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("payments.invoiceTitle")} showBack />
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen padded>
        <AppHeader title={t("payments.invoiceTitle")} showBack />
        <ErrorState message={t("payments.loadError")} onRetry={() => query.refetch()} />
      </Screen>
    );
  }
  if (!payment) {
    return (
      <Screen padded>
        <AppHeader title={t("payments.invoiceTitle")} showBack />
        <EmptyState title={t("payments.notFoundTitle")} body={t("payments.notFoundBody")} />
      </Screen>
    );
  }

  const a = payment.appointment;
  const total = payment.amount ?? (a?.fee_omr != null ? round3(a.fee_omr * 1.05) : 0);
  const fee = a?.fee_omr ?? round3(total / 1.05);
  const vat = round3(total - fee);
  const tone = payTone(colors, payCategory(payment.status));
  const dateText = formatApptDate(payment.createdAt?.slice(0, 10), t, num);
  const invoiceUrl = payment.invoiceUrl;

  const onDownload = () => {
    if (!invoiceUrl) return;
    Linking.openURL(invoiceUrl).catch(() => Alert.alert(t("payments.loadError")));
  };
  const onShare = () => {
    if (!invoiceUrl) return;
    Share.share({ message: invoiceUrl, url: invoiceUrl }).catch(() => {});
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
        <View style={{ gap: spacing.sm }}>
          <Button label={t("payments.downloadPdf")} onPress={onDownload} disabled={!invoiceUrl} />
          <Button variant="outline" label={t("payments.share")} onPress={onShare} disabled={!invoiceUrl} />
          {!invoiceUrl ? (
            <Text variant="caption" color="textMuted" align="center">{t("payments.invoiceUnavailable")}</Text>
          ) : null}
        </View>
      }
    >
      <AppHeader title={t("payments.invoiceTitle")} showBack />

      <View style={{ height: spacing.sm }} />
      <AppCard variant="detail">
        {/* Branded header: status + invoice meta */}
        <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text variant="title">{t("payments.invoiceTitle")}</Text>
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text variant="caption" weight="700" style={{ color: tone.fg, letterSpacing: 0.4 }}>
              {payStatusLabel(payment.status, t).toUpperCase()}
            </Text>
          </View>
        </View>
        <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: 4 }}>
          {t("payments.invoiceMeta", { ref: payment.reference || "—", date: dateText || "—" })}
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />

        <Row label={t("payments.consultationFee")} value={money(fee)} />
        <View style={{ height: spacing.sm }} />
        <Row label={t("payments.vat")} value={money(vat)} />
        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />
        <Row label={t("payments.totalPaid")} value={money(total)} strong />

        <View style={[styles.paidBy, { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm, marginTop: spacing.md }]}>
          <Text variant="caption" color="textMuted" align={isRTL ? "right" : "left"}>
            {payment.method
              ? t("payments.paidByCard", { method: payment.method, ref: payment.reference || "—" })
              : t("payments.paidBy", { ref: payment.reference || "—" })}
          </Text>
        </View>
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", justifyContent: "space-between" },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  divider: { height: StyleSheet.hairlineWidth * 2 },
  row: { alignItems: "center", justifyContent: "space-between" },
  paidBy: { padding: 12 },
});

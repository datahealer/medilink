import React, { useState } from "react";
import { Alert, Share, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AppCard, AppHeader, Button, EmptyState, ErrorState, Icon, LoadingState, MeMark, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { usePrescription, usePrescriptionShareLink, usePrescriptionPdfUrl } from "@/hooks/queries/usePrescriptions";
import { useProfile } from "@/hooks/queries/usePatient";
import type { PrescriptionMed } from "@/data/types";
import { formatApptDate } from "@/utils/appointments";

/**
 * Medication Details — verified e-Prescription (design p31). Real prescription data.
 * Rx# and the doctor registration ID are hidden (no backend field yet); the signature
 * line shows the doctor's real name (the generated PDF is the authoritative signed doc).
 */
export default function MedicationDetailsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const id = String(rawId ?? "");
  const rowDir = isRTL ? "row-reverse" : "row";

  const query = usePrescription(id);
  const profile = useProfile();
  const shareLink = usePrescriptionShareLink();
  const pdf = usePrescriptionPdfUrl();
  const [busy, setBusy] = useState<null | "share" | "pharmacy">(null);

  const rx = query.data;

  const onSendPharmacy = async () => {
    setBusy("pharmacy");
    try {
      const link = await shareLink.mutateAsync(id);
      if (link.url) await Share.share({ message: link.url, url: link.url });
    } catch (e) {
      Alert.alert(t("prescriptions.shareFailed"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const onSharePdf = async () => {
    setBusy("share");
    try {
      const url = await pdf.mutateAsync(id);
      await Share.share({ message: url, url });
    } catch {
      Alert.alert(t("prescriptions.pdfUnavailable"));
    } finally {
      setBusy(null);
    }
  };

  if (query.isLoading) {
    return (
      <Screen padded>
        <AppHeader title={t("prescriptions.ePrescription")} showBack />
        <LoadingState />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen padded>
        <AppHeader title={t("prescriptions.ePrescription")} showBack />
        <ErrorState message={t("prescriptions.loadError")} onRetry={() => query.refetch()} />
      </Screen>
    );
  }
  if (!rx) {
    return (
      <Screen padded>
        <AppHeader title={t("prescriptions.ePrescription")} showBack />
        <EmptyState title={t("prescriptions.notFoundTitle")} body={t("prescriptions.notFoundBody")} />
      </Screen>
    );
  }

  const doctorName = rx.doctor?.full_name || "—";
  const subline = [rx.doctor?.specialty, formatApptDate(rx.issued_at?.slice(0, 10) ?? null, t, num)].filter(Boolean).join(" · ");
  const patientName = profile.data?.account?.full_name || t("appointments.you");
  const hasPdf = !!rx.pdf_url;

  const dosageLine = (m: PrescriptionMed) => [m.dosage, m.frequency].filter(Boolean).join(" · ");

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
      footer={
        <View style={{ gap: spacing.xs }}>
          <View style={[styles.footer, { flexDirection: rowDir }]}>
            <Button
              label={t("prescriptions.share")}
              variant="outline"
              leading={<Icon name="share" size={18} color="primary" />}
              onPress={onSharePdf}
              disabled={!hasPdf}
              loading={busy === "share"}
              style={[styles.footerBtn, { marginEnd: spacing.sm }]}
            />
            <Button
              label={t("prescriptions.sendToPharmacy")}
              variant="primary"
              onPress={onSendPharmacy}
              loading={busy === "pharmacy"}
              style={styles.footerBtn}
            />
          </View>
          {!hasPdf ? (
            <Text variant="caption" color="textMuted" align="center">{t("prescriptions.pdfUnavailable")}</Text>
          ) : null}
        </View>
      }
    >
      <AppHeader title={t("prescriptions.ePrescription")} showBack />

      <AppCard variant="detail">
        <View style={[styles.topRow, { flexDirection: rowDir }]}>
          <MeMark height={18} color={colors.primary} />
          <View style={[styles.pill, { backgroundColor: colors.successSurface, borderRadius: radii.pill, flexDirection: rowDir }]}>
            <Icon name="done-circle" size={14} color="success" filled />
            <Text variant="caption" color="success" style={{ marginStart: 4 }}>{t("prescriptions.verified")}</Text>
          </View>
        </View>

        <Text variant="title" style={{ marginTop: spacing.md }}>{doctorName}</Text>
        {subline ? (
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>{subline}</Text>
        ) : null}

        <View style={{ marginTop: spacing.md }}>
          <Text variant="body" color="textMuted">
            <Text variant="label">{t("prescriptions.patient")}</Text>
            {`  ${patientName}`}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />

        {rx.medications.map((m, i) => (
          <View key={`${m.name}-${i}`} style={i === 0 ? undefined : { marginTop: spacing.lg }}>
            <Text variant="title">{m.name || "—"}</Text>
            {dosageLine(m) ? (
              <View style={[styles.kvRow, { flexDirection: rowDir, marginTop: spacing.sm }]}>
                <Text variant="label" color="textMuted">{t("prescriptions.dosageLabel")}</Text>
                <Text variant="body" align={isRTL ? "left" : "right"} style={styles.kvValue}>{dosageLine(m)}</Text>
              </View>
            ) : null}
            {m.duration ? (
              <View style={[styles.kvRow, { flexDirection: rowDir, marginTop: spacing.sm }]}>
                <Text variant="label" color="textMuted">{t("prescriptions.durationLabel")}</Text>
                <Text variant="body" align={isRTL ? "left" : "right"} style={styles.kvValue}>{num(m.duration)}</Text>
              </View>
            ) : null}
            {m.notes ? (
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>{m.notes}</Text>
            ) : null}
          </View>
        ))}

        {rx.instructions ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />
            <Text variant="body" color="textMuted">{rx.instructions}</Text>
          </>
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />

        <Text variant="caption" color="textMuted">{t("prescriptions.signature")}</Text>
        <Text variant="title" color="primary" style={styles.signature}>{doctorName}</Text>
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: "center", justifyContent: "space-between" },
  pill: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 3 },
  divider: { height: StyleSheet.hairlineWidth },
  kvRow: { alignItems: "center", justifyContent: "space-between" },
  kvValue: { flex: 1, marginStart: 12 },
  signature: { fontStyle: "italic", marginTop: 4 },
  footer: { alignItems: "center" },
  footerBtn: { flex: 1 },
});

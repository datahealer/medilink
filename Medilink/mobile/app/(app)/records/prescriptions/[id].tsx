import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import {
  AppCard,
  AppHeader,
  Button,
  Icon,
  MeMark,
  Screen,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

interface MedicationDetail {
  medName: string;
  doctor: string;
  doctorId: string;
  date: string;
  patient: string;
  rx: string;
  dosage: string;
  durationDays: number;
}

const DETAILS: Record<string, MedicationDetail> = {
  salbutamol: {
    medName: "Salbutamol Inhaler 100mcg",
    doctor: "Dr. Khalid Al Balushi",
    doctorId: "ML-245879",
    date: "12 Apr 2026",
    patient: "Aisha Al Harthy",
    rx: "4471",
    dosage: "2 puffs as needed · max 8/day",
    durationDays: 30,
  },
  atorvastatin: {
    medName: "Atorvastatin 10mg",
    doctor: "Dr. Fatma Said",
    doctorId: "ML-245882",
    date: "2 May 2026",
    patient: "Aisha Al Harthy",
    rx: "4490",
    dosage: "1 tablet at night",
    durationDays: 30,
  },
};

/** Medication Details — verified e-Prescription (design p31). */
export default function MedicationDetailsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const rowDir = isRTL ? "row-reverse" : "row";
  const detail = (id && DETAILS[id]) || DETAILS.salbutamol!;

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
      footer={
        <View style={[styles.footer, { flexDirection: rowDir }]}>
          <Button
            label={t("prescriptions.share")}
            variant="outline"
            leading={<Icon name="share" size={18} color="primary" />}
            onPress={() => {}}
            style={[styles.footerBtn, { marginEnd: spacing.sm }]}
          />
          <Button
            label={t("prescriptions.sendToPharmacy")}
            variant="primary"
            onPress={() => {}}
            style={styles.footerBtn}
          />
        </View>
      }
    >
      <AppHeader title={t("prescriptions.ePrescription")} showBack />

      <AppCard variant="detail">
        <View style={[styles.topRow, { flexDirection: rowDir }]}>
          <MeMark height={18} color={colors.primary} />
          <View
            style={[
              styles.pill,
              { backgroundColor: colors.successSurface, borderRadius: radii.pill, flexDirection: rowDir },
            ]}
          >
            <Icon name="done-circle" size={14} color="success" filled />
            <Text variant="caption" color="success" style={{ marginStart: 4 }}>
              {t("prescriptions.verified")}
            </Text>
          </View>
        </View>

        <Text variant="title" style={{ marginTop: spacing.md }}>
          {detail.doctor}
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          {`${detail.doctorId} · ${detail.date}`}
        </Text>

        <View style={{ marginTop: spacing.md }}>
          <Text variant="body" color="textMuted">
            <Text variant="label">{t("prescriptions.patient")}</Text>
            {`  ${detail.patient}`}
          </Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {t("prescriptions.rxNo", { n: num(detail.rx) })}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />

        <Text variant="title">{detail.medName}</Text>

        <View style={[styles.kvRow, { flexDirection: rowDir, marginTop: spacing.md }]}>
          <Text variant="label" color="textMuted">
            {t("prescriptions.dosageLabel")}
          </Text>
          <Text variant="body" align={isRTL ? "left" : "right"} style={styles.kvValue}>
            {detail.dosage}
          </Text>
        </View>
        <View style={[styles.kvRow, { flexDirection: rowDir, marginTop: spacing.sm }]}>
          <Text variant="label" color="textMuted">
            {t("prescriptions.durationLabel")}
          </Text>
          <Text variant="body" align={isRTL ? "left" : "right"} style={styles.kvValue}>
            {t("prescriptions.durationDays", { n: num(String(detail.durationDays)) })}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.md }]} />

        <Text variant="caption" color="textMuted">
          {t("prescriptions.signature")}
        </Text>
        <Text variant="title" color="primary" style={styles.signature}>
          {detail.doctor}
        </Text>
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

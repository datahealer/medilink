import React from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import {
  AppHeader,
  Button,
  Card,
  Icon,
  MeMark,
  Screen,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

type AnalyteFlag = "high" | "low" | "ok";

interface Analyte {
  name: string;
  value: string;
  ref: string;
  flag: AnalyteFlag;
}

interface LabDetail {
  name: string;
  lab: string;
  flagged: number;
  analytes: Analyte[];
  insight?: string;
}

const DETAILS: Record<string, LabDetail> = {
  lipid: {
    name: "Lipid Profile",
    lab: "Aster Lab · 18 Apr 2026",
    flagged: 1,
    analytes: [
      { name: "Total Cholesterol", value: "215", ref: "<200 mg/dL", flag: "high" },
      { name: "HDL", value: "52", ref: ">40 mg/dL", flag: "ok" },
      { name: "LDL", value: "140", ref: "<130 mg/dL", flag: "high" },
      { name: "Triglycerides", value: "120", ref: "<150 mg/dL", flag: "ok" },
    ],
    insight:
      "Slightly elevated cholesterol. Consider diet review & recheck in 3 months.",
  },
  cbc: {
    name: "Complete Blood Count",
    lab: "Royal Hospital · 2 May 2026",
    flagged: 0,
    analytes: [
      { name: "Haemoglobin", value: "14.2", ref: "13–17 g/dL", flag: "ok" },
      { name: "WBC", value: "6.5", ref: "4–11 ×10⁹/L", flag: "ok" },
      { name: "Platelets", value: "250", ref: "150–400 ×10⁹/L", flag: "ok" },
    ],
  },
  vitd: {
    name: "Vitamin D",
    lab: "NMC Lab · 2 Apr 2026",
    flagged: 0,
    analytes: [
      { name: "25-OH Vitamin D", value: "34", ref: "30–100 ng/mL", flag: "ok" },
    ],
  },
};

/** Result Trends & Detail (design p30). */
export default function LabDetailScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const detail = DETAILS[id ?? "lipid"] ?? DETAILS.lipid!;
  const rowDir = isRTL ? "row-reverse" : "row";

  const pillTones = (
    flag: AnalyteFlag
  ): { bg: string; fg: string; label: string } => {
    if (flag === "high") return { bg: colors.errorSurface, fg: colors.error, label: t("labs.high") };
    if (flag === "low") return { bg: colors.warning, fg: colors.textOnPrimary, label: t("labs.low") };
    return { bg: colors.successSurface, fg: colors.success, label: t("labs.ok") };
  };

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{
        maxWidth: contentMaxWidth,
        width: "100%",
        alignSelf: "center",
        paddingBottom: spacing.xxl,
      }}
      footer={
        <View style={[styles.footerRow, { flexDirection: rowDir }]}>
          <Button
            label={t("labs.share")}
            variant="outline"
            leading={<Icon name="share" size={18} color="primary" />}
            style={styles.footerBtn}
          />
          <Button label={t("labs.downloadPdf")} variant="primary" style={styles.footerBtn} />
        </View>
      }
    >
      <AppHeader title={detail.name} showBack />

      <Card style={styles.headerCard}>
        <View style={[styles.headerRow, { flexDirection: rowDir }]}>
          <View style={styles.headerInfo}>
            <Text variant="h2">{detail.name}</Text>
            <Text variant="caption" color="textMuted">
              {detail.lab}
            </Text>
          </View>
          {detail.flagged > 0 ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.errorSurface, borderRadius: radii.pill },
              ]}
            >
              <Text variant="caption" style={{ color: colors.error }}>
                {t("labs.statusFlagged", { n: num(String(detail.flagged)) })}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Card style={styles.analytesCard}>
        {detail.analytes.map((a, i) => {
          const tones = pillTones(a.flag);
          return (
            <View
              key={a.name}
              style={[
                styles.analyteRow,
                { flexDirection: rowDir },
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
              ]}
            >
              <View style={styles.analyteInfo}>
                <Text variant="body" numberOfLines={1}>
                  {a.name}
                </Text>
                <Text variant="caption" color="textMuted">
                  {t("labs.reference", { range: a.ref })}
                </Text>
              </View>
              <View style={[styles.analyteRight, { flexDirection: rowDir }]}>
                <Text variant="title">{num(a.value)}</Text>
                <View
                  style={[
                    styles.pill,
                    { backgroundColor: tones.bg, borderRadius: radii.pill },
                  ]}
                >
                  <Text variant="caption" style={{ color: tones.fg }}>
                    {tones.label}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </Card>

      {detail.insight ? (
        <Card style={[styles.insightCard, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.insightHead, { flexDirection: rowDir }]}>
            <MeMark height={16} color={colors.primary} />
            <Text variant="label" color="primary" style={styles.insightLabel}>
              {t("labs.insightLabel")}
            </Text>
          </View>
          <Text variant="body" color="text">
            {detail.insight}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCard: { marginBottom: 12 },
  headerRow: { alignItems: "center" },
  headerInfo: { flex: 1, gap: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 8 },
  analytesCard: { marginBottom: 12, paddingVertical: 0 },
  analyteRow: { alignItems: "center", paddingVertical: 14 },
  analyteInfo: { flex: 1, gap: 2 },
  analyteRight: { alignItems: "center", gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 3 },
  insightCard: { gap: 8 },
  insightHead: { alignItems: "center", gap: 8 },
  insightLabel: {},
  footerRow: { gap: 12 },
  footerBtn: { flex: 1 },
});

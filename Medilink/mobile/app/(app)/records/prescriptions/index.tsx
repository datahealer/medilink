import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  Icon,
  Screen,
  SegmentedTabs,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";

type PrescriptionStatus = "active" | "previous";

interface Prescription {
  id: string;
  name: string;
  doctor: string;
  date: string;
  dosage: string;
  status: PrescriptionStatus;
}

const PRESCRIPTIONS: Prescription[] = [
  {
    id: "salbutamol",
    name: "Salbutamol Inhaler",
    doctor: "Dr. K. Al Balushi",
    date: "12 Apr",
    dosage: "2 puffs as needed · max 8/day",
    status: "active",
  },
  {
    id: "atorvastatin",
    name: "Atorvastatin 10mg",
    doctor: "Dr. F. Said",
    date: "2 May",
    dosage: "1 tablet at night",
    status: "active",
  },
  {
    id: "amoxicillin",
    name: "Amoxicillin 500mg",
    doctor: "Dr. F. Said",
    date: "Mar 2026",
    dosage: "1 capsule 3×/day · 7 days",
    status: "previous",
  },
];

/** Active Prescriptions — list with Active / Previous tabs (design p30). */
export default function PrescriptionsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const [active, setActive] = useState<PrescriptionStatus>("active");

  const rowDir = isRTL ? "row-reverse" : "row";
  const items = PRESCRIPTIONS.filter((p) => p.status === active);

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
    >
      <AppHeader title={t("prescriptions.title")} showBack />

      <View style={{ marginBottom: spacing.md }}>
        <SegmentedTabs<PrescriptionStatus>
          tabs={[
            { key: "active", label: t("prescriptions.tabActive") },
            { key: "previous", label: t("prescriptions.tabPrevious") },
          ]}
          active={active}
          onChange={setActive}
        />
      </View>

      {items.length === 0 ? (
        <EmptyState
          title={active === "active" ? t("prescriptions.emptyActiveTitle") : t("prescriptions.emptyPreviousTitle")}
          body={active === "active" ? t("prescriptions.emptyActiveBody") : t("prescriptions.emptyPreviousBody")}
        />
      ) : (
        items.map((p) => (
          <Card
            key={p.id}
            onPress={() => router.push(`/records/prescriptions/${p.id}`)}
            style={{ marginBottom: spacing.md }}
          >
            <View style={[styles.headRow, { flexDirection: rowDir }]}>
              <View
                style={[
                  styles.tile,
                  { backgroundColor: colors.accent2, borderRadius: radii.md, marginEnd: spacing.md },
                ]}
              >
                <Icon name="medication" color="primary" />
              </View>

              <View style={styles.headText}>
                <View style={[styles.titleRow, { flexDirection: rowDir }]}>
                  <Text variant="title" numberOfLines={1} style={styles.flex}>
                    {p.name}
                  </Text>
                  {p.status === "active" ? (
                    <View
                      style={[
                        styles.pill,
                        { backgroundColor: colors.successSurface, borderRadius: radii.pill, marginStart: spacing.sm },
                      ]}
                    >
                      <Text variant="caption" color="success">
                        {t("prescriptions.statusActive")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {`${p.doctor} · ${p.date}`}
                </Text>
              </View>
            </View>

            <Text variant="body" style={{ marginTop: spacing.sm }}>
              {p.dosage}
            </Text>

            <View style={[styles.actionRow, { flexDirection: rowDir, marginTop: spacing.md }]}>
              <Button
                label={t("prescriptions.share")}
                variant="ghost"
                fullWidth={false}
                leading={<Icon name="share" size={18} color="primary" />}
                onPress={() => {}}
                style={[styles.action, { marginEnd: spacing.sm }]}
              />
              <Button
                label={t("prescriptions.setReminder")}
                variant="outline"
                fullWidth={false}
                leading={<Icon name="alerts" size={18} color="primary" />}
                onPress={() => {}}
                style={styles.action}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { alignItems: "center" },
  tile: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headText: { flex: 1 },
  titleRow: { alignItems: "center" },
  flex: { flex: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 2 },
  actionRow: { alignItems: "center" },
  action: { flex: 1 },
});

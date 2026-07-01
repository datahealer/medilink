import React, { useState } from "react";
import { Alert, Share, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, Card, EmptyState, ErrorState, Icon, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { usePrescriptions, usePrescriptionShareLink } from "@/hooks/queries/usePrescriptions";
import type { Prescription } from "@/data/types";
import { formatApptDate } from "@/utils/appointments";

/**
 * Prescriptions list (design p30). Active/Previous tabs + the Active badge are hidden:
 * the backend has no prescription status field yet (documented future enhancement).
 * Everything else is real (medications, dosage, doctor, date, Share/Send-to-pharmacy).
 */
export default function PrescriptionsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const rowDir = isRTL ? "row-reverse" : "row";

  const query = usePrescriptions();
  const items: Prescription[] = query.data ?? [];
  const share = usePrescriptionShareLink();
  const [sharingId, setSharingId] = useState<string | null>(null);

  const titleOf = (p: Prescription) => {
    const first = p.medications[0]?.name || "—";
    const extra = p.medications.length - 1;
    return extra > 0 ? `${first}  ${t("prescriptions.medsMore", { n: num(String(extra)) })}` : first;
  };
  const dosageOf = (p: Prescription) =>
    [p.medications[0]?.dosage, p.medications[0]?.frequency].filter(Boolean).join(" · ");
  const subtitleOf = (p: Prescription) =>
    [p.doctor?.full_name, formatApptDate(p.issued_at?.slice(0, 10) ?? null, t, num)].filter(Boolean).join(" · ");

  const onShare = async (id: string) => {
    setSharingId(id);
    try {
      const link = await share.mutateAsync(id);
      if (link.url) await Share.share({ message: link.url, url: link.url });
    } catch (e) {
      Alert.alert(t("prescriptions.shareFailed"), e instanceof Error ? e.message : String(e));
    } finally {
      setSharingId(null);
    }
  };

  const card = (p: Prescription) => {
    const dosage = dosageOf(p);
    return (
      <Card key={p.id} onPress={() => router.push(`/records/prescriptions/${p.id}`)} style={{ marginBottom: spacing.md }}>
        <View style={[styles.headRow, { flexDirection: rowDir }]}>
          <View style={[styles.tile, { backgroundColor: colors.accent2, borderRadius: radii.md, marginEnd: spacing.md }]}>
            <Icon name="medication" color="primary" />
          </View>
          <View style={styles.headText}>
            <Text variant="title" numberOfLines={1}>{titleOf(p)}</Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>{subtitleOf(p)}</Text>
          </View>
        </View>

        {dosage ? (
          <Text variant="body" style={{ marginTop: spacing.sm }}>{dosage}</Text>
        ) : null}

        <View style={[styles.actionRow, { flexDirection: rowDir, marginTop: spacing.md }]}>
          <Button
            label={t("prescriptions.share")}
            variant="ghost"
            fullWidth={false}
            loading={sharingId === p.id}
            leading={<Icon name="share" size={18} color="primary" />}
            onPress={() => onShare(p.id)}
            style={[styles.action, { marginEnd: spacing.sm }]}
          />
          <Button
            label={t("prescriptions.setReminder")}
            variant="outline"
            fullWidth={false}
            leading={<Icon name="alerts" size={18} color="primary" />}
            onPress={() => Alert.alert(t("prescriptions.setReminder"), t("prescriptions.reminderSoon"))}
            style={styles.action}
          />
        </View>
      </Card>
    );
  };

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
    >
      <AppHeader title={t("prescriptions.title")} showBack />

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={t("prescriptions.loadError")} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t("prescriptions.emptyTitle")} body={t("prescriptions.emptyBody")} />
      ) : (
        items.map(card)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { alignItems: "center" },
  tile: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headText: { flex: 1 },
  actionRow: { alignItems: "center" },
  action: { flex: 1 },
});

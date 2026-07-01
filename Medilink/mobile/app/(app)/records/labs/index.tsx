import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  AppHeader,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Screen,
  SegmentedTabs,
  Text,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useLabResults } from "@/hooks/queries/useLabs";
import { formatDayMonth } from "@/utils/appointments";

type LabTab = "all" | "normal" | "flagged";

/** Lab Reports — All / Normal / Flagged (design p29). */
export default function LabReportsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const [active, setActive] = useState<LabTab>("all");

  const query = useLabResults();
  const results = query.data ?? [];

  const filtered = results.filter((r) => {
    if (active === "normal") return r.status === "normal";
    if (active === "flagged") return r.status === "flagged";
    return true;
  });

  const rowDir = isRTL ? "row-reverse" : "row";

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
    >
      <AppHeader title={t("labs.title")} showBack />

      <View style={{ marginBottom: spacing.md }}>
        <SegmentedTabs<LabTab>
          tabs={[
            { key: "all", label: t("labs.tabAll") },
            { key: "normal", label: t("labs.tabNormal") },
            { key: "flagged", label: t("labs.tabFlagged") },
          ]}
          active={active}
          onChange={setActive}
        />
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={t("labs.loadError")} onRetry={() => query.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t("labs.emptyTitle")} body={t("labs.emptyBody")} />
      ) : (
        filtered.map((r) => {
          const flagged = r.status === "flagged";
          const badgeBg = flagged ? colors.errorSurface : colors.successSurface;
          const badgeFg = flagged ? colors.error : colors.success;
          const badgeText = flagged
            ? t("labs.statusFlagged", { n: num(String(r.flagged_count)) })
            : t("labs.statusNormal");
          const dateLabel = formatDayMonth(r.result_date ?? r.uploaded_at, t, num);
          const subtitle = [r.facility_name, dateLabel].filter(Boolean).join(" · ");
          return (
            <Card
              key={r.id}
              onPress={() => router.push(`/records/labs/${r.id}`)}
              style={styles.card}
            >
              <View style={[styles.row, { flexDirection: rowDir }]}>
                <View
                  style={[
                    styles.tile,
                    { backgroundColor: colors.accent, borderRadius: radii.md },
                  ]}
                >
                  <Icon name="lab" size={22} color="primary" />
                </View>
                <View style={styles.info}>
                  <Text variant="title" numberOfLines={1}>
                    {r.test_name}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: badgeBg, borderRadius: radii.pill },
                  ]}
                >
                  <Text variant="caption" style={{ color: badgeFg }}>
                    {badgeText}
                  </Text>
                </View>
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  row: { alignItems: "center" },
  tile: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, marginHorizontal: 12, gap: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4 },
});

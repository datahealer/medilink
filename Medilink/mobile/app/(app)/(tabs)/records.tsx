import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppCard, AppHeader, Card, EmptyState, Icon, Screen, Text } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";

interface VaultCategory {
  key: string;
  labelKey: MessageKey;
  icon: IconName;
  count: number;
  route: string | null;
}

interface RecentFile {
  id: string;
  name: string;
  meta: string;
}

const CATEGORIES: VaultCategory[] = [
  { key: "prescriptions", labelKey: "records.catPrescriptions", icon: "medication", count: 8, route: "/records/prescriptions" },
  { key: "labReports", labelKey: "records.catLabReports", icon: "lab", count: 5, route: "/records/labs" },
  { key: "imaging", labelKey: "records.catImaging", icon: "records", count: 3, route: null },
  { key: "vaccinations", labelKey: "records.catVaccinations", icon: "security", count: 2, route: null },
];

const RECENTS: RecentFile[] = [
  { id: "blood-test", name: "Blood test — CBC", meta: "PDF · 240 KB · 2 May" },
  { id: "chest-xray", name: "Chest X-Ray", meta: "JPG · 1.2 MB · 28 Apr" },
];

/** Records tab = "Me Vault" (design p28). Tab root: no footer, no back. */
export default function RecordsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const rowDir = isRTL ? "row-reverse" : "row";

  const categoryCard = (c: VaultCategory) => (
    <AppCard
      key={c.key}
      variant="specialty"
      onPress={c.route ? () => router.push(c.route as never) : undefined}
      style={styles.gridCard}
    >
      <View
        style={[
          styles.tile,
          { backgroundColor: colors.accent2, borderRadius: radii.md },
        ]}
      >
        <Icon name={c.icon} size={22} color="primary" />
      </View>
      <Text variant="title" numberOfLines={1} style={{ marginTop: spacing.sm }}>
        {t(c.labelKey)}
      </Text>
      <Text variant="caption" color="textMuted">
        {t("records.files", { n: num(String(c.count)) })}
      </Text>
    </AppCard>
  );

  const recentRow = (f: RecentFile) => (
    <Card
      key={f.id}
      onPress={() => router.push(`/records/document/${f.id}` as never)}
      style={{ marginBottom: spacing.sm }}
    >
      <View style={[styles.recentRow, { flexDirection: rowDir }]}>
        <View
          style={[
            styles.docTile,
            { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm },
          ]}
        >
          <Icon name="document" size={22} color="textMuted" />
        </View>
        <View style={[styles.recentText, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
          <Text variant="title" numberOfLines={1}>{f.name}</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>{f.meta}</Text>
        </View>
        <Icon name="chevron" size={18} color="textFaint" direction={isRTL ? "left" : "right"} />
      </View>
    </Card>
  );

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}
    >
      <AppHeader
        title={t("records.vaultTitle")}
        showBack={false}
        right={
          <Pressable
            onPress={() => router.push("/records/upload" as never)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("records.addDocument")}
          >
            <Icon name="upload" size={24} color="primary" />
          </Pressable>
        }
      />

      {/* Static search field (decorative — navigates nowhere). */}
      <Pressable
        accessibilityRole="search"
        style={[
          styles.search,
          {
            flexDirection: rowDir,
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        <Icon name="search" size={20} color="textMuted" />
        <Text
          variant="body"
          color="textMuted"
          style={isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }}
        >
          {t("records.searchPlaceholder")}
        </Text>
      </Pressable>

      {/* 2-column category grid. */}
      <View style={[styles.grid, { flexDirection: rowDir, marginTop: spacing.lg }]}>
        {CATEGORIES.map(categoryCard)}
      </View>

      {/* Recent section. */}
      <Text variant="h2" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        {t("records.recent")}
      </Text>
      {RECENTS.length > 0 ? (
        RECENTS.map(recentRow)
      ) : (
        <EmptyState title={t("records.emptyTitle")} body={t("records.emptyBody")} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: 48,
    alignItems: "center",
    borderWidth: 1,
  },
  grid: {
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridCard: {
    width: "48%",
    marginBottom: 16,
    alignItems: "flex-start",
  },
  tile: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  recentRow: { alignItems: "center" },
  docTile: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  recentText: { flex: 1 },
});

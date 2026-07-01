import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppCard, AppHeader, Card, EmptyState, ErrorState, Icon, LoadingState, Screen, Text } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { useDocuments } from "@/hooks/queries/useRecords";
import type { DocumentType, PatientDoc } from "@/data/types";
import { formatApptDate } from "@/utils/appointments";

/** The four design categories (p28) mapped onto the backend `document_type` enum.
 *  NOTE: the enum has no `vaccination` value — the Vaccinations card maps to `other`. */
const CATEGORIES: { type: DocumentType; labelKey: MessageKey; icon: IconName; route: string | null }[] = [
  { type: "prescription", labelKey: "records.catPrescriptions", icon: "medication", route: "/records/prescriptions" },
  { type: "report", labelKey: "records.catLabReports", icon: "lab", route: "/records/labs" },
  { type: "imaging", labelKey: "records.catImaging", icon: "records", route: null },
  { type: "other", labelKey: "records.catVaccinations", icon: "security", route: null },
];

function extLabel(fileType: string): string {
  if (/pdf/i.test(fileType)) return "PDF";
  const sub = fileType.split("/")[1];
  return sub ? sub.toUpperCase() : "FILE";
}
function sizeLabel(bytes: number | null | undefined, num: (s: string) => string): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${num(String(Math.round(bytes / 1024)))} KB`;
  return `${num((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

/** Records tab = "Me Vault" (design p28). Tab root: no footer, no back. */
export default function RecordsScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();
  const rowDir = isRTL ? "row-reverse" : "row";

  const query = useDocuments();
  const docs: PatientDoc[] = useMemo(() => query.data ?? [], [query.data]);
  const [filter, setFilter] = useState<DocumentType | null>(null);

  const countByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of docs) m[d.type] = (m[d.type] ?? 0) + 1;
    return m;
  }, [docs]);

  const listed = filter ? docs.filter((d) => d.type === filter) : docs;

  const docMeta = (d: PatientDoc) =>
    [extLabel(d.file_type), sizeLabel(d.size_bytes, num), formatApptDate(d.uploaded_at?.slice(0, 10) ?? null, t, num)]
      .filter(Boolean)
      .join(" · ");

  const categoryCard = (c: (typeof CATEGORIES)[number]) => {
    const active = filter === c.type;
    return (
      <AppCard
        key={c.type}
        variant="specialty"
        onPress={() => setFilter(active ? null : c.type)}
        style={[styles.gridCard, active ? { borderColor: colors.primary } : null]}
      >
        <View style={[styles.tile, { backgroundColor: colors.accent2, borderRadius: radii.md }]}>
          <Icon name={c.icon} size={22} color="primary" />
        </View>
        <Text variant="title" numberOfLines={1} style={{ marginTop: spacing.sm }}>{t(c.labelKey)}</Text>
        <Text variant="caption" color="textMuted">{t("records.files", { n: num(String(countByType[c.type] ?? 0)) })}</Text>
      </AppCard>
    );
  };

  const docRow = (d: PatientDoc) => (
    <Card key={d.id} onPress={() => router.push(`/records/document/${d.id}` as never)} style={{ marginBottom: spacing.sm }}>
      <View style={[styles.recentRow, { flexDirection: rowDir }]}>
        <View style={[styles.docTile, { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm }]}>
          <Icon name="document" size={22} color="textMuted" />
        </View>
        <View style={[styles.recentText, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
          <Text variant="title" numberOfLines={1}>{d.name}</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>{docMeta(d)}</Text>
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

      {/* Search field (decorative in this pass — matches design p28). */}
      <View
        style={[
          styles.search,
          { flexDirection: rowDir, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md },
        ]}
      >
        <Icon name="search" size={20} color="textMuted" />
        <Text variant="body" color="textMuted" style={isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }}>
          {t("records.searchPlaceholder")}
        </Text>
      </View>

      {/* 2-column category grid (live counts; tap to filter the list). */}
      <View style={[styles.grid, { flexDirection: rowDir, marginTop: spacing.lg }]}>
        {CATEGORIES.map(categoryCard)}
      </View>

      {/* Documents list — "Recent", or the active category. */}
      <View style={[styles.sectionHead, { flexDirection: rowDir, marginTop: spacing.xl, marginBottom: spacing.md }]}>
        <Text variant="h2">
          {filter ? t(CATEGORIES.find((c) => c.type === filter)!.labelKey) : t("records.recent")}
        </Text>
        {filter ? (
          <Pressable onPress={() => setFilter(null)} hitSlop={8} accessibilityRole="button">
            <Text variant="caption" color="primary">{t("records.all")}</Text>
          </Pressable>
        ) : null}
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={t("records.loadError")} onRetry={() => query.refetch()} />
      ) : listed.length === 0 ? (
        <EmptyState title={t("records.emptyTitle")} body={t("records.emptyBody")} actionLabel={t("records.addDocument")} onAction={() => router.push("/records/upload" as never)} />
      ) : (
        listed.map(docRow)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: 48, alignItems: "center", borderWidth: 1 },
  grid: { flexWrap: "wrap", justifyContent: "space-between" },
  gridCard: { width: "48%", marginBottom: 16, alignItems: "flex-start" },
  tile: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  sectionHead: { alignItems: "center", justifyContent: "space-between" },
  recentRow: { alignItems: "center" },
  docTile: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  recentText: { flex: 1 },
});

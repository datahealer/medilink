import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Icon, LoadingState, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useDoctors } from "@/hooks/queries/useDoctors";
import { useSearchFilterStore, activeFilterCount } from "@/stores/searchFilterStore";
import type { Doctor } from "@/data/types";

/** Search & Results (PDF p17): query, quick filters and ranked doctor cards. */
export default function SearchScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, num } = useI18n();

  const filters = useSearchFilterStore();
  const setFilters = useSearchFilterStore((s) => s.setFilters);
  const [query, setQuery] = useState("");

  const doctors = useDoctors({
    query,
    specialty: filters.specialty,
    gender: filters.gender,
    maxFee: filters.maxFee,
    minRating: filters.minRating,
    availableToday: filters.availableToday,
    topRated: filters.topRated,
  });

  const count = doctors.data?.length ?? 0;
  const filterBadge = activeFilterCount(filters);

  const card = (d: Doctor) => (
    <Card key={d.id} onPress={() => router.push(`/doctors/${d.id}`)} style={{ marginBottom: spacing.sm }}>
      <View style={[styles.docRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Avatar name={d.full_name} size={48} />
        <View style={[styles.docText, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
          <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text variant="title" numberOfLines={1} style={styles.name}>{d.full_name}</Text>
            {d.available_today ? (
              <View style={[styles.todayTag, { backgroundColor: colors.surfaceAlt, borderColor: colors.success }]}>
                <Text variant="caption" color="success" numberOfLines={1}>{t("search.availableToday")}</Text>
              </View>
            ) : null}
          </View>
          <Text variant="caption" color="textMuted" numberOfLines={1}>{`${d.specialty} · ${d.facility}`}</Text>
          <Text variant="caption" color="textMuted">
            {num(`★ ${d.rating}   OMR ${d.fee_omr}${d.distance_km != null ? ` · ${d.distance_km} km` : ""}`)}
          </Text>
          <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={{ flex: 1 }}>
              <Button label={t("search.book")} onPress={() => router.push(`/booking/${d.id}/schedule`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t("search.profile")} variant="outline" onPress={() => router.push(`/doctors/${d.id}`)} />
            </View>
          </View>
        </View>
      </View>
    </Card>
  );

  return (
    <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}>
      {/* Header (tab root — no back) */}
      <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text variant="h2" style={{ flex: 1 }}>{t("search.findDoctor")}</Text>
        <Pressable onPress={() => router.push("/search/map")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("map.title")} style={[styles.iconBtn, { borderColor: colors.border }]}>
          <Icon name="map" size={18} tint={colors.text} />
        </Pressable>
        <Pressable onPress={() => router.push("/search/filters")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("filters.title")} style={[styles.iconBtn, { borderColor: colors.border, marginStart: 8 }]}>
          <Icon name="filter" size={18} tint={colors.text} />
          {filterBadge > 0 ? <View style={[styles.badge, { backgroundColor: colors.primary }]} /> : null}
        </Pressable>
      </View>

      {/* Search field */}
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t("search.placeholder")}
        autoCapitalize="none"
        leading={<Icon name="search" size={18} tint={colors.textMuted} />}
        containerStyle={{ marginBottom: spacing.md }}
      />

      {/* Quick filter chips */}
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Chip
          label={t("search.all")}
          selected={!filters.availableToday && !filters.topRated}
          onPress={() => setFilters({ availableToday: false, topRated: false })}
        />
        <Chip
          label={t("search.availableToday")}
          selected={!!filters.availableToday}
          onPress={() => setFilters({ availableToday: !filters.availableToday })}
        />
        <Chip
          label={t("search.topRated")}
          selected={!!filters.topRated}
          onPress={() => setFilters({ topRated: !filters.topRated })}
        />
      </View>

      {/* Count + sort */}
      <View style={[styles.rowBetween, { flexDirection: isRTL ? "row-reverse" : "row", marginTop: spacing.md, marginBottom: spacing.sm }]}>
        <Text variant="caption" color="textMuted">{t("search.results", { count: num(count) })}</Text>
        <Text variant="caption" color="textMuted">{t("search.sortRating")}</Text>
      </View>

      {/* Results */}
      {doctors.isLoading ? (
        <View style={{ paddingTop: spacing.lg }}><LoadingState /></View>
      ) : doctors.isError ? (
        <ErrorState message={t("search.loadError")} onRetry={() => doctors.refetch()} />
      ) : count === 0 ? (
        <View style={{ borderRadius: radii.lg }}>
          <EmptyState title={t("search.noResultsTitle")} body={t("search.noResultsBody")} />
        </View>
      ) : (
        (doctors.data ?? []).map(card)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth * 2 },
  badge: { position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4 },
  chips: { flexWrap: "wrap", gap: 8 },
  rowBetween: { alignItems: "center", justifyContent: "space-between" },
  docRow: { alignItems: "flex-start" },
  docText: { flex: 1 },
  name: { flex: 1, flexShrink: 1 },
  todayTag: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth * 2, marginStart: 6 },
  actions: { gap: 8, marginTop: 10 },
});

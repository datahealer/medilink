import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Button, Chip, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useDoctors } from "@/hooks/queries/useDoctors";
import { useSpecialties } from "@/hooks/queries/useDiscovery";
import { useSearchFilterStore } from "@/stores/searchFilterStore";
import type { Gender } from "@/data/types";

const FEE_CAPS = [10, 20, 30];
const RATINGS = [4.0, 4.5, 4.8];
const GENDERS: { value: Gender | "any"; key: "any" | "male" | "female" }[] = [
  { value: "any", key: "any" },
  { value: "male", key: "male" },
  { value: "female", key: "female" },
];

/** Filters (PDF p18): specialty, gender, consultation fee, minimum rating. */
export default function FiltersSheet() {
  const { isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const filters = useSearchFilterStore();
  const setFilters = useSearchFilterStore((s) => s.setFilters);
  const reset = useSearchFilterStore((s) => s.reset);
  const specialties = useSpecialties();

  const preview = useDoctors({
    specialty: filters.specialty,
    gender: filters.gender,
    maxFee: filters.maxFee,
    minRating: filters.minRating,
    availableToday: filters.availableToday,
    topRated: filters.topRated,
  });
  const count = preview.data?.length ?? 0;

  return (
    <Screen
      scroll
      padded
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}
      footer={<Button label={t("filters.show", { count })} onPress={() => router.back()} />}
    >
      <AppHeader
        title={t("filters.title")}
        right={
          <Pressable onPress={reset} hitSlop={8} accessibilityRole="button">
            <Text variant="label" color="primary">{t("filters.reset")}</Text>
          </Pressable>
        }
      />

      {/* Specialty */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("filters.specialty")}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {(specialties.data ?? []).map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            selected={filters.specialty === s.name}
            onPress={() => setFilters({ specialty: filters.specialty === s.name ? undefined : s.name })}
          />
        ))}
      </View>

      {/* Gender */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("filters.gender")}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {GENDERS.map((g) => (
          <Chip
            key={g.key}
            label={t(`filters.${g.key}`)}
            selected={(filters.gender ?? "any") === g.value}
            onPress={() => setFilters({ gender: g.value })}
          />
        ))}
      </View>

      {/* Consultation fee (chip caps in lieu of a slider — no slider dep installed) */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("filters.fee")}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Chip label={t("filters.any")} selected={filters.maxFee == null} onPress={() => setFilters({ maxFee: undefined })} />
        {FEE_CAPS.map((c) => (
          <Chip key={c} label={`≤ ${c}`} selected={filters.maxFee === c} onPress={() => setFilters({ maxFee: filters.maxFee === c ? undefined : c })} />
        ))}
      </View>

      {/* Minimum rating */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("filters.minRating")}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Chip label={t("filters.any")} selected={filters.minRating == null} onPress={() => setFilters({ minRating: undefined })} />
        {RATINGS.map((r) => (
          <Chip key={r} label={`${r.toFixed(1)}+`} selected={filters.minRating === r} onPress={() => setFilters({ minRating: filters.minRating === r ? undefined : r })} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 8 },
  chips: { flexWrap: "wrap", gap: 8 },
});

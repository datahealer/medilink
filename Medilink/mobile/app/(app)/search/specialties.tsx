import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppScreen, Icon, LoadingState, SpecialtyTile, StaticTabBar, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useSpecialties } from "@/hooks/queries/useDiscovery";
import { useSearchFilterStore } from "@/stores/searchFilterStore";

/**
 * Specialty Categories (PDF p18/p37): a browse grid reached from Search — it shows the
 * bottom tab bar and has NO back button. Searchable grid; tap → filtered results.
 * Category names are semibold (SpecialtyTile).
 */
export default function SpecialtiesScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { isTablet } = useResponsive();
  const { t } = useI18n();
  const setFilters = useSearchFilterStore((s) => s.setFilters);

  const [q, setQ] = useState("");
  const specialties = useSpecialties();

  const items = (specialties.data ?? []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const colWidth = isTablet ? "25%" : "33.333%";

  const open = (name: string) => {
    setFilters({ specialty: name });
    router.push("/search");
  };

  return (
    <AppScreen
      headerVariant="tabs"
      title={t("specialties.title")}
      constrain={false}
      footer={
        <View style={{ marginHorizontal: -spacing.lg, marginBottom: -8 }}>
          <StaticTabBar active="search" />
        </View>
      }
    >
      <Text variant="h2" style={{ marginBottom: spacing.md }}>{t("specialties.title")}</Text>

      <TextField
        value={q}
        onChangeText={setQ}
        placeholder={t("specialties.search")}
        autoCapitalize="none"
        leading={<Icon name="search" size={18} tint={colors.textMuted} />}
        containerStyle={{ marginBottom: spacing.md }}
      />

      {specialties.isLoading ? (
        <LoadingState />
      ) : (
        <View style={[styles.grid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {items.map((s) => (
            <View key={s.id} style={[styles.cell, { width: colWidth }]}>
              <SpecialtyTile name={s.name} icon={s.icon} onPress={() => open(s.name)} />
            </View>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  cell: { padding: 4 },
});

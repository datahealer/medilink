import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Card, Icon, LoadingState, Screen, Text, TextField, resolveIconName } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useSpecialties } from "@/hooks/queries/useDiscovery";
import { useSearchFilterStore } from "@/stores/searchFilterStore";

/** Specialty Categories (PDF p18): searchable grid; tap → filtered results. */
export default function SpecialtiesScreen() {
  const { colors, spacing } = useTheme();
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
    <Screen scroll padded contentStyle={{ width: "100%" }}>
      <AppHeader title={t("specialties.title")} />

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
        <View style={styles.grid}>
          {items.map((s) => (
            <View key={s.id} style={[styles.cell, { width: colWidth }]}>
              <Card onPress={() => open(s.name)} accessibilityLabel={s.name} style={styles.card}>
                <Icon name={resolveIconName(s.icon ?? "medkit-outline")} size={26} tint={colors.primary} />
                <Text variant="caption" align="center" numberOfLines={2} style={{ marginTop: 8 }}>{s.name}</Text>
              </Card>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  cell: { padding: 4 },
  card: { alignItems: "center", paddingVertical: 18, paddingHorizontal: 4 },
});

import React, { useMemo, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from "react-native-maps";

import { Avatar, Card, EmptyState, ErrorState, Icon, LoadingState, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { localizedName } from "@/utils/localizedName";
import { useNearbyClinics } from "@/hooks/queries/useDiscovery";
import type { Clinic } from "@/data/types";

// Default map centre — Muscat (MediLink is an Oman product; the RPC is a proximity
// search, so we anchor to a sensible origin). Real device-location centring can be
// layered on later with expo-location without changing this screen's data flow.
const MUSCAT = { lat: 23.588, lng: 58.3829 };
const DEFAULT_REGION: Region = {
  latitude: MUSCAT.lat,
  longitude: MUSCAT.lng,
  latitudeDelta: 0.35,
  longitudeDelta: 0.35,
};

/** Map View (PDF p19): real map with nearby-clinic markers + a bottom clinic card. */
export default function MapViewScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { t, num } = useI18n();
  const query = useNearbyClinics({ lat: MUSCAT.lat, lng: MUSCAT.lng });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clinics = useMemo(() => {
    const all = query.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.area ?? "").toLowerCase().includes(q)
    );
  }, [query.data, search]);

  const active: Clinic | undefined = clinics.find((c) => c.id === selectedId) ?? clinics[0];

  const openDirections = (c: Clinic) => {
    if (c.latitude == null || c.longitude == null) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`;
    Linking.openURL(url).catch(() => Alert.alert(t("map.loadError")));
  };

  return (
    <Screen scroll={false} padded={false} edges={["top", "left", "right", "bottom"]}>
      {/* Search header */}
      <View style={[styles.header, { paddingHorizontal: spacing.lg, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Icon name="chevron" direction={isRTL ? "right" : "left"} size={26} tint={colors.text} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.searchWrap}>
          <TextField
            value={search}
            onChangeText={setSearch}
            placeholder={t("map.searchPlaceholder")}
            returnKeyType="search"
            leading={<Icon name="search" size={18} tint={colors.textMuted} />}
          />
        </View>
      </View>

      {/* Real map surface */}
      <View style={styles.map}>
        <MapView
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFill}
          initialRegion={DEFAULT_REGION}
        >
          {clinics.map((c) =>
            c.latitude != null && c.longitude != null ? (
              <Marker
                key={c.id}
                coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                title={localizedName(c.name, c.name_ar, c.name_ar_status, isRTL)}
                description={c.area}
                onPress={() => setSelectedId(c.id)}
              />
            ) : null
          )}
        </MapView>

        {query.isLoading ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <LoadingState />
          </View>
        ) : query.isError ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <ErrorState message={t("map.loadError")} onRetry={() => query.refetch()} />
          </View>
        ) : clinics.length === 0 ? (
          <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}>
            <EmptyState title={t("map.emptyTitle")} body={t("map.emptyBody")} />
          </View>
        ) : null}
      </View>

      {/* Bottom clinic card */}
      {active ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm }}>
          <Card onPress={() => openDirections(active)}>
            <View style={[styles.cardRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Avatar name={active.name} size={44} />
              <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
                <Text variant="title" numberOfLines={1}>
                  {localizedName(active.name, active.name_ar, active.name_ar_status, isRTL)}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {active.area}
                </Text>
                <Text variant="caption" color="textMuted">
                  {num(
                    [
                      `★ ${active.rating}`,
                      active.distance_km != null ? `${active.distance_km} km` : null,
                    ]
                      .filter(Boolean)
                      .join("   ·   ")
                  )}
                </Text>
              </View>
              <View style={[styles.directions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Icon name="map" size={16} tint={colors.primary} />
                <Text variant="caption" color="primary" style={isRTL ? { marginEnd: 4 } : { marginStart: 4 }}>
                  {t("map.directions")}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", gap: 12, paddingTop: 8, paddingBottom: 12 },
  searchWrap: { flex: 1 },
  map: { flex: 1, overflow: "hidden" },
  overlay: { alignItems: "center", justifyContent: "center" },
  cardRow: { alignItems: "center" },
  directions: { alignItems: "center" },
});

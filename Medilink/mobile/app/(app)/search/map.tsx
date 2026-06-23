import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar, Card, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { useDoctors } from "@/hooks/queries/useDoctors";

// Fixed pin positions (no maps SDK installed — this is a branded static map surface;
// a real map provider is wired when the discovery backend lands).
const PIN_POS = [
  { top: "18%", left: "22%" },
  { top: "44%", left: "60%" },
  { top: "66%", left: "32%" },
] as const;

/** Map View (PDF p19): nearby clinics with fee pins + a bottom doctor card. */
export default function MapViewScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { t } = useI18n();
  const doctors = useDoctors({});
  const pins = (doctors.data ?? []).slice(0, 3);
  const [selected, setSelected] = useState(0);
  const active = pins[selected];

  return (
    <Screen scroll={false} padded={false} edges={["top", "left", "right", "bottom"]}>
      {/* Search header */}
      <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={colors.text} />
        </Pressable>
        <View style={[styles.searchPill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radii.md, flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <Text variant="body" color="textMuted" style={isRTL ? { marginEnd: 8 } : { marginStart: 8 }}>{t("map.title")}</Text>
        </View>
      </View>

      {/* Map surface */}
      <View style={[styles.map, { backgroundColor: colors.surfaceAlt }]}>
        {/* faint grid */}
        {[0.2, 0.4, 0.6, 0.8].map((p) => (
          <View key={`h${p}`} style={[styles.gridLine, { top: `${p * 100}%`, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }]} />
        ))}
        {[0.25, 0.5, 0.75].map((p) => (
          <View key={`v${p}`} style={[styles.gridLine, { left: `${p * 100}%`, top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.border }]} />
        ))}

        {/* user location */}
        <View style={[styles.userDot, { backgroundColor: colors.info, borderColor: colors.surface }]} />

        {doctors.isLoading ? (
          <View style={StyleSheet.absoluteFill}><LoadingState /></View>
        ) : (
          pins.map((d, i) => (
            <Pressable
              key={d.id}
              onPress={() => setSelected(i)}
              style={[
                styles.pin,
                PIN_POS[i],
                { backgroundColor: i === selected ? colors.primary : colors.surface, borderColor: colors.primary, borderRadius: radii.pill },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${d.full_name} OMR ${d.fee_omr}`}
            >
              <Text variant="caption" color={i === selected ? "textOnPrimary" : "primary"}>{`OMR ${d.fee_omr}`}</Text>
            </Pressable>
          ))
        )}
      </View>

      {/* Bottom doctor card */}
      {active ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <Card onPress={() => router.push(`/doctors/${active.id}`)}>
            <View style={[styles.cardRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Avatar name={active.full_name} size={44} />
              <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
                <Text variant="title" numberOfLines={1}>{active.full_name}</Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {`${active.facility} · ${t("map.openNow")}`}
                </Text>
                <Text variant="caption" color="textMuted">
                  {`★ ${active.rating}   OMR ${active.fee_omr}${active.distance_km != null ? ` · ${active.distance_km} km` : ""}`}
                </Text>
              </View>
              <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color={colors.textMuted} />
            </View>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, paddingBottom: 12 },
  searchPill: { flex: 1, alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth * 2, minHeight: 48 },
  map: { flex: 1, overflow: "hidden" },
  gridLine: { position: "absolute" },
  userDot: { position: "absolute", top: "50%", left: "48%", width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  pin: { position: "absolute", paddingHorizontal: 10, paddingVertical: 5, borderWidth: StyleSheet.hairlineWidth * 2 },
  cardRow: { alignItems: "center" },
});

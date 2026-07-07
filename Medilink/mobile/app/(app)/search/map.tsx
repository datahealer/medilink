import React, { useState } from "react";
import { Pressable, StyleSheet, View, type DimensionValue } from "react-native";
import { router } from "expo-router";

import { Avatar, Card, Icon, LoadingState, Screen, Text } from "@/components/ui";
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

type Box = { top: DimensionValue; left: DimensionValue; width: DimensionValue; height: DimensionValue };
const MAP_BLOCKS: Box[] = [
  { top: "8%", left: "6%", width: "34%", height: "26%" },
  { top: "12%", left: "62%", width: "30%", height: "20%" },
  { top: "54%", left: "10%", width: "26%", height: "30%" },
  { top: "58%", left: "58%", width: "34%", height: "26%" },
];

/** Map View (PDF p19): nearby clinics with fee pins + a bottom doctor card. */
export default function MapViewScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { t, num } = useI18n();
  const doctors = useDoctors({});
  const pins = (doctors.data ?? []).slice(0, 3);
  const [selected, setSelected] = useState(0);
  const active = pins[selected];

  return (
    <Screen scroll={false} padded={false} edges={["top", "left", "right", "bottom"]}>
      {/* Search header */}
      <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.back")}>
          <Icon name="chevron" direction={isRTL ? "right" : "left"} size={26} tint={colors.text} strokeWidth={2.2} />
        </Pressable>
        <View style={[styles.searchPill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radii.md, flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Icon name="search" size={18} tint={colors.textMuted} />
          <Text variant="body" color="textMuted" style={isRTL ? { marginEnd: 8 } : { marginStart: 8 }}>{t("map.title")}</Text>
        </View>
      </View>

      {/* Map surface — styled stand-in (no maps SDK): soft "blocks" + roads suggest a
          city map, with price pins and a haloed user marker, matching PDF p19. */}
      <View style={[styles.map, { backgroundColor: colors.surfaceAlt }]}>
        {/* soft map blocks (parks/zones) */}
        {MAP_BLOCKS.map((b, i) => (
          <View key={`b${i}`} style={[styles.block, b, { backgroundColor: colors.surface, borderColor: colors.border }]} />
        ))}
        {/* faint roads */}
        {[0.32, 0.66].map((p) => (
          <View key={`h${p}`} style={[styles.gridLine, { top: `${p * 100}%`, left: 0, right: 0, height: 6, backgroundColor: colors.background, opacity: 0.7 }]} />
        ))}
        {[0.46].map((p) => (
          <View key={`v${p}`} style={[styles.gridLine, { left: `${p * 100}%`, top: 0, bottom: 0, width: 6, backgroundColor: colors.background, opacity: 0.7 }]} />
        ))}

        {/* user location (pulse halo + dot) */}
        <View style={styles.userWrap}>
          <View style={[styles.userHalo, { backgroundColor: colors.info, opacity: 0.18 }]} />
          <View style={[styles.userDot, { backgroundColor: colors.info, borderColor: colors.surface }]} />
        </View>

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
              <Text variant="caption" color={i === selected ? "textOnPrimary" : "primary"}>{num(`OMR ${d.fee_omr}`)}</Text>
              {/* pointer tail */}
              <View style={[styles.pinTail, { backgroundColor: i === selected ? colors.primary : colors.surface, borderColor: colors.primary }]} />
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
                  {num(`★ ${active.rating}   OMR ${active.fee_omr}${active.distance_km != null ? ` · ${active.distance_km} km` : ""}`)}
                </Text>
              </View>
              <Icon name="chevron" direction={isRTL ? "left" : "right"} size={20} tint={colors.textMuted} />
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
  block: { position: "absolute", borderRadius: 14, borderWidth: StyleSheet.hairlineWidth * 2, opacity: 0.7 },
  userWrap: { position: "absolute", top: "50%", left: "48%", alignItems: "center", justifyContent: "center" },
  userHalo: { position: "absolute", width: 44, height: 44, borderRadius: 22 },
  userDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  pin: { position: "absolute", paddingHorizontal: 10, paddingVertical: 5, borderWidth: StyleSheet.hairlineWidth * 2, alignItems: "center" },
  pinTail: { position: "absolute", bottom: -4, width: 8, height: 8, transform: [{ rotate: "45deg" }], borderRightWidth: StyleSheet.hairlineWidth * 2, borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  cardRow: { alignItems: "center" },
});

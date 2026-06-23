import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { isDev } from "@/config/env";
import { SCREENS, type ScreenEntry } from "@/dev/screenRegistry";

/**
 * DEV-ONLY Screen Gallery (EXPO_PUBLIC_APP_ENV=development). Lists all 50 PDF
 * screens grouped by flow; tap to open the real screen or its PDF-styled preview.
 * Hidden in production (redirects out) and never linked from normal navigation.
 */
export default function ScreenGallery() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();

  const groups = useMemo(() => {
    const map = new Map<string, ScreenEntry[]>();
    for (const s of SCREENS) {
      const list = map.get(s.flow) ?? [];
      list.push(s);
      map.set(s.flow, list);
    }
    return [...map.entries()];
  }, []);

  if (!isDev) return <Redirect href="/splash" />;

  const builtCount = SCREENS.filter((s) => s.built).length;

  return (
    <Screen scroll padded edges={["top", "left", "right", "bottom"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title="Screen Gallery" />
      <Text variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>
        Dev-only · {SCREENS.length} PDF screens · {builtCount} built · {SCREENS.length - builtCount} preview
      </Text>

      {groups.map(([flow, items]) => (
        <View key={flow} style={{ marginBottom: spacing.lg }}>
          <Text variant="label" color="textMuted" style={{ marginBottom: 8 }}>{flow}</Text>
          {items.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push(s.route as never)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.row,
                { flexDirection: isRTL ? "row-reverse" : "row", backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text variant="caption" color="textMuted" style={styles.num}>{s.n}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="title" numberOfLines={1}>{s.title}</Text>
                <Text variant="caption" color="textMuted">PDF p{s.pdfPage}</Text>
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: s.built ? colors.success : colors.surfaceAlt, borderColor: s.built ? colors.success : colors.border },
                ]}
              >
                <Text variant="caption" color={s.built ? "textOnPrimary" : "textMuted"}>
                  {s.built ? "Built" : "Preview"}
                </Text>
              </View>
              <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    marginBottom: 8,
  },
  num: { width: 22, textAlign: "center" },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

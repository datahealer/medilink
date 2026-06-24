import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { shadow } from "@/utils/platform";
import { Icon, type IconName } from "./Icon";
import { MeMark } from "./MeMark";
import { Text } from "./Text";

type TabKey = "home" | "search" | "me" | "records" | "profile";

const TABS: { key: TabKey; icon: IconName; route: string; labelKey: Parameters<ReturnType<typeof useI18n>["t"]>[0] }[] = [
  { key: "home", icon: "home", route: "/dashboard", labelKey: "tabs.home" },
  { key: "search", icon: "search", route: "/search", labelKey: "tabs.search" },
  { key: "me", icon: "people", route: "/me", labelKey: "tabs.me" },
  { key: "records", icon: "records", route: "/records", labelKey: "tabs.records" },
  { key: "profile", icon: "profile", route: "/profile", labelKey: "tabs.profile" },
];

/**
 * Visual bottom tab bar for screens that the PDF shows inside the tab chrome but are
 * pushed over the navigator (e.g. Settings under Profile). Mirrors `BottomTabBar`:
 * 5 tabs with the raised central Me submark; taps navigate to the tab route.
 */
export function StaticTabBar({ active }: { active: TabKey }) {
  const { colors, isRTL } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const items = isRTL ? [...TABS].reverse() : TABS;

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8), flexDirection: "row" }]}>
      {items.map((tab) => {
        const focused = tab.key === active;
        if (tab.key === "me") {
          return (
            <Pressable key={tab.key} onPress={() => router.replace("/me")} style={styles.item} accessibilityRole="button" accessibilityLabel={t(tab.labelKey)}>
              <View style={[styles.meButton, { backgroundColor: colors.primary, borderColor: colors.surface }, shadow(2)]}>
                <MeMark height={20} color={colors.textOnPrimary} />
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable key={tab.key} onPress={() => router.replace(tab.route as never)} style={styles.item} accessibilityRole="button" accessibilityState={{ selected: focused }} accessibilityLabel={t(tab.labelKey)}>
            <Icon name={tab.icon} size={24} tint={focused ? colors.primary : colors.textMuted} strokeWidth={focused ? 2.2 : 1.9} />
            <Text variant="caption" color={focused ? "primary" : "textMuted"} style={styles.label}>{t(tab.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1, paddingTop: 8, alignItems: "flex-start" },
  item: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "flex-start" },
  label: { marginTop: 2 },
  meButton: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginTop: -20, borderWidth: 4 },
});

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { useTheme } from "@/hooks/useTheme";
import { useI18n, type MessageKey } from "@/i18n";
import { HIT_TARGET } from "@/theme/tokens";
import { shadow } from "@/utils/platform";
import { MeMark } from "./MeMark";
import { Text } from "./Text";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface TabConfig {
  active: IconName;
  inactive: IconName;
  labelKey: MessageKey;
  /** Centre tab — rendered as the raised "Me" submark per the brand system. */
  me?: boolean;
}

/** The five approved patient tabs. Keys must match the route file names in (tabs)/. */
const TABS: Record<string, TabConfig> = {
  dashboard: { active: "home", inactive: "home-outline", labelKey: "tabs.home" },
  search: { active: "search", inactive: "search-outline", labelKey: "tabs.search" },
  me: { active: "people", inactive: "people-outline", labelKey: "tabs.me", me: true },
  records: { active: "document-text", inactive: "document-text-outline", labelKey: "tabs.records" },
  profile: { active: "person", inactive: "person-outline", labelKey: "tabs.profile" },
};

/**
 * Persistent bottom navigation for authenticated patient screens (Design Doc p14–16).
 * Five tabs — Home · Search · Me · Records · Profile — with the central Me submark
 * raised as the brand mark. Safe-area aware and mirrored for Arabic RTL.
 */
export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, isRTL } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const items = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => TABS[route.name]);
  const ordered = isRTL ? [...items].reverse() : items;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
          flexDirection: "row",
        },
      ]}
    >
      {ordered.map(({ route, index }) => {
        const cfg = TABS[route.name]!;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (cfg.me) {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.item}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t(cfg.labelKey)}
            >
              <View
                style={[
                  styles.meButton,
                  { backgroundColor: colors.primary, borderColor: colors.surface },
                  shadow(2),
                ]}
              >
                <MeMark height={20} color={colors.textOnPrimary} />
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.item}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(cfg.labelKey)}
          >
            <Ionicons
              name={focused ? cfg.active : cfg.inactive}
              size={24}
              color={focused ? colors.primary : colors.textMuted}
            />
            <Text variant="caption" color={focused ? "primary" : "textMuted"} style={styles.label}>
              {t(cfg.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingTop: 8,
    alignItems: "flex-start",
  },
  item: {
    flex: 1,
    minHeight: HIT_TARGET,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  label: { marginTop: 2 },
  meButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
    borderWidth: 4,
  },
});

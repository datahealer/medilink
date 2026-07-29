import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";

/**
 * 3.3 — Connectivity banner. A thin bar pinned under the status bar that appears while
 * the device is offline. Reads React Query's `onlineManager` (driven by NetInfo in
 * QueryProvider) so there is a single source of truth for connectivity — no second
 * NetInfo subscription. Non-interactive overlay; renders nothing while online.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => onlineManager.isOnline());
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();

  useEffect(() => onlineManager.subscribe(() => setOnline(onlineManager.isOnline())), []);

  if (online) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: colors.error }]}
    >
      <Text variant="caption" weight="700" style={styles.label}>
        {t("common.offline")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 6,
    paddingHorizontal: 16,
    zIndex: 1000,
    elevation: 1000,
  },
  label: { color: "#FFFFFF", textAlign: "center" },
});

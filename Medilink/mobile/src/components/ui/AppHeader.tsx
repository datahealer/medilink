import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { BackButton } from "./BackButton";
import { Text } from "./Text";

export interface AppHeaderProps {
  title: string;
  showBack?: boolean;
  /** Trailing action (e.g. an edit/add button), placed at the inline-end. */
  right?: React.ReactNode;
}

/** Screen header: optional back control, centred-leaning title, optional action. RTL-aware. */
export function AppHeader({ title, showBack = true, right }: AppHeaderProps) {
  const { spacing, isRTL } = useTheme();

  return (
    <View
      style={[
        styles.row,
        { flexDirection: isRTL ? "row-reverse" : "row", marginBottom: spacing.md },
      ]}
    >
      <View style={styles.left}>{showBack ? <BackButton /> : null}</View>
      <Text variant="h2" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {/* Content-sized trailing slot. Never constrain to a fixed narrow width —
          a fixed width forces a Button's label to wrap one character per line. */}
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", minHeight: 44 },
  left: { minWidth: 44, justifyContent: "center" },
  right: { minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  title: { flex: 1, textAlign: "center" },
});

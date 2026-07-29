import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Text } from "./Text";

export type QueueStep = "checked_in" | "waiting" | "called" | "done";

const ORDER: QueueStep[] = ["checked_in", "waiting", "called", "done"];

/**
 * Visit progress: checked in → in queue → called → completed.
 *
 * `current` is derived from server flags only. Steps are never inferred from
 * elapsed time — a stalled queue must look stalled, not silently advance.
 */
export function QueueTimeline({
  current,
  labels,
}: {
  current: QueueStep;
  labels: Record<QueueStep, string>;
}) {
  const { colors, spacing, isRTL } = useTheme();
  const currentIndex = ORDER.indexOf(current);

  return (
    <View
      style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row", gap: spacing.xs }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: ORDER.length, now: currentIndex + 1 }}
    >
      {ORDER.map((step, i) => {
        const done = i <= currentIndex;
        return (
          <View key={step} style={styles.step}>
            <View
              style={[
                styles.bar,
                {
                  backgroundColor: done ? colors.primary : colors.border,
                  borderRadius: 999,
                },
              ]}
            />
            <Text
              variant="caption"
              align="center"
              // Non-colour cue as well as colour: the reached step is emphasised.
              color={done ? "text" : "textFaint"}
              numberOfLines={1}
              style={{ marginTop: 6 }}
            >
              {labels[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start" },
  step: { flex: 1 },
  bar: { height: 5, width: "100%" },
});

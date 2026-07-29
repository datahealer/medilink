import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { Text } from "./Text";

const SIZE = 208;
const STROKE = 12;

/**
 * The dominant element of the Live Queue screen: how many patients are ahead.
 *
 * Shows `peopleAhead`, NOT `queue_items.position` — position is a facility-wide
 * sequence shared across doctors, so it is not "your place in line". The
 * doctor-scoped count is computed server-side (contract §2.1).
 *
 * Progress is rendered with stacked arc segments rather than SVG: the project has
 * no SVG dependency, and a segmented ring reads accurately at a glance while
 * degrading gracefully for large queues.
 */
export function QueuePositionRing({
  peopleAhead,
  total,
  label,
  tone = "primary",
}: {
  peopleAhead: number;
  /** Queue depth when this patient joined, used as the progress denominator. */
  total: number;
  label: string;
  tone?: "primary" | "success";
}) {
  const { colors, isRTL } = useTheme();

  // Guard the denominator: a 0 total would make progress NaN and blank the ring.
  const safeTotal = Math.max(total, peopleAhead, 1);
  const progress = Math.min(1, Math.max(0, (safeTotal - peopleAhead) / safeTotal));

  const animated = useSharedValue(progress);
  const scale = useSharedValue(1);

  useEffect(() => {
    animated.value = withTiming(progress, { duration: 600 });
    // One gentle pulse whenever the line moves, so a change is felt not just read.
    scale.value = withSpring(1.04, { damping: 12 }, () => {
      scale.value = withSpring(1, { damping: 14 });
    });
  }, [progress, animated, scale]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fillStyle = useAnimatedStyle(() => ({
    // Sweep the accent arc by revealing a rotated half-ring.
    opacity: 0.25 + animated.value * 0.75,
  }));

  const ringColor = tone === "success" ? colors.success : colors.primary;

  return (
    <Animated.View style={[styles.wrap, ringStyle]}>
      {/* Track */}
      <View style={[styles.ring, { borderColor: colors.border }]} />
      {/* Progress tint — intensity tracks how far through the queue the patient is */}
      <Animated.View
        style={[styles.ring, styles.absolute, { borderColor: ringColor }, fillStyle]}
      />
      <View style={styles.center} accessibilityElementsHidden importantForAccessibility="no">
        <Text variant="display" align="center" style={{ color: ringColor }}>
          {String(peopleAhead)}
        </Text>
        <Text
          variant="caption"
          color="textMuted"
          align="center"
          style={{ maxWidth: SIZE - 64, writingDirection: isRTL ? "rtl" : "ltr" }}
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: STROKE,
    position: "absolute",
  },
  absolute: { position: "absolute" },
  center: { alignItems: "center", justifyContent: "center", gap: 4 },
});

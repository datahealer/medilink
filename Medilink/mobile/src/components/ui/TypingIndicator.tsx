import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";

/**
 * Three-dot "AI is typing…" animation for the chat, shown while the assistant's reply is
 * being generated but before any text has streamed in. Pure RN Animated (no native dep).
 */
export function TypingIndicator() {
  const { colors } = useTheme();
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay((dots.length - 1 - i) * 160),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.row} accessibilityLabel="Assistant is typing">
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: colors.textMuted,
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4, gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

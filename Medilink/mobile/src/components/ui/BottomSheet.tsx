import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { Text } from "./Text";

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Optional heading rendered at the top of the sheet. */
  title?: string;
  children: React.ReactNode;
  /** Accessibility label for the dismiss backdrop. */
  closeLabel?: string;
}

/**
 * Modal bottom-sheet (design p25 — Cancel). Fades a scrim, slides the panel up,
 * pins to the bottom safe area, and centres to a comfortable width on tablets.
 * Tapping the scrim or the hardware back button dismisses it.
 */
export function BottomSheet({ visible, onClose, title, children, closeLabel }: BottomSheetProps) {
  const { colors, radii, spacing, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [48, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={[styles.scrim, { backgroundColor: colors.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel ?? "Close"}
      >
        <Animated.View style={[styles.center, { transform: [{ translateY }] }]}>
          {/* Stop propagation so taps inside the panel don't dismiss. */}
          <Pressable
            onPress={() => {}}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radii.xl,
                borderTopRightRadius: radii.xl,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                paddingBottom: insets.bottom + spacing.lg,
                maxWidth: formMaxWidth,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            {title ? (
              <Text variant="title" align={isRTL ? "right" : "left"} style={{ marginBottom: spacing.sm }}>
                {title}
              </Text>
            ) : null}
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end" },
  center: { width: "100%", alignItems: "center" },
  sheet: { width: "100%", alignSelf: "center" },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12, opacity: 0.7 },
});

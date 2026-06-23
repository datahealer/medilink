import React from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/hooks/useTheme";

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView (required for all form screens). */
  scroll?: boolean;
  /** Apply default horizontal padding. */
  padded?: boolean;
  /** Sticky element pinned to the bottom, outside the scroll area. */
  footer?: React.ReactNode;
  edges?: readonly Edge[];
  /** Center content vertically (used by splash / simple screens). */
  center?: boolean;
  backgroundColor?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /** Dismiss the keyboard when tapping outside inputs (default true). */
  dismissKeyboardOnTap?: boolean;
}

/**
 * App-wide screen shell: safe areas, keyboard avoidance, optional scroll, themed
 * background and status bar. Works identically on Android and iOS (no fixed
 * heights, no notch assumptions).
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  footer,
  edges = ["top", "bottom", "left", "right"],
  center = false,
  backgroundColor,
  contentStyle,
  dismissKeyboardOnTap = true,
}: ScreenProps) {
  const { colors, scheme, spacing } = useTheme();
  const bg = backgroundColor ?? colors.background;

  const padStyle: ViewStyle = padded ? { paddingHorizontal: spacing.lg } : {};

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scrollContent,
        center && styles.center,
        padStyle,
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, center && styles.center, padStyle, contentStyle]}>{children}</View>
  );

  const inner = dismissKeyboardOnTap ? (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.flex}>{body}</View>
    </TouchableWithoutFeedback>
  ) : (
    body
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: bg }]} edges={edges}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        {inner}
        {footer ? <View style={[styles.footer, padStyle]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingVertical: 24 },
  center: { justifyContent: "center", alignItems: "center" },
  footer: { paddingTop: 8, paddingBottom: 8 },
});

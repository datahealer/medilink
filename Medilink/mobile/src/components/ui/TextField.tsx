import React, { forwardRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { fontFamilyFor } from "@/theme/typography";
import { Text } from "./Text";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  /** Trailing element (e.g. the show/hide toggle for PasswordField). */
  trailing?: React.ReactNode;
  /** Leading element (e.g. a "+968" dial-code prefix). */
  leading?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Themed, accessible, RTL-aware text input. Used directly and as the base for
 * PasswordField. Shows label + inline error; error state recolours the border.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, trailing, leading, containerStyle, onFocus, onBlur, ...rest },
  ref
) {
  const { colors, radii, isRTL } = useTheme();
  const [focused, setFocused] = useState(false);

  // Focused state recolours the border to the brand violet (PDF p6 active input),
  // unless an error is present (error always wins).
  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" color="textMuted" style={[styles.label, { letterSpacing: 0.5 }]}>
          {label.toUpperCase()}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.inputBackground,
            borderColor,
            borderWidth: focused && !error ? 2 : 1,
            borderRadius: radii.md,
            flexDirection: isRTL ? "row-reverse" : "row",
          },
        ]}
      >
        {leading ? <View style={styles.adornment}>{leading}</View> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: colors.text,
              fontFamily: fontFamilyFor("body", "400", isRTL),
              textAlign: isRTL ? "right" : "left",
            },
          ]}
          accessibilityLabel={label}
          {...rest}
        />
        {trailing ? <View style={styles.adornment}>{trailing}</View> : null}
      </View>
      {error ? (
        <Text variant="caption" color="error" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: "100%" },
  label: { marginBottom: 6 },
  field: {
    minHeight: HIT_TARGET,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  adornment: { justifyContent: "center", alignItems: "center" },
  error: { marginTop: 6 },
});

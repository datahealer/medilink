import React, { useRef } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";

import { useTheme } from "@/hooks/useTheme";

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  onComplete?: (value: string) => void;
  error?: boolean;
}

/**
 * Segmented OTP entry with auto-advance + backspace handling. Always laid out
 * left-to-right (numerals are entered LTR even in an Arabic UI). Each cell is an
 * accessible, ≥44pt target.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  onComplete,
  error = false,
}: OtpInputProps) {
  const { colors, radii } = useTheme();
  const inputs = useRef<(TextInput | null)[]>([]);

  const setChar = (index: number, char: string) => {
    const digits = value.split("");
    digits[index] = char;
    const next = digits.join("").slice(0, length);
    onChange(next);
    return next;
  };

  const handleChange = (index: number, text: string) => {
    // Handle paste / fast typing: take the trailing digits.
    const cleaned = text.replace(/[^0-9]/g, "");
    if (cleaned.length === 0) {
      const next = setChar(index, "");
      return next;
    }
    if (cleaned.length > 1) {
      const merged = (value.slice(0, index) + cleaned).slice(0, length);
      onChange(merged);
      const focusTo = Math.min(merged.length, length - 1);
      inputs.current[focusTo]?.focus();
      if (merged.length === length) onComplete?.(merged);
      return;
    }
    const next = setChar(index, cleaned);
    if (index < length - 1) inputs.current[index + 1]?.focus();
    if (next.length === length && !next.includes("")) onComplete?.(next);
  };

  const handleKeyPress = (
    index: number,
    e: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (e.nativeEvent.key === "Backspace" && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      setChar(index - 1, "");
    }
  };

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => {
        const filled = Boolean(value[i]);
        return (
          <TextInput
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={value[i] ?? ""}
            onChangeText={(t) => handleChange(i, t)}
            onKeyPress={(e) => handleKeyPress(i, e)}
            keyboardType="number-pad"
            maxLength={1}
            autoFocus={autoFocus && i === 0}
            accessibilityLabel={`Digit ${i + 1}`}
            selectTextOnFocus
            style={[
              styles.cell,
              {
                color: colors.text,
                backgroundColor: colors.inputBackground,
                borderRadius: radii.md,
                borderColor: error
                  ? colors.error
                  : filled
                    ? colors.primary
                    : colors.border,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Always LTR so cell 1 is leftmost regardless of locale.
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  cell: {
    flex: 1,
    minWidth: 44,
    height: 56,
    borderWidth: 2,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
  },
});

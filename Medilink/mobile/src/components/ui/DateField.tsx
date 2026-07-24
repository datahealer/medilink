import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { useI18n } from "@/i18n";
import { Text } from "./Text";
import { Button } from "./Button";

export interface DateFieldProps {
  label?: string;
  /** Stored value in `YYYY-MM-DD` (or empty when unset). */
  value?: string;
  /** Emits `YYYY-MM-DD`. Never emits a future date (picker is capped at today). */
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Format a local Date to `YYYY-MM-DD` (matches the DB column + `isValidDob`). */
const toYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Parse a `YYYY-MM-DD` string to a local Date; neutral default when unset/invalid. */
const parseYMD = (value?: string): Date => {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split("-");
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return new Date(2000, 0, 1);
};

/**
 * Themed, RTL-aware date picker field (QA #1). Replaces free-text DOB entry: taps
 * open the native `@react-native-community/datetimepicker`, capped at today so future
 * dates can't be selected. Value stays `YYYY-MM-DD`, so validators/API are unchanged.
 * Android uses the native dialog (auto-closes); iOS shows a spinner in a bottom sheet.
 */
export function DateField({ label, value, onChange, placeholder, error, containerStyle }: DateFieldProps) {
  const { colors, radii, isRTL } = useTheme();
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const today = new Date();
  const current = parseYMD(value);
  const borderColor = error ? colors.error : colors.border;

  const onAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShow(false);
    if (event.type === "set" && selected) onChange(toYMD(selected));
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" color="textMuted" style={[styles.label, { letterSpacing: 0.5 }]}>
          {label.toUpperCase()}
        </Text>
      ) : null}

      <Pressable
        onPress={() => setShow(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.field, { backgroundColor: colors.inputBackground, borderColor, borderRadius: radii.md }]}
      >
        <Text variant="body" color={value ? "text" : "textMuted"} align={isRTL ? "right" : "left"} style={styles.value}>
          {value || placeholder || "YYYY-MM-DD"}
        </Text>
      </Pressable>

      {error ? (
        <Text variant="caption" color="error" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {show && Platform.OS !== "ios" ? (
        <DateTimePicker value={current} mode="date" display="default" maximumDate={today} onChange={onAndroidChange} />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShow(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={() => undefined}>
              <DateTimePicker
                value={current}
                mode="date"
                display="spinner"
                maximumDate={today}
                textColor={colors.text}
                onChange={(_e, selected) => {
                  if (selected) onChange(toYMD(selected));
                }}
              />
              <Button label={t("common.done")} onPress={() => setShow(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  label: { marginBottom: 6 },
  field: {
    minHeight: HIT_TARGET,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  value: { flex: 1 },
  error: { marginTop: 6 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { paddingBottom: 24, paddingTop: 8, paddingHorizontal: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
});

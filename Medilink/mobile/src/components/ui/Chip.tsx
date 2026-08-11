import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { HIT_TARGET } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Show a trailing ✕ that calls onRemove (removable chip). */
  onRemove?: () => void;
  accessibilityLabel?: string;
}

/**
 * Pill chip — used for selectable options (relationship/gender) and removable tags.
 *
 * ── LONG LABELS MUST NOT ESCAPE THE CHIP (QA MED-011) ──
 *
 * Medical tags are free text, so a long allergy name reaches this component. Previously
 * the chip had no width ceiling and the label no line limit, so a long value pushed the
 * chip past the screen edge and the remove button out of reach.
 *
 * Three things contain it, and all three are needed:
 *   • `maxWidth: "100%"` + `flexShrink: 1` on the chip — lets it shrink inside the
 *     wrapping row instead of forcing the row wider than its parent.
 *   • `flexShrink: 1` on the label — without it the Text keeps its intrinsic width and
 *     the chip's maxWidth has nothing to shrink.
 *   • `numberOfLines={1}` + `ellipsizeMode="tail"` — the visible truncation. The FULL
 *     value stays in `accessibilityLabel`, so nothing is lost to a screen reader.
 *
 * The remove button is deliberately outside the shrinking label so it can never be
 * squeezed to zero width.
 */
export function Chip({ label, selected = false, onPress, onRemove, accessibilityLabel }: ChipProps) {
  const { colors, radii, spacing, isRTL } = useTheme();

  const body = (
    <View
      style={[
        styles.chip,
        {
          flexDirection: isRTL ? "row-reverse" : "row",
          borderRadius: radii.pill,
          paddingHorizontal: spacing.md,
          backgroundColor: selected ? colors.primary : colors.surfaceAlt,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text
        variant="label"
        color={selected ? "textOnPrimary" : "text"}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={styles.label}
        // Truncation is visual only — the full term stays available to assistive tech.
        accessibilityLabel={label}
      >
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          style={isRTL ? { marginEnd: 6 } : { marginStart: 6 }}
        >
          <Icon
            name="close"
            size={14}
            tint={selected ? colors.textOnPrimary : colors.textMuted}
          />
        </Pressable>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingVertical: 6,
    // Containment for long free-text tags — see the block comment above.
    maxWidth: "100%",
    flexShrink: 1,
  },
  label: { flexShrink: 1 },
});

export const CHIP_MIN_TOUCH = HIT_TARGET;

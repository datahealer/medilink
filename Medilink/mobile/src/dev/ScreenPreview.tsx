import React from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader, Card, MeMark, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { SCREEN_BY_ID } from "./screenRegistry";

/**
 * PDF-styled placeholder for screens that are designed in MediLink v1.0 but whose
 * interactive build lands in a later batch. Branded (Me submark, theme tokens,
 * Agatho/Manrope type) so navigation reads as MediLink — never a generic stub.
 *
 * DEV/preview copy is intentionally plain English; these routes are replaced by the
 * real, fully-localised screens in their scheduled batch.
 */
export function ScreenPreview({ id, showBack = true }: { id: string; showBack?: boolean }) {
  const { colors, spacing, radii } = useTheme();
  const entry = SCREEN_BY_ID[id];
  const title = entry?.title ?? id;

  return (
    <Screen scroll edges={["top", "left", "right", "bottom"]}>
      <AppHeader title={title} showBack={showBack} />

      <View style={styles.center}>
        <View style={[styles.markWrap, { backgroundColor: colors.accent, borderRadius: radii.xl }]}>
          <MeMark height={44} color={colors.primary} />
        </View>

        <View style={[styles.badge, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radii.pill }]}>
          <Text variant="caption" color="textMuted">
            Designed · PDF p{entry?.pdfPage ?? "—"}
          </Text>
        </View>

        <Text variant="h2" align="center" style={{ marginTop: spacing.md }}>
          {title}
        </Text>
        <Text variant="caption" color="textMuted" align="center" style={{ marginTop: 4 }}>
          {entry?.flow ?? ""}
        </Text>

        <Card style={{ marginTop: spacing.lg, width: "100%" }}>
          <Text variant="body" color="textMuted" align="center">
            This screen is fully designed in the MediLink documentation
            {entry?.pdfPage ? ` (page ${entry.pdfPage})` : ""}. Its interactive build is
            scheduled for {entry?.batch ? `Batch ${entry.batch}` : "an upcoming batch"} —
            navigation and routing are wired now so the flow is complete and tappable.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", paddingTop: 24 },
  markWrap: { width: 96, height: 96, alignItems: "center", justifyContent: "center" },
  badge: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

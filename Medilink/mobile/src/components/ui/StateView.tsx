import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { Button } from "./Button";
import { Text } from "./Text";

/** Centred loading spinner. */
export function LoadingState() {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

/** Error state with a retry action. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { spacing } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.center}>
      <Text variant="body" color="textMuted" align="center">
        {message}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: spacing.md, minWidth: 160 }}>
          <Button label={t("common.retry")} variant="outline" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

/** Empty state with title/body and an optional primary action. */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { spacing } = useTheme();
  return (
    <View style={styles.center}>
      <Text variant="title" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.lg, minWidth: 200 }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 },
});

import React from "react";
import { StyleSheet, Switch, View } from "react-native";

import { AppHeader, Chip, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useNotificationPrefs, useUpdateNotificationPrefs } from "@/hooks/queries/useNotifications";
import type { NotificationPrefs } from "@/data/types";

type ToggleKey = keyof Omit<NotificationPrefs, "channels">;
type ChannelKey = keyof NotificationPrefs["channels"];

const CATEGORIES: { key: ToggleKey; label: "appointmentReminders" | "paymentsInvoices" | "labResults" | "prescriptions" | "facilityUpdates" | "promotions" }[] = [
  { key: "appointmentReminders", label: "appointmentReminders" },
  { key: "paymentsInvoices", label: "paymentsInvoices" },
  { key: "labResults", label: "labResults" },
  { key: "prescriptions", label: "prescriptions" },
  { key: "facilityUpdates", label: "facilityUpdates" },
  { key: "promotions", label: "promotions" },
];

const CHANNELS: { key: ChannelKey; label: "push" | "email" | "sms" }[] = [
  { key: "push", label: "push" },
  { key: "email", label: "email" },
  { key: "sms", label: "sms" },
];

/** Notification Preferences (PDF p32): per-category toggles + channels. */
export default function NotificationPrefsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const prefs = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const p = prefs.data;

  return (
    <Screen scroll padded edges={["top", "left", "right", "bottom"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title={t("notif.prefsTitle")} />

      {prefs.isLoading || !p ? (
        <LoadingState />
      ) : (
        <>
          {CATEGORIES.map((c) => (
            <View key={c.key} style={[styles.row, { borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Text variant="title" style={{ flex: 1 }}>{t(`notif.${c.label}`)}</Text>
              <Switch
                value={p[c.key]}
                onValueChange={(v) => update.mutate({ [c.key]: v })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.surface}
                accessibilityLabel={t(`notif.${c.label}`)}
              />
            </View>
          ))}

          <Text variant="label" color="textMuted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
            {t("notif.channels")}
          </Text>
          <View style={[styles.chips, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {CHANNELS.map((ch) => (
              <Chip
                key={ch.key}
                label={t(`notif.${ch.label}`)}
                selected={p.channels[ch.key]}
                onPress={() => update.mutate({ channels: { ...p.channels, [ch.key]: !p.channels[ch.key] } })}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  chips: { flexWrap: "wrap", gap: 8 },
});

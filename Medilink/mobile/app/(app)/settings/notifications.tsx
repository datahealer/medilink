import React from "react";
import { StyleSheet, Switch, View } from "react-native";

import { AppCard, AppHeader, LoadingState, Screen, Text } from "@/components/ui";
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

/** Notification Preferences (PDF p32): per-category toggles + channels, grouped into rounded cards. */
export default function NotificationPrefsScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const prefs = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const p = prefs.data;

  const toggleRow = (label: string, value: boolean, onChange: (v: boolean) => void, showDivider: boolean) => (
    <View
      key={label}
      style={[
        styles.row,
        { flexDirection: isRTL ? "row-reverse" : "row" },
        showDivider ? { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.border } : null,
      ]}
    >
      <Text variant="body" weight="500" style={{ flex: 1 }} align={isRTL ? "right" : "left"}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.border}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <Screen scroll padded edges={["top", "left", "right", "bottom"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title={t("notif.prefsTitle")} />

      {prefs.isLoading || !p ? (
        <LoadingState />
      ) : (
        <>
          {/* Categories */}
          <Text variant="label" color="textMuted" style={styles.section}>{t("notif.categories")}</Text>
          <AppCard variant="detail" style={styles.group}>
            {CATEGORIES.map((c, i) =>
              toggleRow(t(`notif.${c.label}`), p[c.key], (v) => update.mutate({ [c.key]: v }), i > 0),
            )}
          </AppCard>

          {/* Channels */}
          <Text variant="label" color="textMuted" style={styles.section}>{t("notif.channels")}</Text>
          <AppCard variant="detail" style={styles.group}>
            {CHANNELS.map((ch, i) =>
              toggleRow(
                t(`notif.${ch.label}`),
                p.channels[ch.key],
                (v) => update.mutate({ channels: { ...p.channels, [ch.key]: v } }),
                i > 0,
              ),
            )}
          </AppCard>

          <View style={{ height: spacing.lg }} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 8 },
  group: { paddingVertical: 0, paddingHorizontal: 16 },
  row: { alignItems: "center", minHeight: 52, paddingVertical: 12 },
});

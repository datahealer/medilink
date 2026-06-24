import React from "react";
import { StyleSheet, Switch, View } from "react-native";

import { AppCard, AppHeader, Chip, LoadingState, Screen, Text } from "@/components/ui";
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

/**
 * Notification Preferences (PDF p32): each preference is its OWN rounded card row with
 * a purple pill toggle; "Channels" is a compact chip selector (Push / Email / SMS).
 */
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
          {/* One rounded card per preference (PDF) */}
          {CATEGORIES.map((c) => (
            <AppCard key={c.key} variant="detail" style={styles.rowCard}>
              <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Text variant="body" weight="500" style={{ flex: 1 }} align={isRTL ? "right" : "left"}>
                  {t(`notif.${c.label}`)}
                </Text>
                <Switch
                  value={p[c.key]}
                  onValueChange={(v) => update.mutate({ [c.key]: v })}
                  trackColor={{ true: colors.primaryMuted, false: colors.border }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={colors.border}
                  accessibilityLabel={t(`notif.${c.label}`)}
                />
              </View>
            </AppCard>
          ))}

          {/* Channels — compact chip selector (PDF) */}
          <Text variant="label" color="textMuted" style={styles.section}>{t("notif.channels")}</Text>
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

          <View style={{ height: spacing.lg }} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowCard: { marginBottom: 10, paddingVertical: 14 },
  row: { alignItems: "center", minHeight: 28 },
  section: { marginTop: 16, marginBottom: 10 },
  chips: { flexWrap: "wrap", gap: 8 },
});

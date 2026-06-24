import React from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader, Card, EmptyState, ErrorState, Icon, type IconName, LoadingState, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useFacilityMessages } from "@/hooks/queries/useNotifications";

function iconFor(source: string): IconName {
  if (/hospital/i.test(source)) return "location";
  if (/lab/i.test(source)) return "lab";
  return "location";
}

/** Facility Messages (PDF p32): read-only admin updates from MediLink & clinics. */
export default function FacilityMessagesScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const messages = useFacilityMessages();
  const items = messages.data ?? [];

  return (
    <Screen scroll padded edges={["top", "left", "right", "bottom"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center" }}>
      <AppHeader title={t("notif.messagesTitle")} />
      <Text variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>
        {t("notif.messagesSubtitle")}
      </Text>

      {messages.isLoading ? (
        <LoadingState />
      ) : messages.isError ? (
        <ErrorState message={t("notif.loadError")} onRetry={() => messages.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t("notif.messagesEmpty")} />
      ) : (
        items.map((m) => (
          <Card key={m.id} style={{ marginBottom: spacing.sm }}>
            <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt }]}>
                <Icon name={iconFor(m.source)} size={18} tint={colors.primary} />
              </View>
              <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
                <View style={[styles.titleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <Text variant="title" numberOfLines={1} style={{ flex: 1 }}>{m.source}</Text>
                  <Text variant="caption" color="textMuted">{m.time}</Text>
                </View>
                <Text variant="caption" color="textMuted" numberOfLines={1}>{m.preview}</Text>
              </View>
              {m.unread ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start" },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  titleRow: { alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginStart: 6, marginTop: 6 },
});

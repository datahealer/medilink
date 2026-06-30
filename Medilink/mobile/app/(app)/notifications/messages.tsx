import React from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader, Card, EmptyState, ErrorState, Icon, type IconName, LoadingState, MeMark, Screen, StaticTabBar, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useFacilityMessages } from "@/hooks/queries/useNotifications";

/** MediLink's own announcements carry the brand "Me" submark; facility rows use a typed icon. */
function isBrand(source: string): boolean {
  return /medilink|ميديلينك/i.test(source);
}
function iconFor(source: string): IconName {
  if (/hospital|مستشفى/i.test(source)) return "location";
  if (/lab|مختبر/i.test(source)) return "lab";
  return "mail";
}

/** Facility Messages (PDF p32): read-only admin updates from MediLink & clinics. */
export default function FacilityMessagesScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const messages = useFacilityMessages();
  const items = messages.data ?? [];

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.md }}
      footer={<View style={{ marginHorizontal: -spacing.lg, marginBottom: -8 }}><StaticTabBar active="home" /></View>}
    >
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
              <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
                {isBrand(m.source) ? (
                  <MeMark height={20} color={colors.primary} />
                ) : (
                  <Icon name={iconFor(m.source)} size={20} tint={colors.primary} />
                )}
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
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  titleRow: { alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginStart: 6, marginTop: 6 },
});

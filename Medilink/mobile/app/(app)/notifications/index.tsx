import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, Card, EmptyState, ErrorState, Icon, type IconName, LoadingState, MeMark, Screen, StaticTabBar, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useNotifications } from "@/hooks/queries/useNotifications";
import type { NotificationItem, NotificationKind } from "@/data/types";

const ICON: Record<NotificationKind, IconName> = {
  assistant: "ai",
  appointment: "calendar",
  payment: "payment",
  lab: "lab",
  prescription: "medication",
  facility: "location",
};

/** PDF: each item has a rounded-square icon container with a varied tint. */
type Tint = "lavender" | "blue" | "mint";
const TINT: Record<NotificationKind, Tint> = {
  assistant: "lavender",
  appointment: "lavender",
  payment: "mint",
  lab: "blue",
  prescription: "lavender",
  facility: "blue",
};

const ROUTE: Record<NotificationKind, string> = {
  assistant: "/ai/insights",
  appointment: "/appointments/mock-appt-1",
  payment: "/payments/invoice/ML-INV-48213",
  lab: "/records/labs",
  prescription: "/records/prescriptions",
  facility: "/notifications/messages",
};

/** Notification Center (PDF p31): grouped feed of reminders, payments, lab alerts. */
export default function NotificationsScreen() {
  const { colors, spacing, isRTL, scheme } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();
  const notifications = useNotifications();
  const [allRead, setAllRead] = useState(false);

  const items = notifications.data ?? [];
  const today = items.filter((n) => n.group === "today");
  const earlier = items.filter((n) => n.group === "earlier");

  const tintBg = (t: Tint) =>
    t === "blue" ? colors.accent2 : t === "mint" ? (scheme === "dark" ? "rgba(95,207,155,0.20)" : "#D7F0E2") : colors.accent;

  const row = (n: NotificationItem) => (
    <Card key={n.id} onPress={() => router.push(ROUTE[n.kind] as never)} style={{ marginBottom: spacing.sm }}>
      <View style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {n.kind === "assistant" ? (
          <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
            <MeMark height={18} color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.iconWrap, { backgroundColor: tintBg(TINT[n.kind]) }]}>
            <Icon name={ICON[n.kind]} size={20} tint={colors.primary} />
          </View>
        )}
        <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
          <View style={[styles.titleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text variant="title" numberOfLines={1} style={{ flex: 1 }}>{n.title}</Text>
            <Text variant="caption" color="textMuted">{n.time}</Text>
          </View>
          <Text variant="caption" color="textMuted" numberOfLines={2}>{n.body}</Text>
        </View>
        {n.unread && !allRead ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
      </View>
    </Card>
  );

  return (
    <Screen
      scroll
      padded
      edges={["top", "left", "right"]}
      contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.md }}
      footer={<View style={{ marginHorizontal: -spacing.lg, marginBottom: -8 }}><StaticTabBar active="home" /></View>}
    >
      <AppHeader
        title={t("notif.title")}
        right={
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => router.push("/notifications/messages")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("notif.messagesTitle")}>
              <Icon name="mail" size={20} tint={colors.text} />
            </Pressable>
            <Pressable onPress={() => setAllRead(true)} hitSlop={8} accessibilityRole="button">
              <Text variant="label" color="primary">{t("notif.markAll")}</Text>
            </Pressable>
          </View>
        }
      />

      {notifications.isLoading ? (
        <LoadingState />
      ) : notifications.isError ? (
        <ErrorState message={t("notif.loadError")} onRetry={() => notifications.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t("notif.emptyTitle")} body={t("notif.emptyBody")} />
      ) : (
        <>
          {today.length ? (
            <>
              <Text variant="label" color="textMuted" style={styles.group}>{t("notif.today")}</Text>
              {today.map(row)}
            </>
          ) : null}
          {earlier.length ? (
            <>
              <Text variant="label" color="textMuted" style={styles.group}>{t("notif.earlier")}</Text>
              {earlier.map(row)}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start" },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  titleRow: { alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginStart: 6, marginTop: 6 },
  group: { marginTop: 12, marginBottom: 8 },
});

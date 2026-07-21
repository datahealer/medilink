import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Avatar, Button, Icon, type IconName, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { useSignOut, useDeleteAccount } from "@/hooks/queries/useAuth";
import { useProfile } from "@/hooks/queries/usePatient";
import { localizedName } from "@/utils/localizedName";

interface HubItem {
  key: string;
  labelKey: MessageKey;
  icon: IconName;
  onPress: () => void;
}

/**
 * "Me" hub (F7) — the center tab is now a navigation hub to the user's areas, not the
 * Family list (which moved to /family). Groups real destinations only; transient
 * screens (filters, search results, booking steps) are intentionally excluded.
 */
export default function MeHubScreen() {
  const { spacing, colors, isRTL, radii } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t } = useI18n();

  const profile = useProfile();
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();
  const account = profile.data?.account;
  const name = localizedName(account?.full_name ?? "—", account?.full_name_ar, account?.full_name_ar_status, isRTL);

  const go = (path: string) => () => router.push(path as never);

  const sections: { titleKey: MessageKey; items: HubItem[] }[] = [
    {
      titleKey: "meHub.sectionAccount",
      items: [
        { key: "profile", labelKey: "meHub.profile", icon: "profile", onPress: go("/profile") },
        { key: "family", labelKey: "meHub.family", icon: "people", onPress: go("/family") },
      ],
    },
    {
      titleKey: "meHub.sectionHealth",
      items: [
        { key: "appointments", labelKey: "meHub.appointments", icon: "calendar", onPress: go("/appointments") },
        { key: "history", labelKey: "meHub.appointmentHistory", icon: "time", onPress: go("/appointments?tab=past") },
        { key: "medical", labelKey: "meHub.medicalRecords", icon: "records", onPress: go("/medical-history") },
        { key: "vault", labelKey: "meHub.vault", icon: "document", onPress: go("/records") },
        { key: "rx", labelKey: "meHub.prescriptions", icon: "medication", onPress: go("/records/prescriptions") },
        { key: "labs", labelKey: "meHub.labs", icon: "lab", onPress: go("/records/labs") },
      ],
    },
    {
      titleKey: "meHub.sectionActivity",
      items: [
        { key: "payments", labelKey: "meHub.payments", icon: "payment", onPress: go("/payments") },
        { key: "notifications", labelKey: "meHub.notifications", icon: "alerts", onPress: go("/notifications") },
      ],
    },
    {
      titleKey: "meHub.sectionTools",
      items: [
        { key: "ai", labelKey: "meHub.aiSymptoms", icon: "ai", onPress: go("/ai/assistant") },
        { key: "map", labelKey: "meHub.map", icon: "map", onPress: go("/search/map") },
      ],
    },
    {
      titleKey: "meHub.sectionSettings",
      items: [
        { key: "settings", labelKey: "meHub.settings", icon: "settings", onPress: go("/settings") },
        { key: "language", labelKey: "meHub.language", icon: "language", onPress: go("/language") },
        { key: "theme", labelKey: "meHub.theme", icon: "moon", onPress: go("/settings/appearance") },
      ],
    },
  ];

  const onSignOut = () => {
    Alert.alert(t("dashboard.signOutConfirm"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.signOut"),
        style: "destructive",
        onPress: () => signOut.mutate(undefined, { onSettled: () => router.replace("/auth/sign-in") }),
      },
    ]);
  };

  const onDeleteAccount = () => {
    Alert.alert(t("settings.deleteConfirmTitle"), t("settings.deleteConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.deleteConfirmCta"),
        style: "destructive",
        onPress: () =>
          deleteAccount.mutate(undefined, {
            onSuccess: (res) => {
              if (res.ok) {
                router.replace("/auth/sign-in");
                Alert.alert(t("settings.deleteScheduled"));
              } else {
                Alert.alert(t(res.messageKey ?? "settings.deleteFailed"));
              }
            },
            onError: () => Alert.alert(t("settings.deleteFailed")),
          }),
      },
    ]);
  };

  const row = (item: HubItem) => (
    <Pressable
      key={item.key}
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={t(item.labelKey)}
      style={({ pressed }) => [
        styles.row,
        {
          flexDirection: isRTL ? "row-reverse" : "row",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.md,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm }]}>
        <Icon name={item.icon} size={20} tint={colors.primary} />
      </View>
      <Text variant="title" style={[styles.rowLabel, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
        {t(item.labelKey)}
      </Text>
      <Icon name="chevron" direction={isRTL ? "left" : "right"} size={20} tint={colors.textMuted} />
    </Pressable>
  );

  return (
    <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}>
      {/* Account header */}
      <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Avatar name={account?.full_name} uri={profile.data?.patient?.profile_photo_url} size={52} />
        <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
          <Text variant="h2" numberOfLines={1}>{account?.full_name ? name : t("meHub.title")}</Text>
          {account?.email ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>{account.email}</Text>
          ) : null}
        </View>
      </View>

      {sections.map((section) => (
        <View key={section.titleKey}>
          <Text variant="label" color="textMuted" style={styles.section}>{t(section.titleKey)}</Text>
          {section.items.map(row)}
        </View>
      ))}

      {/* Danger zone */}
      <View style={styles.danger}>
        <Button label={t("settings.signOut")} variant="ghost" loading={signOut.isPending} onPress={onSignOut} />
        <Button label={t("settings.deleteAccount")} variant="destructive" loading={deleteAccount.isPending} onPress={onDeleteAccount} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 8 },
  section: { marginTop: 20, marginBottom: 8 },
  row: {
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    marginBottom: 8,
  },
  iconWrap: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1 },
  danger: { gap: 12, marginTop: 28 },
});

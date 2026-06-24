import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Avatar, Button, Card, Icon, Screen, StaticTabBar, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useSignOut } from "@/hooks/queries/useAuth";
import { useProfile } from "@/hooks/queries/usePatient";

/**
 * Settings (PDF p34): account hub for preferences, privacy and data controls.
 * Sign out lives here (moved off the Profile screen to match the PDF). Reached via
 * the gear on the Profile screen.
 */
export default function SettingsScreen() {
  const { spacing, colors, isRTL, mode } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, locale } = useI18n();

  const appearanceValue =
    mode === "system" ? t("appearance.system") : mode === "dark" ? t("appearance.dark") : t("appearance.light");

  const profile = useProfile();
  const signOut = useSignOut();

  const account = profile.data?.account;

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

  const row = (label: string, value: string | null, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        {
          flexDirection: isRTL ? "row-reverse" : "row",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text variant="title" style={{ flex: 1 }}>{label}</Text>
      {value ? (
        <Text variant="body" color="textMuted" style={isRTL ? { marginStart: 8 } : { marginEnd: 8 }}>
          {value}
        </Text>
      ) : null}
      <Icon name="chevron" direction={isRTL ? "left" : "right"} size={20} tint={colors.textMuted} />
    </Pressable>
  );

  return (
    <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.lg }} footer={<View style={{ marginHorizontal: -spacing.lg, marginBottom: -8 }}><StaticTabBar active="profile" /></View>}>
      <Text variant="h2" style={{ marginBottom: spacing.md }}>{t("settings.title")}</Text>

      {/* Account */}
      <Card>
        <View style={[styles.account, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={account?.full_name} uri={profile.data?.patient?.profile_photo_url} size={48} />
          <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
            <Text variant="title" numberOfLines={1}>{account?.full_name ?? "—"}</Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {account?.email ?? "aisha@medilink.om"}
            </Text>
          </View>
        </View>
      </Card>

      {/* Preferences */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("settings.preferences")}</Text>
      {row(t("settings.language"), locale === "ar" ? "العربية" : "English", () => router.push("/language"))}
      {row(t("settings.appearance"), appearanceValue, () => router.push("/settings/appearance"))}
      {row(t("settings.notifications"), null, () => router.push("/settings/notifications"))}
      {row(t("settings.medicalHistory"), null, () => router.push("/medical-history"))}

      {/* Account & data */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("settings.accountData")}</Text>
      {row(t("settings.privacy"), null, () => Alert.alert(t("settings.privacy"), t("settings.privacyComingSoon")))}
      {row(t("settings.exportData"), null, () => Alert.alert(t("settings.exportData"), t("settings.exportComingSoon")))}

      {/* Sign out / delete */}
      <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={{ flex: 1 }}>
          <Button label={t("settings.signOut")} variant="ghost" loading={signOut.isPending} onPress={onSignOut} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t("settings.deleteAccount")}
            variant="destructive"
            onPress={() => Alert.alert(t("settings.deleteAccount"), t("settings.deleteComingSoon"))}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { alignItems: "center" },
  section: { marginTop: 24, marginBottom: 8 },
  row: {
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    marginBottom: 8,
  },
  actions: { gap: 12, marginTop: 24 },
});

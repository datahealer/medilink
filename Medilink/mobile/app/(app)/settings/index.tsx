import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Avatar, Button, Card, Icon, Screen, StaticTabBar, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useSignOut, useDeleteAccount } from "@/hooks/queries/useAuth";
import { useProfile } from "@/hooks/queries/usePatient";
import { getAppVersion } from "@/utils/appVersion";
import { localizedName } from "@/utils/localizedName";

/**
 * Settings (PDF p34): account hub for preferences, privacy and data controls.
 * Sign out lives here (moved off the Profile screen to match the PDF). Reached via
 * the gear on the Profile screen.
 */
export default function SettingsScreen() {
  const { spacing, colors, isRTL, mode } = useTheme();
  const { contentMaxWidth } = useResponsive();
  const { t, locale } = useI18n();

  const themeWord =
    mode === "system" ? t("appearance.system") : mode === "dark" ? t("appearance.dark") : t("appearance.light");
  // Design p34 shows the appearance value as "Light · RTL"; the RTL tag only when Arabic is active.
  const appearanceValue = isRTL ? `${themeWord} · RTL` : themeWord;

  const profile = useProfile();
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();

  const account = profile.data?.account;
  // Build-time constant; no need to memoize or re-read on render.
  const appVersion = getAppVersion();

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
                // MED-016: deletion no longer signs the user out. The backend revokes
                // every OTHER session and RLS locks the data, but this device keeps a
                // session so the account can still be restored — so route to the
                // restore-only screen rather than the sign-in wall.
                router.replace("/restore-account");
              } else {
                Alert.alert(t(res.messageKey ?? "settings.deleteFailed"));
              }
            },
            onError: () => Alert.alert(t("settings.deleteFailed")),
          }),
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

  /**
   * Read-only variant of `row` (QA MED-022): a plain View, not a Pressable, and no chevron.
   * Both would promise a destination that does not exist. Shares `styles.row` so the About
   * entry lines up with the Preferences rows above it.
   */
  const infoRow = (label: string, value: string) => (
    <View
      style={[
        styles.row,
        {
          flexDirection: isRTL ? "row-reverse" : "row",
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Text variant="title" style={{ flex: 1 }}>{label}</Text>
      <Text variant="body" color="textMuted">{value}</Text>
    </View>
  );

  return (
    <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.lg }} footer={<View style={{ marginHorizontal: -spacing.lg, marginBottom: -8 }}><StaticTabBar active="profile" /></View>}>
      <Text variant="h2" style={{ marginBottom: spacing.md }}>{t("settings.title")}</Text>

      {/* Account */}
      <Card>
        <View style={[styles.account, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Avatar name={account?.full_name} uri={profile.data?.patient?.profile_photo_url} size={48} />
          <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
            <Text variant="title" numberOfLines={1}>{localizedName(account?.full_name ?? "—", account?.full_name_ar, account?.full_name_ar_status, isRTL)}</Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {account?.email ?? "—"}
            </Text>
          </View>
        </View>
      </Card>

      {/* Preferences */}
      <Text variant="label" color="textMuted" style={styles.section}>{t("settings.preferences")}</Text>
      {row(t("settings.language"), locale === "ar" ? "العربية" : "English", () => router.push("/language"))}
      {row(t("settings.appearance"), appearanceValue, () => router.push("/settings/appearance"))}
      {row(t("settings.notifications"), null, () => router.push("/settings/notifications"))}
      {/* Verify / change the mobile number. Verification runs server-side — see
          app/(app)/settings/phone.tsx for why it is not a client updateUser({phone}). */}
      {row(t("phone.title"), null, () => router.push("/settings/phone"))}
      {row(t("settings.medicalHistory"), null, () => router.push("/medical-history"))}

      {/* About (QA MED-022) — the version was previously nowhere in the UI, so a tester or
          support agent had no way to say which build they were looking at. Hidden entirely
          when the config is unreadable rather than showing a placeholder. */}
      {appVersion ? (
        <>
          <Text variant="label" color="textMuted" style={styles.section}>{t("settings.about")}</Text>
          {infoRow(t("settings.appVersion"), appVersion)}
        </>
      ) : null}

      {/* Sign out / delete */}
      <View style={[styles.actions, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View style={{ flex: 1 }}>
          <Button label={t("settings.signOut")} variant="ghost" loading={signOut.isPending} onPress={onSignOut} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t("settings.deleteAccount")}
            variant="destructive"
            loading={deleteAccount.isPending}
            onPress={onDeleteAccount}
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

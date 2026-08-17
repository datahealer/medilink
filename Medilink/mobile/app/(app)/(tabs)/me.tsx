import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Avatar, Button, Icon, type IconName, MeMark, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { useSignOut, useDeleteAccount } from "@/hooks/queries/useAuth";
import { useProfile } from "@/hooks/queries/usePatient";
import { useAuthStore } from "@/stores/authStore";
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

  const guestMode = useAuthStore((s) => s.guestMode);
  const profile = useProfile({ enabled: !guestMode });
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
      titleKey: "meHub.sectionAI",
      items: [
        { key: "ai-symptoms", labelKey: "meHub.aiSymptoms", icon: "ai", onPress: go("/ai/assistant") },
        { key: "ai-schedule", labelKey: "meHub.aiSchedule", icon: "calendar", onPress: go("/ai/schedule") },
        { key: "ai-recommend", labelKey: "meHub.aiRecommend", icon: "people", onPress: go("/ai/recommendations") },
        { key: "ai-insights", labelKey: "meHub.aiInsights", icon: "records", onPress: go("/ai/insights") },
      ],
    },
    {
      titleKey: "meHub.sectionTools",
      items: [
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

  // Guest variant — no account data. Show a sign-in prompt + the account-free
  // preferences a guest is allowed to use (language, theme). Every patient area stays
  // behind the sign-in wall (enforced by the (app) gate), so it is intentionally absent
  // here rather than shown as a dead row.
  if (guestMode) {
    const guestRows: HubItem[] = [
      { key: "language", labelKey: "meHub.language", icon: "language", onPress: go("/language") },
      { key: "theme", labelKey: "meHub.theme", icon: "moon", onPress: go("/settings/appearance") },
    ];
    return (
      <Screen scroll padded edges={["top", "left", "right"]} contentStyle={{ maxWidth: contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: spacing.xxl }}>
        <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.guestAvatar, { backgroundColor: colors.surfaceAlt, borderRadius: radii.xl }]}>
            <MeMark height={26} color={colors.primary} />
          </View>
          <View style={[{ flex: 1 }, isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }]}>
            <Text variant="h2">{t("guest.hello")}</Text>
          </View>
        </View>

        {/* Sign-in prompt */}
        <View style={[styles.guestCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md }]}>
          <Text variant="title" align={isRTL ? "right" : "left"}>{t("guest.wallTitle")}</Text>
          <Text variant="body" color="textMuted" align={isRTL ? "right" : "left"} style={{ marginTop: spacing.xs }}>
            {t("guest.wallBody")}
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button label={t("guest.signInCta")} onPress={() => router.push("/auth/sign-in")} />
            <Button label={t("guest.createAccountCta")} variant="outline" onPress={() => router.push("/auth/sign-up")} />
          </View>
        </View>

        {/* Account-free preferences */}
        <Text variant="label" color="textMuted" style={styles.section}>{t("meHub.sectionSettings")}</Text>
        {guestRows.map(row)}
      </Screen>
    );
  }

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

      {/*
        Profile-load failure. Scoped to the header, NOT the whole screen: the sections
        below are static navigation that works regardless of this query, so the
        full-screen ErrorState used by (tabs)/profile.tsx would be wrong here — it would
        take away working destinations because a name and email failed to load.
        Without this the failure was completely silent: the header just fell back to the
        generic "Me" title and the email row vanished, which is indistinguishable from an
        account that has no name set.
      */}
      {profile.isError ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.loadError,
            {
              flexDirection: isRTL ? "row-reverse" : "row",
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.border,
              borderRadius: radii.md,
            },
          ]}
        >
          <Text variant="caption" color="textMuted" style={styles.flex} align={isRTL ? "right" : "left"}>
            {t("meHub.loadError")}
          </Text>
          <Pressable
            onPress={() => profile.refetch()}
            hitSlop={8}
            disabled={profile.isFetching}
            accessibilityRole="button"
            accessibilityLabel={t("common.retry")}
            style={isRTL ? { marginEnd: spacing.sm } : { marginStart: spacing.sm }}
          >
            <Text variant="caption" weight="700" color={profile.isFetching ? "textMuted" : "primary"}>
              {t("common.retry")}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
  flex: { flex: 1 },
  header: { alignItems: "center", marginBottom: 8 },
  loadError: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    marginBottom: 8,
  },
  guestAvatar: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  guestCard: { borderWidth: StyleSheet.hairlineWidth * 2, padding: 16, marginTop: 8 },
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

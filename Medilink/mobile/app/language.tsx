import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { BackButton, Button, LanguageCard, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { useLocale } from "@/hooks/useLocale";
import { useAuthStore } from "@/stores/authStore";
import type { Locale } from "@/stores/localeStore";
import { canReloadApp, reloadApp } from "@/utils/restart";

/**
 * Language selection. Persists the choice. Switching between EN ↔ AR flips layout
 * direction, which RN only fully applies after a reload — so we confirm a restart.
 */
export default function LanguageScreen() {
  const { spacing, isRTL } = useTheme();
  const { t } = useI18n();
  const { locale } = useLocale();
  const { changeLocale } = useLocale();
  const [selected, setSelected] = useState<Locale>(locale);
  // This screen serves two flows: pre-auth onboarding (continue → sign-in) and an
  // already-signed-in user changing language from Settings. An authed user must be
  // returned to the app with their session intact — never routed to sign-in.
  const isAuthed = useAuthStore((s) => s.status === "authed");

  const proceed = () => {
    if (!isAuthed) {
      router.replace("/auth/sign-in");
      return;
    }
    // Authed (came from Settings): go back to where we came from, keeping the session.
    if (router.canGoBack()) router.back();
    else router.replace("/dashboard");
  };

  const onContinue = () => {
    // Persist the choice. `changeLocale` returns true when this flips the native
    // layout direction (EN ↔ AR). React Native only fully applies an LTR↔RTL flip
    // after the root view is recreated, so a direction change WITHOUT a reload leaves
    // the UI half-mirrored (text switched, layout still in the old direction) — which
    // is exactly the AR→EN bug. So when the direction changes we must reload.
    const directionChanged = changeLocale(selected);
    if (!directionChanged) {
      proceed();
      return;
    }

    if (canReloadApp) {
      // Dev/dev-client build: reload immediately so LTR/RTL applies fully.
      Alert.alert(t("common.restartTitle"), t("common.restartBody"), [
        { text: t("common.restartLater"), style: "cancel", onPress: proceed },
        { text: t("common.restartNow"), onPress: () => reloadApp() },
      ]);
      return;
    }

    // Production build: no programmatic restart available, so guide the user to
    // relaunch manually. The direction is already persisted natively, so the next
    // launch comes up fully in the new direction rather than half-mirrored.
    Alert.alert(t("common.restartTitle"), t("common.restartBody"), [
      { text: t("common.done"), onPress: proceed },
    ]);
  };

  return (
    <Screen scroll padded dismissKeyboardOnTap={false}>
      <View style={[styles.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <BackButton />
      </View>

      <Text variant="h1">{t("language.title")}</Text>
      <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
        {t("language.subtitle")}
      </Text>

      <View style={{ gap: spacing.md }}>
        <LanguageCard
          code="EN"
          label={t("language.english")}
          hint={t("language.englishHint")}
          selected={selected === "en"}
          onPress={() => setSelected("en")}
        />
        <LanguageCard
          code="ع"
          label={t("language.arabic")}
          hint={t("language.arabicHint")}
          labelRTL
          selected={selected === "ar"}
          onPress={() => setSelected("ar")}
        />
      </View>

      <View style={{ height: spacing.xl }} />
      <Button label={t("common.continue")} onPress={onContinue} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 8, marginStart: -8 },
});

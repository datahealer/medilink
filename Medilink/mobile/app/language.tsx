import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { BackButton, Button, LanguageCard, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { useLocale } from "@/hooks/useLocale";
import { useAuthStore } from "@/stores/authStore";
import type { Locale } from "@/stores/localeStore";

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
    // Persist the choice immediately. If this flips layout direction (EN ↔ AR), the
    // RTL change takes effect naturally the next time the app is opened — no restart
    // dialog, no forced restart, no logout. Just save and return the user to where
    // they were (Settings when authed, sign-in during onboarding).
    changeLocale(selected);
    proceed();
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

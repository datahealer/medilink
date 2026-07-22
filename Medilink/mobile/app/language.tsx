import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { BackButton, Button, LanguageCard, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { useLocale } from "@/hooks/useLocale";
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

  const proceed = () => router.replace("/auth/sign-in");

  const onContinue = () => {
    const restartNeeded = changeLocale(selected);
    if (restartNeeded) {
      // Direction changed (EN ↔ AR). Prompt — RTL only fully applies after reload.
      Alert.alert(t("common.restartTitle"), t("common.restartBody"), [
        { text: t("common.restartLater"), style: "cancel", onPress: proceed },
        { text: t("common.restartNow"), onPress: proceed },
      ]);
    } else {
      proceed();
    }
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

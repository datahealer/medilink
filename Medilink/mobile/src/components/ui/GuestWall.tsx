import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/i18n";
import { BackButton } from "./BackButton";
import { Button } from "./Button";
import { MeMark } from "./MeMark";
import { Screen } from "./Screen";
import { Text } from "./Text";

/**
 * F4 Guest Mode — the sign-in wall shown IN PLACE of an authenticated screen when a
 * guest navigates to a protected route. This replaces the old `<Redirect>` to sign-in,
 * which (a) dropped the user onto a bare auth screen with no context and (b) destroyed
 * the navigation stack so Back stopped working. Rendering the wall in place keeps the
 * stack intact — Back returns to whatever the guest was browsing.
 */
export function GuestWall() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { t } = useI18n();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/dashboard"); // guest discovery home
  };

  return (
    <Screen padded edges={["top", "left", "right", "bottom"]}>
      <View style={{ marginBottom: 8, flexDirection: isRTL ? "row-reverse" : "row", ...(isRTL ? { marginEnd: -8 } : { marginStart: -8 }) }}>
        <BackButton onPress={goBack} />
      </View>

      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: colors.surfaceAlt, borderRadius: radii.xl }]}>
          <MeMark height={40} color={colors.primary} />
        </View>
        <Text variant="h1" align="center" style={{ marginTop: spacing.lg }}>
          {t("guest.wallTitle")}
        </Text>
        <Text variant="body" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
          {t("guest.wallBody")}
        </Text>
      </View>

      <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        <Button label={t("guest.signInCta")} onPress={() => router.push("/auth/sign-in")} />
        <Button
          label={t("guest.createAccountCta")}
          variant="outline"
          onPress={() => router.push("/auth/sign-up")}
        />
        <Button label={t("guest.keepBrowsing")} variant="ghost" onPress={goBack} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  badge: { width: 96, height: 96, alignItems: "center", justifyContent: "center" },
});

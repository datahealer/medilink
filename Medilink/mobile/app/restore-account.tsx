import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Button, Icon, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { useCancelDeletion, useSignOut } from "@/hooks/queries/useAuth";

/**
 * Restore-only screen for an account inside the 30-day deletion grace window
 * (QA MED-016 / NEW-001).
 *
 * Requesting deletion used to change `profiles.status` and nothing else: the session stayed
 * valid, sign-in still worked, and every screen kept rendering patient data. This screen is
 * the ONLY destination such an account can reach — the `(app)` gate redirects here before
 * any patient route mounts.
 *
 * NO PHI ON THIS SCREEN, BY CONSTRUCTION. It renders static translated copy and two buttons.
 * It reads no name, no appointment, no record, not even the account's email — nothing that
 * would leak data the RLS policy is busy denying. The only account fact it consumes is the
 * status that routed the user here, and that is read by the gate, not re-read here.
 *
 * It deliberately lives at the ROOT of the route tree, not under `(app)`: `(app)`'s gate is
 * what redirects here, so hosting the screen inside that group would be a redirect loop.
 * It is not under `auth/` either, because reaching it REQUIRES a valid session — it is a
 * signed-in screen with a restricted surface, not part of the sign-in flow.
 */
export default function RestoreAccountScreen() {
  const { colors, spacing, radii } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const cancelDeletion = useCancelDeletion();
  const signOut = useSignOut();
  const [error, setError] = useState<string | null>(null);

  const onRestore = () => {
    setError(null);
    cancelDeletion.mutate(undefined, {
      onSuccess: (res) => {
        if (!res.ok) {
          setError(t(res.messageKey ?? "errors.unknown"));
          return;
        }
        // The account is active again. Replace rather than push so the restore screen cannot
        // be reached with Back, and land on the dashboard — the gate re-checks status on the
        // way in, so a failed restore cannot slip through here.
        router.replace("/(app)/(tabs)/dashboard");
      },
      onError: () => setError(t("errors.unknown")),
    });
  };

  const onSignOut = () => {
    signOut.mutate(undefined, {
      onSettled: () => router.replace("/auth/sign-in"),
    });
  };

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <View style={[styles.wrap, { gap: spacing.lg, paddingTop: spacing.xl }]}>
        <View
          style={[
            styles.badge,
            { backgroundColor: colors.errorSurface, borderRadius: radii.lg },
          ]}
        >
          <Icon name="alert" size={40} color="error" />
        </View>

        <Text variant="h2" style={{ textAlign: "center" }}>
          {t("restoreAccount.title")}
        </Text>

        <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>
          {t("restoreAccount.body")}
        </Text>

        <Text variant="caption" color="textMuted" style={{ textAlign: "center" }}>
          {t("restoreAccount.note")}
        </Text>

        {error ? (
          <Text variant="caption" color="error" style={{ textAlign: "center" }}>
            {error}
          </Text>
        ) : null}

        <View style={{ gap: spacing.sm, width: "100%" }}>
          <Button
            label={t("restoreAccount.restore")}
            onPress={onRestore}
            loading={cancelDeletion.isPending}
            disabled={signOut.isPending}
          />
          <Button
            label={t("restoreAccount.signOut")}
            variant="outline"
            onPress={onSignOut}
            loading={signOut.isPending}
            disabled={cancelDeletion.isPending}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", width: "100%" },
  badge: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
});

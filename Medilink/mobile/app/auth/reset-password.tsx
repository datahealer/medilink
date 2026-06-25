import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { BackButton, Button, PasswordField, Screen, Text } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { authService } from "@/services/authService";
import { passwordStrength, resetSchema, type ResetForm } from "@/utils/validation";

export default function ResetPasswordScreen() {
  const { colors, spacing, radii, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema(t)),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  const password = watch("password");
  const { score, labelKey } = passwordStrength(password ?? "");
  const meterColor = score <= 1 ? colors.error : score === 2 ? colors.warning : score === 3 ? colors.info : colors.success;

  const onSubmit = async (values: ResetForm) => {
    setFormError(null);
    setLoading(true);
    // Succeeds only inside a recovery session (deep link from the reset email).
    const res = await authService.resetPassword(values.password);
    setLoading(false);
    if (res.ok) {
      Alert.alert(t("reset.title"), undefined, [
        { text: "OK", onPress: () => router.replace("/auth/sign-in") },
      ]);
    } else {
      setFormError(t(res.messageKey ?? "errors.unknown"));
    }
  };

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <View style={{ marginBottom: 8, marginStart: -8 }}>
        <BackButton />
      </View>

      <Text variant="h1">{t("reset.title")}</Text>
      <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
        {t("reset.subtitle")}
      </Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordField
            label={t("reset.newPassword")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
            containerStyle={{ marginBottom: spacing.sm }}
          />
        )}
      />

      {/* Strength meter */}
      {password ? (
        <View style={{ marginBottom: spacing.md }}>
          <View style={[styles.meterRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  { borderRadius: radii.pill, backgroundColor: i < score ? meterColor : colors.border },
                ]}
              />
            ))}
          </View>
          <Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>
            {t("reset.strength")}: {t(labelKey)}
          </Text>
        </View>
      ) : null}

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordField
            label={t("reset.confirmPassword")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.confirmPassword?.message}
          />
        )}
      />

      {formError ? (
        <Text variant="caption" color="error" align="center" style={{ marginTop: spacing.md }} accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <Button label={t("reset.submit")} loading={loading} onPress={handleSubmit(onSubmit)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meterRow: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 5 },
});

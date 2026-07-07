import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { BackButton, Button, Screen, Text, TextField } from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { authService } from "@/services/authService";
import { forgotSchema, type ForgotForm } from "@/utils/validation";

export default function ForgotPasswordScreen() {
  const { spacing } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema(t)),
    defaultValues: { identifier: "" },
    mode: "onBlur",
  });

  const onSubmit = async (values: ForgotForm) => {
    setFormError(null);
    setLoading(true);
    // Real Supabase reset email. Completing the reset requires opening the email
    // link (recovery session) — see docs/MOBILE_HAMS_API_AUDIT.md.
    const res = await authService.requestPasswordReset(values.identifier);
    setLoading(false);
    if (res.ok) setSent(true);
    else setFormError(t(res.messageKey ?? "errors.unknown"));
  };

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <View style={{ marginBottom: 8, marginStart: -8 }}>
        <BackButton />
      </View>

      <Text variant="h1">{sent ? t("forgot.emailSentTitle") : t("forgot.title")}</Text>
      <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
        {sent ? t("forgot.emailSent") : t("forgot.subtitle")}
      </Text>

      {!sent ? (
        <>
          <Controller
            control={control}
            name="identifier"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t("forgot.field")}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.identifier?.message}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
              />
            )}
          />

          {formError ? (
            <Text variant="caption" color="error" align="center" style={{ marginTop: spacing.md }} accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}

          <View style={{ height: spacing.lg }} />
          <Button label={t("forgot.submit")} loading={loading} onPress={handleSubmit(onSubmit)} />
        </>
      ) : null}

      <View style={styles.footer}>
        <Pressable onPress={() => router.replace("/auth/sign-in")} hitSlop={8} accessibilityRole="link">
          <Text variant="label" color="primary">
            {t("forgot.backToSignIn")}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: "center", marginTop: 24 },
});

import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  BackButton,
  Button,
  Checkbox,
  PasswordField,
  PhoneField,
  Screen,
  Text,
  TextField,
} from "@/components/ui";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { authService } from "@/services/authService";
import { signUpSchema, type SignUpForm } from "@/utils/validation";

const DIAL_CODE = "+968";

export default function SignUpScreen() {
  const { spacing, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema(t)),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      acceptTerms: false as unknown as true,
    },
    mode: "onBlur",
  });

  const onSubmit = async (values: SignUpForm) => {
    setFormError(null);
    setLoading(true);
    const res = await authService.signUp({
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      dialCode: DIAL_CODE,
      password: values.password,
    });
    setLoading(false);
    if (res.ok) {
      // Verify the phone next (matches the backend's post-signup OTP flow).
      // `phone` carries the raw E.164 number for resend/verify; `target` is the display string.
      router.push({
        pathname: "/auth/otp",
        params: {
          target: `${DIAL_CODE} ${values.phone}`,
          phone: `${DIAL_CODE}${values.phone}`,
        },
      });
    } else {
      setFormError(t(res.messageKey ?? "errors.unknown"));
    }
  };

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <View style={{ marginBottom: 8, marginStart: -8 }}>
        <BackButton />
      </View>

      <Text variant="h1">{t("signUp.title")}</Text>
      <View style={{ height: spacing.lg }} />

      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label={t("signUp.fullName")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.fullName?.message}
            autoComplete="name"
            textContentType="name"
            containerStyle={{ marginBottom: spacing.md }}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label={t("signUp.email")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            containerStyle={{ marginBottom: spacing.md }}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, onBlur, value } }) => (
          <PhoneField
            label={t("signUp.phone")}
            dialCode={DIAL_CODE}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.phone?.message}
            placeholder="9000 0000"
            containerStyle={{ marginBottom: spacing.md }}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordField
            label={t("signUp.password")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
          />
        )}
      />

      <View style={{ height: spacing.md }} />
      <Controller
        control={control}
        name="acceptTerms"
        render={({ field: { onChange, value } }) => (
          <Checkbox
            checked={!!value}
            onChange={onChange}
            label={t("signUp.terms")}
            error={!!errors.acceptTerms}
          />
        )}
      />
      {errors.acceptTerms ? (
        <Text variant="caption" color="error" style={{ marginTop: 4 }}>
          {errors.acceptTerms.message}
        </Text>
      ) : null}

      {formError ? (
        <Text variant="caption" color="error" align="center" style={{ marginTop: spacing.md }} accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <Button label={t("signUp.submit")} loading={loading} onPress={handleSubmit(onSubmit)} />

      <View style={[styles.footer, { marginTop: spacing.lg, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text variant="body" color="textMuted">
          {t("signUp.haveAccount")}{" "}
        </Text>
        <Pressable onPress={() => router.replace("/auth/sign-in")} hitSlop={8} accessibilityRole="link">
          <Text variant="label" color="primary">
            {t("signUp.signIn")}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { justifyContent: "center", alignItems: "center" },
});

import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";

import {
  BackButton,
  Button,
  Checkbox,
  PasswordField,
  Screen,
  Text,
  TextField,
} from "@/components/ui";
import { isGoogleConfigured } from "@/config/env";
import { repositories, isMockData } from "@/data";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import { useI18n } from "@/i18n";
import { signInSchema, type SignInForm } from "@/utils/validation";

export default function SignInScreen() {
  const { colors, spacing, isRTL } = useTheme();
  const { formMaxWidth } = useResponsive();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema(t)),
    defaultValues: { email: "", password: "", remember: false },
    mode: "onBlur",
  });

  const onSubmit = async (values: SignInForm) => {
    if (__DEV__) console.log("[MediLink] sign-in button pressed");
    setFormError(null);
    setLoading(true);
    try {
      // Route through the active repository (mock in DATA_MODE=mock, real otherwise) —
      // never call the backend transport directly, so mock mode stays offline.
      const res = await repositories.auth.signIn(values);
      if (res.ok) {
        if (__DEV__ && isMockData) console.log("[MediLink] mock sign-in success");
        router.replace("/dashboard");
      } else {
        setFormError(t(res.messageKey ?? "errors.unknown"));
      }
    } catch (error) {
      console.error(
        "[MediLink] sign-in failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      setFormError(t("errors.unknown"));
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = () => {
    // Honest disabled state — no fake success (see audit: no Google login endpoint).
    setFormError(t("errors.googleNotConfigured"));
  };

  return (
    <Screen scroll padded contentStyle={{ maxWidth: formMaxWidth, width: "100%", alignSelf: "center" }}>
      <View style={[styles.header, { marginStart: -8 }]}>
        <BackButton />
      </View>

      <Text variant="h1">{t("signIn.welcomeBack")}</Text>
      <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
        {t("signIn.subtitle")}
      </Text>

      {/* Dev-only: shown only when running on mock data (DATA_MODE=mock). */}
      {isMockData ? (
        <View
          style={[
            styles.demoBanner,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <Ionicons name="flask-outline" size={16} color={colors.primary} />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            Demo mode: use demo@medilink.test / Demo1234!
          </Text>
        </View>
      ) : null}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label={t("signIn.email")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="name@example.com"
            containerStyle={{ marginBottom: spacing.md }}
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordField
            label={t("signIn.password")}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
            placeholder="••••••••"
          />
        )}
      />

      <View style={[styles.rowBetween, { marginTop: spacing.md, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Controller
          control={control}
          name="remember"
          render={({ field: { onChange, value } }) => (
            <View style={{ flex: 1 }}>
              <Checkbox checked={!!value} onChange={onChange} label={t("signIn.remember")} />
            </View>
          )}
        />
        <Pressable onPress={() => router.push("/auth/forgot-password")} hitSlop={8} accessibilityRole="link">
          <Text variant="label" color="primary">
            {t("signIn.forgot")}
          </Text>
        </Pressable>
      </View>

      <View style={{ height: spacing.lg }} />
      <Button label={t("signIn.submit")} loading={loading} onPress={handleSubmit(onSubmit)} />

      {/* Visible error box directly under the Login button. */}
      {formError ? (
        <View
          style={[styles.errorBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.error }]}
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Text variant="caption" color="error" style={{ flex: 1 }}>
            {formError}
          </Text>
        </View>
      ) : null}

      {/* divider */}
      <View style={[styles.divider, { marginVertical: spacing.lg }]}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text variant="caption" color="textMuted" style={{ marginHorizontal: 12 }}>
          {t("signIn.or")}
        </Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      <Button
        label={t("signIn.google")}
        variant="outline"
        disabled={!isGoogleConfigured}
        onPress={onGoogle}
        leading={<Ionicons name="logo-google" size={18} color={colors.primary} />}
      />
      {!isGoogleConfigured ? (
        <Text variant="caption" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
          {t("errors.googleNotConfigured")}
        </Text>
      ) : null}

      {/* Apple sign-in (PDF p12). Disabled until an Apple provider is configured —
          we never fake auth (see audit). */}
      <View style={{ height: spacing.sm }} />
      <Button
        label={t("signIn.apple")}
        variant="outline"
        disabled
        onPress={() => {}}
        leading={<Ionicons name="logo-apple" size={18} color={colors.primary} />}
      />

      <View style={[styles.footer, { marginTop: spacing.xl, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Text variant="body" color="textMuted">
          {t("signIn.noAccount")}{" "}
        </Text>
        <Pressable onPress={() => router.replace("/auth/sign-up")} hitSlop={8} accessibilityRole="link">
          <Text variant="label" color="primary">
            {t("signIn.createOne")}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 8 },
  rowBetween: { alignItems: "center", justifyContent: "space-between" },
  divider: { flexDirection: "row", alignItems: "center" },
  line: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  footer: { justifyContent: "center", alignItems: "center" },
  demoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
});
